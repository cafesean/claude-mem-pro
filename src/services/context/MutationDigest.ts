// SPDX-License-Identifier: Apache-2.0

/**
 * MutationDigest — the new injected-context body. Instead of dumping the
 * observation + session_summary index (process-narrative noise), inject a
 * compact digest of durable MUTATIONS (what actually changed last sessions)
 * grouped by day, plus a pointer to the `recall` skill for deeper lookup.
 *
 * Reads the `mutations` table directly (shared bun:sqlite handle). No LLM.
 */

interface MutationDigestRow {
  tool_name: string;
  target: string | null;
  verb: string | null;
  created_at_epoch: number;
}

interface DbLike {
  prepare(sql: string): { all(...p: unknown[]): unknown[] };
}

/** Shorten a target path/string for one-line display. */
function shortTarget(target: string | null): string {
  if (!target) return '';
  // collapse to first line (defensive: never let a multi-line target in)
  let t = target.split('\n')[0];
  // strip noisy absolute prefixes; keep the meaningful tail
  t = t
    .replace(/^\/Volumes\/[^/]+\/code\/(monorepo|ai)\//, '')
    .replace(/^.*\/\.claude\/plugins\/[^/]+\//, '')
    .replace(/^\/Volumes\/HD\/code\//, '');
  if (t.length > 70) t = '…' + t.slice(-69);
  return t;
}

function dayLabel(epoch: number): string {
  // YYYY-MM-DD in local time, cheaply
  return new Date(epoch).toISOString().slice(0, 10);
}

/**
 * Build the mutation-digest lines for a project. Newest day first; within a
 * day, grouped, deduped by (verb, target). Returns [] when no mutations.
 */
export function renderMutationDigest(
  db: DbLike,
  projects: string[],
  limit = 60,
): string[] {
  if (projects.length === 0) return [];
  const placeholders = projects.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT tool_name, target, verb, created_at_epoch
       FROM mutations
       WHERE project IN (${placeholders})
       ORDER BY created_at_epoch DESC
       LIMIT ?`,
    )
    .all(...projects, limit) as MutationDigestRow[];

  if (rows.length === 0) return [];

  const out: string[] = [];
  out.push('## Recent changes (durable mutations)');
  out.push('');

  let currentDay = '';
  const seen = new Set<string>();
  for (const r of rows) {
    const day = dayLabel(r.created_at_epoch);
    if (day !== currentDay) {
      out.push(`### ${day}`);
      currentDay = day;
      seen.clear();
    }
    const verb = r.verb ?? r.tool_name.toLowerCase();
    const target = shortTarget(r.target);
    const key = `${verb}::${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`- ${verb}: ${target || '(external)'}`);
  }
  out.push('');
  return out;
}
