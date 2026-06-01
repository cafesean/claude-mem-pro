// SPDX-License-Identifier: Apache-2.0

/**
 * MutationDigest — the injected-context body. Instead of dumping the
 * observation + session_summary index (process-narrative noise), inject a
 * compact digest of durable MUTATIONS (what actually changed last sessions),
 * plus a pointer to the `recall` skill for deeper lookup.
 *
 * The flat per-file list let a single busy session (e.g. 200 file edits)
 * consume the whole budget, drowning out the variety of work across other
 * sessions. So the default groups mutations into one block per SESSION,
 * labelled by the dominant topic (worktree / spec / repo) derived from the
 * file paths, with a capped sample of files. This surfaces "what distinct
 * pieces of work happened recently" instead of raw file churn.
 *
 * Grouping, time-window and caps are all configurable (see DigestConfig /
 * CLAUDE_MEM_DIGEST_* settings).
 *
 * Reads the `mutations` table directly (shared bun:sqlite handle). No LLM.
 */

export type DigestGroup = 'session' | 'topic' | 'flat';

export interface DigestConfig {
  /** How to group mutations. Default 'session'. */
  group: DigestGroup;
  /** Only include mutations from the last N days. 0 = no time window. Default 7. */
  windowDays: number;
  /** Max session/topic blocks to render (flat: max rows). Default 10. */
  maxBlocks: number;
  /** Max sample files listed per block. Default 4. */
  filesPerBlock: number;
  /** Upper bound on rows scanned from the table before grouping. Default 2000. */
  scanLimit: number;
  /** Override "now" (epoch ms) for the time window — testing/determinism. */
  nowEpoch?: number;
}

export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
  group: 'session',
  windowDays: 7,
  maxBlocks: 10,
  filesPerBlock: 4,
  scanLimit: 2000,
};

interface MutationDigestRow {
  tool_name: string;
  target: string | null;
  verb: string | null;
  content_session_id: string;
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

/** True when a target looks like a filesystem path (vs a commit msg / shell / entity). */
function isPathLike(target: string | null): boolean {
  if (!target) return false;
  const t = target.split('\n')[0];
  if (!t.includes('/')) return false;
  // reject shell commands / redirections / substitutions that happen to contain a slash
  if (/^\s*(cd|git|npm|pnpm|bun|node|echo|cat)\s/.test(t)) return false;
  if (/[;|&]|2>&1|\$\(|<<|\bgrep\b|\becho\b/.test(t)) return false;
  return true;
}

/** Friendly verb for display: collapse raw MCP tool names to their action segment. */
function displayVerb(verb: string): string {
  if (verb.startsWith('mcp__')) {
    const seg = verb.split('__').pop() ?? verb;
    return seg || 'external';
  }
  return verb;
}

/** Basename for sample display; falls back to the shortened target. */
function sampleLabel(target: string | null): string {
  if (!target) return '';
  const t = target.split('\n')[0];
  if (isPathLike(t)) {
    const base = t.replace(/\/+$/, '').split('/').pop() ?? t;
    return base.length > 0 ? base : shortTarget(t);
  }
  // non-path: a commit message or external entity — keep short
  return t.length > 48 ? t.slice(0, 47) + '…' : t;
}

/**
 * Derive a topic key from a target path. The most useful labels live in the
 * path itself: a worktree name, a spec folder, a skill, or the repo.
 * Returns '' when nothing meaningful can be extracted.
 */
export function topicOf(target: string | null): string {
  if (!target) return '';
  const t = target.split('\n')[0];

  // git worktree: ".../<repo>/.claude/worktrees/<feature>/..." → repo/feature
  let m = t.match(/([^/]+)\/\.claude\/worktrees\/([^/]+)/);
  if (m) return `${m[1]}/${m[2]}`;

  // spec folder: ".../_specs/<spec>/..." → _specs/<spec>
  m = t.match(/_specs\/([^/]+)/);
  if (m) return `_specs/${m[1]}`;

  // user-level claude assets: ".../.claude/<skills|plugins|agents>/<name>/..."
  m = t.match(/\.claude\/(?:skills|plugins|agents)\/([^/]+)/);
  if (m) return `.claude/${m[1]}`;

  // repo under the code roots: "/code/(monorepo|ai)/<repo>/..." or "/code/<repo>/..."
  m = t.match(/\/code\/(?:monorepo|ai)\/([^/]+)/) ?? t.match(/\/code\/([^/]+)\//);
  if (m && m[1] !== '.claude' && m[1] !== 'monorepo' && m[1] !== 'ai') return m[1];

  return '';
}

function dayLabel(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

/** "MM-DD" for compact spans. */
function shortDay(epoch: number): string {
  return new Date(epoch).toISOString().slice(5, 10);
}

function uniqueVerbs(rows: MutationDigestRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const v = displayVerb(r.verb ?? r.tool_name.toLowerCase());
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Distinct sample labels (basenames), most-recent-first, capped. */
function sampleFiles(rows: MutationDigestRow[], cap: number): { shown: string[]; extra: number } {
  const seen = new Set<string>();
  const labels: string[] = [];
  // prefer real paths; fall back to non-path targets only if no paths exist
  const pathRows = rows.filter((r) => isPathLike(r.target));
  const source = pathRows.length > 0 ? pathRows : rows.filter((r) => r.target);
  for (const r of source) {
    const label = sampleLabel(r.target);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return { shown: labels.slice(0, cap), extra: Math.max(0, labels.length - cap) };
}

/** Dominant topic for a group of rows, plus how many other distinct topics. */
function dominantTopic(rows: MutationDigestRow[]): { label: string; otherAreas: number } {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = topicOf(r.target);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) return { label: 'misc', otherAreas: 0 };
  let best = '';
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return { label: best, otherAreas: counts.size - 1 };
}

function fetchRows(db: DbLike, projects: string[], cfg: DigestConfig): MutationDigestRow[] {
  const placeholders = projects.map(() => '?').join(',');
  const now = cfg.nowEpoch ?? Date.now();
  const params: unknown[] = [...projects];
  let where = `project IN (${placeholders})`;
  if (cfg.windowDays > 0) {
    where += ` AND created_at_epoch >= ?`;
    params.push(now - cfg.windowDays * 86_400_000);
  }
  params.push(cfg.scanLimit);
  return db
    .prepare(
      `SELECT tool_name, target, verb, content_session_id, created_at_epoch
       FROM mutations
       WHERE ${where}
       ORDER BY created_at_epoch DESC
       LIMIT ?`,
    )
    .all(...params) as MutationDigestRow[];
}

/** Legacy flat list: one line per (verb, target), grouped by day, deduped per day. */
function renderFlat(rows: MutationDigestRow[], cfg: DigestConfig): string[] {
  const out: string[] = ['## Recent changes (durable mutations)', ''];
  let currentDay = '';
  const seen = new Set<string>();
  let shown = 0;
  for (const r of rows) {
    if (shown >= cfg.maxBlocks) break;
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
    shown++;
  }
  out.push('');
  return out;
}

/** One block per session, grouped under the day of its latest mutation. */
function renderBySession(rows: MutationDigestRow[], cfg: DigestConfig): string[] {
  // group rows by session, preserving newest-first order
  const bySession = new Map<string, MutationDigestRow[]>();
  for (const r of rows) {
    const arr = bySession.get(r.content_session_id);
    if (arr) arr.push(r);
    else bySession.set(r.content_session_id, [r]);
  }

  // each session: latest epoch + its rows, ordered newest-first
  const sessions = [...bySession.values()]
    .map((rs) => ({ rs, latest: rs[0].created_at_epoch }))
    .sort((a, b) => b.latest - a.latest)
    .slice(0, cfg.maxBlocks);

  const out: string[] = ['## Recent work (by session)', ''];
  let currentDay = '';
  for (const { rs, latest } of sessions) {
    const day = dayLabel(latest);
    if (day !== currentDay) {
      out.push(`### ${day}`);
      currentDay = day;
    }
    const { label, otherAreas } = dominantTopic(rs);
    const verbs = uniqueVerbs(rs).join(', ');
    const areas = otherAreas > 0 ? ` +${otherAreas} area${otherAreas > 1 ? 's' : ''}` : '';
    out.push(`- ${label} — ${rs.length} change${rs.length > 1 ? 's' : ''} (${verbs})${areas}`);
    const { shown, extra } = sampleFiles(rs, cfg.filesPerBlock);
    if (shown.length > 0) {
      const more = extra > 0 ? ` +${extra} more` : '';
      out.push(`  ${shown.join(', ')}${more}`);
    }
  }
  out.push('');
  return out;
}

/** One block per topic/area, rolled up across sessions and days. */
function renderByTopic(rows: MutationDigestRow[], cfg: DigestConfig): string[] {
  const byTopic = new Map<string, MutationDigestRow[]>();
  for (const r of rows) {
    const k = topicOf(r.target) || 'misc';
    const arr = byTopic.get(k);
    if (arr) arr.push(r);
    else byTopic.set(k, [r]);
  }

  const topics = [...byTopic.entries()]
    .map(([label, rs]) => ({ label, rs, latest: rs[0].created_at_epoch }))
    .sort((a, b) => b.rs.length - a.rs.length || b.latest - a.latest)
    .slice(0, cfg.maxBlocks);

  const windowNote = cfg.windowDays > 0 ? ` (last ${cfg.windowDays} days)` : '';
  const out: string[] = [`## Recent changes by area${windowNote}`, ''];
  for (const { label, rs } of topics) {
    const verbs = uniqueVerbs(rs).join(', ');
    const newest = rs[0].created_at_epoch;
    const oldest = rs[rs.length - 1].created_at_epoch;
    const span =
      dayLabel(newest) === dayLabel(oldest)
        ? shortDay(newest)
        : `${shortDay(oldest)}→${shortDay(newest)}`;
    out.push(`- ${label} — ${rs.length} change${rs.length > 1 ? 's' : ''} · ${verbs} · ${span}`);
    const { shown, extra } = sampleFiles(rs, cfg.filesPerBlock);
    if (shown.length > 0) {
      const more = extra > 0 ? ` +${extra} more` : '';
      out.push(`  ${shown.join(', ')}${more}`);
    }
  }
  out.push('');
  return out;
}

/**
 * Build the mutation-digest lines for a project. Behaviour is governed by
 * `cfg` (group mode, time window, caps). Returns [] when there are no
 * mutations in range. Default config groups by session, last 7 days.
 */
export function renderMutationDigest(
  db: DbLike,
  projects: string[],
  cfg: Partial<DigestConfig> = {},
): string[] {
  if (projects.length === 0) return [];
  const config: DigestConfig = { ...DEFAULT_DIGEST_CONFIG, ...cfg };

  const rows = fetchRows(db, projects, config);
  if (rows.length === 0) return [];

  switch (config.group) {
    case 'flat':
      return renderFlat(rows, config);
    case 'topic':
      return renderByTopic(rows, config);
    case 'session':
    default:
      return renderBySession(rows, config);
  }
}
