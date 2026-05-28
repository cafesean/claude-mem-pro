// SPDX-License-Identifier: Apache-2.0

/**
 * SQLite read/write adapter for claude-mem local observations DB.
 *
 * Reads the legacy `observations` table at ~/.claude-mem/claude-mem.db
 * and converts rows into a shape consumable by the dev-workflow
 * enrichment service. Optionally writes `dev_workflow` payloads back
 * into the `metadata` JSON column for backfill + live-tail use.
 *
 * Schema (as of claude-mem v13.3):
 *   id INTEGER PK
 *   memory_session_id TEXT
 *   project TEXT
 *   type TEXT                  -- existing observation kind
 *   title, subtitle, narrative TEXT
 *   text TEXT
 *   facts TEXT (JSON array)
 *   concepts TEXT (JSON array)
 *   files_read TEXT (JSON array)
 *   files_modified TEXT (JSON array)
 *   metadata TEXT (JSON object, nullable) — dev_workflow goes here
 *   prompt_number INTEGER
 *   created_at, created_at_epoch
 *   agent_type, agent_id
 */

// Use node:sqlite (Node 22+ built-in) so the CLI can run under the Node
// entrypoint without bringing in bun:sqlite. Cast to a minimal shape so
// strict tsc does not complain about the experimental module typing.
type DatabaseLike = {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
  close(): void;
};
let DatabaseSyncCtor: new (path: string, options?: { readOnly?: boolean }) => DatabaseLike;
try {
  const mod = await import('node:sqlite');
  DatabaseSyncCtor = (mod as unknown as { DatabaseSync: typeof DatabaseSyncCtor }).DatabaseSync;
} catch (err) {
  throw new Error('node:sqlite unavailable — requires Node 22+. Run with: node --experimental-sqlite');
}

import type { DetectorEvent } from '../../server/generation/dev-workflow-prompts/kind-detector.js';

const DEFAULT_DB_PATH = `${process.env.HOME}/.claude-mem/claude-mem.db`;

export interface SqliteObservationRow {
  id: number;
  memory_session_id: string;
  project: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  text: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  metadata: string | null;
  prompt_number: number | null;
  created_at: string;
  created_at_epoch: number;
  agent_type: string | null;
}

export interface ParsedObservation extends Omit<SqliteObservationRow, 'facts' | 'concepts' | 'files_read' | 'files_modified' | 'metadata'> {
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
  metadata: Record<string, unknown> | null;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function toParsedObservation(row: SqliteObservationRow): ParsedObservation {
  return {
    ...row,
    facts: parseJsonArray(row.facts),
    concepts: parseJsonArray(row.concepts),
    files_read: parseJsonArray(row.files_read),
    files_modified: parseJsonArray(row.files_modified),
    metadata: parseJsonObject(row.metadata)
  };
}

/**
 * Adapter for the SQLite observations table. Owns no LLM logic — just
 * SQL + JSON encoding/decoding.
 */
export class SqliteObservationAdapter {
  private readonly db: DatabaseLike;
  public readonly dbPath: string;

  constructor(dbPath: string = DEFAULT_DB_PATH, options: { readonly?: boolean } = {}) {
    this.dbPath = dbPath;
    this.db = new DatabaseSyncCtor(dbPath, { readOnly: options.readonly ?? false });
  }

  close(): void {
    this.db.close();
  }

  countObservations(opts: { sessionId?: string; project?: string } = {}): number {
    const filters: string[] = [];
    const params: unknown[] = [];
    if (opts.sessionId) {
      filters.push('memory_session_id = ?');
      params.push(opts.sessionId);
    }
    if (opts.project) {
      filters.push('project = ?');
      params.push(opts.project);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM observations ${where}`).get(...params) as { c: number };
    return row.c;
  }

  listSessions(limit = 50): Array<{
    sessionId: string;
    project: string;
    observationCount: number;
    earliestEpoch: number;
    latestEpoch: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT memory_session_id AS sessionId, project,
                COUNT(*) AS observationCount,
                MIN(created_at_epoch) AS earliestEpoch,
                MAX(created_at_epoch) AS latestEpoch
         FROM observations
         GROUP BY memory_session_id
         ORDER BY MAX(created_at_epoch) DESC
         LIMIT ?`
      )
      .all(limit);
    return rows as never;
  }

  forEachObservation(
    opts: {
      sessionId?: string;
      project?: string;
      sinceEpoch?: number;
      withoutDevWorkflow?: boolean;
      limit?: number;
    } = {},
    visitor: (observation: ParsedObservation) => void | Promise<void>
  ): Promise<void> {
    const filters: string[] = [];
    const params: unknown[] = [];
    if (opts.sessionId) {
      filters.push('memory_session_id = ?');
      params.push(opts.sessionId);
    }
    if (opts.project) {
      filters.push('project = ?');
      params.push(opts.project);
    }
    if (typeof opts.sinceEpoch === 'number') {
      filters.push('created_at_epoch > ?');
      params.push(opts.sinceEpoch);
    }
    if (opts.withoutDevWorkflow) {
      filters.push("(metadata IS NULL OR json_extract(metadata, '$.dev_workflow') IS NULL)");
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limit = opts.limit ? `LIMIT ${Math.max(1, Math.min(50_000, opts.limit))}` : '';
    const sql = `SELECT * FROM observations ${where} ORDER BY created_at_epoch ASC ${limit}`;
    const rows = this.db.prepare(sql).all(...params) as SqliteObservationRow[];
    return rows.reduce<Promise<void>>(async (chain, row) => {
      await chain;
      await visitor(toParsedObservation(row));
    }, Promise.resolve());
  }

  fetchObservations(opts: {
    sessionId?: string;
    project?: string;
    limit?: number;
  } = {}): ParsedObservation[] {
    const filters: string[] = [];
    const params: unknown[] = [];
    if (opts.sessionId) {
      filters.push('memory_session_id = ?');
      params.push(opts.sessionId);
    }
    if (opts.project) {
      filters.push('project = ?');
      params.push(opts.project);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limit = opts.limit ? `LIMIT ${Math.max(1, Math.min(50_000, opts.limit))}` : '';
    const sql = `SELECT * FROM observations ${where} ORDER BY created_at_epoch ASC ${limit}`;
    const rows = this.db.prepare(sql).all(...params) as SqliteObservationRow[];
    return rows.map(toParsedObservation);
  }

  /**
   * Write a dev_workflow payload back into the observations.metadata column
   * for a given observation id. Existing metadata keys are preserved.
   */
  writeDevWorkflowMetadata(
    observationId: number,
    payload: Record<string, unknown>
  ): void {
    const existing = this.db.prepare('SELECT metadata FROM observations WHERE id = ?').get(observationId) as
      | { metadata: string | null }
      | undefined;
    if (!existing) return;
    const merged = {
      ...(parseJsonObject(existing.metadata) ?? {}),
      dev_workflow: payload
    };
    this.db.prepare('UPDATE observations SET metadata = ? WHERE id = ?').run(JSON.stringify(merged), observationId);
  }

  /** Lookup the most recent observation epoch — useful for live tail polling. */
  latestEpoch(): number | null {
    const row = this.db.prepare('SELECT MAX(created_at_epoch) AS latest FROM observations').get() as
      | { latest: number | null }
      | undefined;
    return row?.latest ?? null;
  }
}

// ---------------------------------------------------------------------------
// Mapper helpers
// ---------------------------------------------------------------------------

export function buildDetectorEvent(observation: ParsedObservation): DetectorEvent {
  const titleText = [observation.title, observation.subtitle].filter(Boolean).join(' — ');
  const narrative = observation.narrative ?? observation.text ?? titleText;
  return {
    narrative,
    toolName: observation.agent_type ?? undefined,
    filesModified: observation.files_modified,
    filesRead: observation.files_read,
    agentText: observation.facts.join('\n')
  };
}

export function summariseObservationForContext(observation: ParsedObservation): string {
  const parts = [
    observation.title ?? observation.type,
    observation.subtitle,
    observation.narrative
  ].filter(Boolean);
  return parts.join(' :: ').slice(0, 400);
}
