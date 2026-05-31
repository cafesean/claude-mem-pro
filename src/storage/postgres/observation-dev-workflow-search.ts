// SPDX-License-Identifier: Apache-2.0

/**
 * Search filters for dev_workflow-enriched observations — Phase 1.7.
 *
 * Operates on the existing `observations.metadata` JSONB column. No
 * schema migration required: dev_workflow payloads live under the
 * `metadata.dev_workflow` JSON path, so Postgres JSONB operators do
 * the filtering work.
 *
 * This module returns a SQL fragment + bind-parameter array that
 * callers can splice into existing query builders (the observation
 * repository's listByProject, search, etc.). No live query execution
 * here — keeps the helper testable without a Postgres dependency.
 */

import type { DevWorkflowKind } from '../../core/schemas/dev-workflow-kind.js';

export interface DevWorkflowSearchFilters {
  /** Match observations whose dev_workflow.kind is in this set. */
  kinds?: readonly DevWorkflowKind[];
  /** Match observations whose dev_workflow.topics array contains any of these. */
  anyTopic?: readonly string[];
  /** Match observations whose dev_workflow.topics array contains ALL of these. */
  allTopics?: readonly string[];
  /** Match observations whose dev_workflow.applies_to array contains any of these. */
  anyAppliesTo?: readonly string[];
  /** For lessons: confidence enum filter. */
  confidence?: 'confirmed' | 'hypothesis';
  /** For architecture_issue: status enum filter. */
  archStatus?: ReadonlyArray<
    'resolved' | 'workaround-applied' | 'known-limitation' | 'unresolved' | 'investigating'
  >;
  /** For sdk_note: package filter. */
  sdkPackage?: readonly string[];
}

export interface BuiltClause {
  /** SQL boolean expression. Empty string when no filters were applied. */
  sql: string;
  /** Parameter values, in $N order. */
  params: unknown[];
}

export interface BuildOptions {
  /** Column name holding the JSONB metadata. Default 'metadata'. */
  metadataColumn?: string;
  /** Starting $N index for bind params. Default 1. */
  startParamIndex?: number;
  /** When true and no filters supplied, also require dev_workflow key exists. */
  requireDevWorkflowKey?: boolean;
}

const DEFAULT_OPTIONS: Required<BuildOptions> = {
  metadataColumn: 'metadata',
  startParamIndex: 1,
  requireDevWorkflowKey: false
};

/**
 * Build a SQL WHERE-clause fragment + params for the given filters.
 *
 * Example output (one kind, two anyTopic):
 *   sql:    "(metadata->'dev_workflow'->>'kind' = ANY($1)
 *              AND metadata->'dev_workflow'->'topics' ?| $2::text[])"
 *   params: [['lesson'], ['rls', 'caching']]
 */
export function buildDevWorkflowWhere(
  filters: DevWorkflowSearchFilters,
  options: BuildOptions = {}
): BuiltClause {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const m = opts.metadataColumn;
  const root = `${m}->'dev_workflow'`;

  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = opts.startParamIndex;

  const push = (value: unknown): number => {
    params.push(value);
    return idx++;
  };

  if (filters.kinds?.length) {
    const p = push([...filters.kinds]);
    parts.push(`${root}->>'kind' = ANY($${p}::text[])`);
  }

  if (filters.anyTopic?.length) {
    const p = push([...filters.anyTopic]);
    parts.push(`${root}->'topics' ?| $${p}::text[]`);
  }

  if (filters.allTopics?.length) {
    const p = push([...filters.allTopics]);
    parts.push(`${root}->'topics' ?& $${p}::text[]`);
  }

  if (filters.anyAppliesTo?.length) {
    const p = push([...filters.anyAppliesTo]);
    parts.push(`${root}->'applies_to' ?| $${p}::text[]`);
  }

  if (filters.confidence) {
    const p = push(filters.confidence);
    parts.push(`${root}->>'confidence' = $${p}`);
  }

  if (filters.archStatus?.length) {
    const p = push([...filters.archStatus]);
    parts.push(`${root}->>'status' = ANY($${p}::text[])`);
  }

  if (filters.sdkPackage?.length) {
    const p = push([...filters.sdkPackage]);
    parts.push(`${root}->>'sdk_package' = ANY($${p}::text[])`);
  }

  if (parts.length === 0) {
    if (opts.requireDevWorkflowKey) {
      return { sql: `${m} ? 'dev_workflow'`, params: [] };
    }
    return { sql: '', params: [] };
  }

  return { sql: `(${parts.join(' AND ')})`, params };
}

/**
 * Compose a search filter clause with the standard project + team scope
 * predicate. Convenience helper for the repository layer when it adopts
 * the new filters.
 */
export function buildScopedDevWorkflowSelect(
  filters: DevWorkflowSearchFilters,
  scope: { projectId: string; teamId: string; limit?: number },
  options: BuildOptions = {}
): { sql: string; params: unknown[] } {
  const where = buildDevWorkflowWhere(filters, { ...options, startParamIndex: 3 });
  const baseParams: unknown[] = [scope.projectId, scope.teamId];
  const limit = scope.limit ?? 100;
  const limitIdx = baseParams.length + where.params.length + 1;

  const whereSql = where.sql
    ? `AND ${where.sql}`
    : '';

  return {
    sql: `
      SELECT * FROM observations
      WHERE project_id = $1
        AND team_id = $2
        ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${limitIdx}
    `.trim(),
    params: [...baseParams, ...where.params, limit]
  };
}
