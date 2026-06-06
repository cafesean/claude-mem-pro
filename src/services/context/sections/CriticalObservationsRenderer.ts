
import type { Observation } from '../types.js';

const TYPE_WEIGHTS: Record<string, number> = {
  security_alert: 1.0,
  security_note: 1.0,
  decision: 0.9,
  deployment: 0.85,
  release: 0.85,
  build: 0.85,
  migration: 0.85,
  architecture: 0.7,
  lesson: 0.7,
};

const BUGFIX_BOOST_CONCEPTS = new Set([
  'breaking-change', 'breaking_change',
  'prod', 'production', 'prod-deploy', 'prod_deploy',
  'data-loss', 'outage',
]);

const CONCEPT_BOOST = new Set([
  'prod-deploy', 'prod_deploy',
  'migration-drift', 'migration_drift',
  'rollback',
  'breaking-change', 'breaking_change',
  'outage',
  'security-incident', 'security_incident',
  'data-loss', 'data_loss',
  'corruption',
]);

const TYPE_EMOJI: Record<string, string> = {
  security_alert: '🚨',
  security_note: '🔐',
  decision: '⚖️',
  deployment: '🚀',
  release: '📦',
  build: '🏗️',
  migration: '🛠️',
  bugfix: '🔴',
  architecture: '🏛️',
  lesson: '💡',
};

const RECENCY_HALF_LIFE_DAYS = 30;
const SCORE_THRESHOLD = 0.3;
const MAX_CRITICAL = 3;
const MAX_TITLE_CHARS = 90;

interface ScoredObservation {
  obs: Observation;
  score: number;
  emoji: string;
}

function parseConcepts(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map(String).map(s => s.toLowerCase());
  } catch {
    /* not JSON — fall through */
  }
  return raw.split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

// Claude-mem's classification taxonomy. These are HOW the observation was
// categorised (a meta-label like "this is a trade-off") — not what it is
// ABOUT. They make poor tag chips in the timeline because every observation
// of a given type has them.
const META_CONCEPTS = new Set([
  'how-it-works', 'how_it_works',
  'what-changed', 'what_changed',
  'why-it-exists', 'why_it_exists',
  'problem-solution', 'problem_solution',
  'trade-off', 'trade_off', 'tradeoff',
  'pattern', 'patterns',
  'gotcha', 'gotchas',
  'lesson', 'lessons',
  'decision', 'decisions',
  'rationale',
  'note', 'notes',
]);

// Top-level dirs in a project that are usually generic plumbing — skip when
// deriving area tags so we surface the actual app/area names instead.
const GENERIC_TOP_DIRS = new Set([
  'src', 'lib', 'libs', 'packages',
  'test', 'tests', '__tests__',
  'docs', 'doc',
  'scripts', 'bin',
  'config', 'configs',
  '.github', '.vscode', '.idea',
  'node_modules', 'vendor',
  // claude-mem / claude-mem-pro project-internal dirs that describe HOW the
  // project is structured rather than WHAT was being worked on.
  '_context', 'context', '.context',
  '_ai', 'ai', '.ai',
  '_specs', 'specs', '.specs',
  '_docs', '.docs',
  '_memory', 'memory',
  '_plans', 'plans', '.plan',
  'plugin', 'plugins',
]);

function parseFilesModified(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map(String);
  } catch {
    /* not JSON */
  }
  return [];
}

function deriveAreaTags(filesModified: string | null): string[] {
  const files = parseFilesModified(filesModified);
  if (files.length === 0) return [];
  const counts = new Map<string, number>();
  for (const f of files) {
    const parts = f.replace(/^\.?\//, '').split('/');
    const top = parts[0]?.toLowerCase();
    if (!top || GENERIC_TOP_DIRS.has(top)) continue;
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
}

function tagsForObservation(obs: Observation): string[] {
  // Prefer area tags derived from touched files — they describe WHAT the
  // observation is about. Otherwise fall back to concepts with claude-mem's
  // taxonomy labels stripped. If neither yields anything meaningful, omit
  // tags entirely so the title can carry the line.
  const areaTags = deriveAreaTags(obs.files_modified);
  if (areaTags.length > 0) return areaTags;
  const domainConcepts = parseConcepts(obs.concepts).filter(c => !META_CONCEPTS.has(c));
  return domainConcepts.slice(0, 3);
}

function scoreObservation(obs: Observation, now: number): { score: number; emoji: string } | null {
  const type = (obs.type || '').toLowerCase();
  const concepts = parseConcepts(obs.concepts);

  let typeWeight = TYPE_WEIGHTS[type] ?? 0;

  if (typeWeight === 0 && type === 'bugfix') {
    if (concepts.some(c => BUGFIX_BOOST_CONCEPTS.has(c))) typeWeight = 0.8;
  }

  if (typeWeight === 0) return null;

  const boostHits = concepts.filter(c => CONCEPT_BOOST.has(c)).length;
  const conceptBonus = Math.min(0.2, boostHits * 0.1);
  const baseWeight = Math.min(1.0, typeWeight + conceptBonus);

  const ageDays = (now - obs.created_at_epoch) / (1000 * 60 * 60 * 24);
  const recencyFactor = Math.exp(-Math.max(0, ageDays) / RECENCY_HALF_LIFE_DAYS);

  return {
    score: baseWeight * recencyFactor,
    emoji: TYPE_EMOJI[type] || '🟣',
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function dayLabel(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTimeOfDay(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? 'a' : 'p';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, ' ')}:${String(m).padStart(2, '0')}${ampm}`;
}

function describeObservation(obs: Observation, emoji: string): string {
  const tags = tagsForObservation(obs);
  const title = obs.title || obs.subtitle || 'Untitled';
  const parts: string[] = [];
  if (tags.length) parts.push(`[${tags.join(',')}]`);
  parts.push(title);
  return truncate(parts.join(' '), MAX_TITLE_CHARS);
}

export function renderCriticalObservations(observations: Observation[] | undefined): string[] {
  if (!observations || observations.length === 0) return [];

  const now = Date.now();
  const scored: ScoredObservation[] = [];
  for (const obs of observations) {
    const result = scoreObservation(obs, now);
    if (result && result.score >= SCORE_THRESHOLD) {
      scored.push({ obs, score: result.score, emoji: result.emoji });
    }
  }
  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_CRITICAL);

  // Re-group selected entries by day (newest day first; entries within a day
  // ascending by time) so the block matches the session timeline format.
  const byDay = new Map<string, { d: Date; entries: ScoredObservation[] }>();
  for (const item of top) {
    const d = new Date(item.obs.created_at_epoch);
    const key = d.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, { d, entries: [] });
    byDay.get(key)!.entries.push(item);
  }
  const dayKeys = [...byDay.keys()].sort().reverse();

  const out: string[] = [];
  out.push(`## Critical observations (${top.length})`);
  for (const key of dayKeys) {
    const group = byDay.get(key)!;
    group.entries.sort((a, b) => a.obs.created_at_epoch - b.obs.created_at_epoch);
    out.push(`### ${dayLabel(group.d)}`);
    for (const { obs, emoji } of group.entries) {
      const time = formatTimeOfDay(new Date(obs.created_at_epoch)).padStart(6, ' ');
      out.push(`${time}  ${emoji}  ${describeObservation(obs, emoji)}`);
    }
    out.push('');
  }
  while (out.length && !out[out.length - 1]) out.pop();
  out.push('');
  return out;
}
