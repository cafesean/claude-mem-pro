// SPDX-License-Identifier: Apache-2.0

/**
 * MutationStore — lightweight log of durable mutations (the agent changed the
 * world: a file write to a real path, or an external-system tool call like
 * Notion/Jira/Shopify). Distinct from observations: no LLM, no narrative —
 * just a mechanical record of WHAT changed, for cross-session recall.
 *
 * Self-contained: creates its own table idempotently, so no migration-runner
 * change is needed. Takes a bun:sqlite Database handle (shared with SessionStore).
 */

export interface DatabaseLike {
  run(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number };
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
}

export interface MutationRecord {
  toolName: string;
  /** Best-effort target: file path, command, or external entity. */
  target: string | null;
  /** Mutation verb fragment (commit, update, create…), best-effort. */
  verb: string | null;
  project: string;
  contentSessionId: string;
  /** Optional compact summary of the tool input (already tag-stripped). */
  detail?: string | null;
  createdAtEpoch: number;
}

export interface MutationRow extends MutationRecord {
  id: number;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS mutations (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_name          TEXT    NOT NULL,
    target             TEXT,
    verb               TEXT,
    project            TEXT    NOT NULL,
    content_session_id TEXT    NOT NULL,
    detail             TEXT,
    created_at_epoch   INTEGER NOT NULL
  )
`;
const CREATE_IDX_PROJECT = `CREATE INDEX IF NOT EXISTS idx_mutations_project ON mutations(project)`;
const CREATE_IDX_CREATED = `CREATE INDEX IF NOT EXISTS idx_mutations_created ON mutations(created_at_epoch DESC)`;

export class MutationStore {
  constructor(private readonly db: DatabaseLike) {
    this.db.run(CREATE_TABLE);
    this.db.run(CREATE_IDX_PROJECT);
    this.db.run(CREATE_IDX_CREATED);
  }

  insert(rec: MutationRecord): number {
    const res = this.db
      .prepare(
        `INSERT INTO mutations
          (tool_name, target, verb, project, content_session_id, detail, created_at_epoch)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rec.toolName,
        rec.target,
        rec.verb,
        rec.project,
        rec.contentSessionId,
        rec.detail ?? null,
        rec.createdAtEpoch,
      );
    return Number(res.lastInsertRowid);
  }

  /** Recent mutations for a project, newest first. */
  recentByProject(project: string, limit = 50): MutationRow[] {
    return this.db
      .prepare(
        `SELECT id, tool_name AS toolName, target, verb, project,
                content_session_id AS contentSessionId, detail, created_at_epoch AS createdAtEpoch
         FROM mutations WHERE project = ?
         ORDER BY created_at_epoch DESC LIMIT ?`,
      )
      .all(project, limit) as MutationRow[];
  }

  countByProject(project: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM mutations WHERE project = ?`)
      .get(project) as { c: number } | undefined;
    return row?.c ?? 0;
  }
}

/** Pull the mutation verb out of a tool name / command for the `verb` column. */
export function extractVerb(toolName: string, command?: string | null): string | null {
  const m = `${toolName} ${command ?? ''}`.match(
    /\b(commit|push|tag|merge|update|create|write|edit|delete|remove|insert|patch|put|post|send|publish|upsert|add|set|move|rename)\b/i,
  );
  return m ? m[1].toLowerCase() : null;
}
