// SPDX-License-Identifier: Apache-2.0
import type { SessionStore } from '../sqlite/SessionStore.js';
import type { ChromaSync } from '../sync/ChromaSync.js';
import type { ParsedObservation } from '../../sdk/parser.js';
import { getProjectContext } from '../../utils/project-name.js';
import { logger } from '../../utils/logger.js';

export const GLOBAL_PROJECT = '__global__';
export const MUST_KNOW_TYPE = 'must_know';

export interface CreateFactInput {
  cwd: string;
  scope: 'project' | 'global';
  title: string;
  content: string;
}

export interface TrainingFact {
  id: number;
  title: string;
  content: string;
  scope: 'project' | 'global';
  active: boolean;
  project: string;
  created_at_epoch: number;
}

function resolveProject(scope: 'project' | 'global', cwd: string): string {
  return scope === 'global' ? GLOBAL_PROJECT : getProjectContext(cwd).primary;
}

export async function createTrainingFact(
  sessionStore: SessionStore,
  chromaSync: ChromaSync | null | undefined,
  input: CreateFactInput,
): Promise<{ id: number; project: string }> {
  const project = resolveProject(input.scope, input.cwd);
  const memorySessionId = sessionStore.getOrCreateManualSession(project);

  const observation = {
    type: MUST_KNOW_TYPE,
    title: input.title,
    subtitle: null as string | null,
    facts: [] as string[],
    narrative: input.content,
    concepts: [MUST_KNOW_TYPE],
    files_read: [] as string[],
    files_modified: [] as string[],
    agent_type: 'training' as string | null,
    agent_id: null as string | null,
    metadata: JSON.stringify({ scope: input.scope, source: 'training', active: true }),
  };

  const stored = sessionStore.storeObservation(memorySessionId, project, observation);

  if (chromaSync) {
    const parsed: ParsedObservation = {
      type: observation.type,
      title: observation.title,
      subtitle: observation.subtitle,
      facts: observation.facts,
      narrative: observation.narrative,
      concepts: observation.concepts,
      files_read: observation.files_read,
      files_modified: observation.files_modified,
    };
    try {
      await chromaSync.syncObservation(stored.id, memorySessionId, project, parsed, 0, stored.createdAtEpoch, 0);
    } catch (err) {
      logger.warn('TRAINING', `Chroma sync failed for fact id=${stored.id}: ${(err as Error).message?.slice(0, 200)}`);
    }
  }

  return { id: stored.id, project };
}

export function listTrainingFacts(
  sessionStore: SessionStore,
  opts: { project: string; includeGlobal: boolean },
): TrainingFact[] {
  const projects = opts.includeGlobal ? [opts.project, GLOBAL_PROJECT] : [opts.project];
  const placeholders = projects.map(() => '?').join(',');
  const rows = sessionStore.db
    .prepare(
      `SELECT id, title, narrative, metadata, project, created_at_epoch
       FROM observations
       WHERE type = ? AND project IN (${placeholders})
       ORDER BY created_at_epoch DESC`,
    )
    .all(MUST_KNOW_TYPE, ...projects) as Array<{
      id: number; title: string | null; narrative: string | null;
      metadata: string | null; project: string; created_at_epoch: number;
    }>;

  return rows
    .map((r) => {
      let meta: Record<string, unknown> = {};
      if (r.metadata) { try { meta = JSON.parse(r.metadata); } catch { /* ignore */ } }
      const active = meta.active !== false;
      return {
        id: r.id,
        title: r.title ?? '',
        content: r.narrative ?? '',
        scope: (meta.scope === 'global' ? 'global' : 'project') as 'project' | 'global',
        active,
        project: r.project,
        created_at_epoch: r.created_at_epoch,
      };
    })
    .filter((f) => f.active);
}

export function retireTrainingFact(sessionStore: SessionStore, id: number): void {
  sessionStore.updateObservationMetadataPatch(id, { active: false });
}
