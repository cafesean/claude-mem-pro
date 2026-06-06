
import { relative } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { ArtifactPaths, RecentSessionFile } from '../ArtifactPathsResolver.js';

const NEXT_STEPS_HEADERS = /^##\s+(Next Steps|Next steps|TODO|Follow-?ups?)\s*$/i;
const ANY_H2 = /^##\s/;
const HORIZONTAL_RULE = /^---+\s*$/;
const ANY_H3 = /^###\s/;
const CARRY_OVER_MAX_LINES = 8;
const FRONTMATTER_OPEN = /^---\s*$/;
const H1 = /^#\s+(.+?)\s*$/;
const YAML_KEY = /^([a-zA-Z_-]+)\s*:\s*(.*)$/;

interface SessionMeta {
  title?: string;
  project?: string;
  feature?: string;
  story?: string;
  issue?: string;
  status?: string;
  tags?: string;
  topics?: string;
  date?: string;
  time?: string;
  started_at?: string;
  updated_at?: string;
  last_updated?: string;
  ended_at?: string;
  finished_at?: string;
}

const STATUS_EMOJI: Record<string, string> = {
  completed: '✅',
  done: '✅',
  shipped: '✅',
  closed: '✅',
  'in-progress': '🟣',
  'in_progress': '🟣',
  wip: '🟣',
  ongoing: '🟣',
  active: '🟣',
  planning: '🔵',
  planned: '🔵',
  exploring: '🔵',
  research: '🔵',
  bug: '🔴',
  bugfix: '🔴',
  blocked: '🔴',
  failed: '🔴',
  notes: '📝',
  doc: '📝',
  docs: '📝',
  'release-notes': '📝',
};

function statusEmoji(status: string | undefined, basename: string): string {
  if (status) {
    const k = status.toLowerCase().trim().replace(/\s+/g, '-');
    if (STATUS_EMOJI[k]) return STATUS_EMOJI[k];
  }
  const lower = basename.toLowerCase();
  if (lower.includes('release-note') || lower.includes('release_note')) return '📝';
  if (lower.includes('bug') || lower.includes('fix-') || lower.includes('-fix')) return '🔴';
  if (lower.includes('audit') || lower.includes('analysis')) return '🔵';
  return '🟣';
}

function formatTimeOfDay(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? 'a' : 'p';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, ' ')}:${String(m).padStart(2, '0')}${ampm}`;
}

const ISO_TIME = /(\d{2}:\d{2}(?::\d{2})?)/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2})/;

const FILENAME_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-?/;
const FILENAME_TAG_BRACKETS = /\[([^\]]+)\]/;
const TITLE_STORY_PREFIX = /^([A-Za-z]{1,4}-?\d{1,5}|p\d{1,4}|[A-Z]{2,6}-\d+)\s*[—:\-]\s*(.+)$/;
const DESCRIPTION_MAX_CHARS = 100;

function tagsFromBasename(basename: string): string[] {
  const m = FILENAME_TAG_BRACKETS.exec(basename);
  if (!m) return [];
  return m[1].split(',').map(t => t.trim()).filter(Boolean);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = v.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(v); }
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function parseSessionHead(filePath: string): SessionMeta {
  try {
    // Read enough to cover frontmatter + first heading (~60 lines is plenty).
    const text = readFileSync(filePath, 'utf-8');
    const lines = text.split('\n', 80);
    const meta: SessionMeta = {};

    let i = 0;
    if (lines[0] && FRONTMATTER_OPEN.test(lines[0])) {
      i = 1;
      while (i < lines.length && !FRONTMATTER_OPEN.test(lines[i])) {
        const m = YAML_KEY.exec(lines[i]);
        if (m) {
          const key = m[1].toLowerCase();
          // Strip surrounding quotes and YAML inline-array brackets so
          // `tags: [a, b]` and `tags: "x"` both come through cleanly.
          const val = m[2].trim()
            .replace(/^\[|\]$/g, '')
            .replace(/^["']|["']$/g, '')
            .trim();
          if (['title','project','feature','story','issue','status','tags','topics','date','time','started_at','updated_at','last_updated','ended_at','finished_at'].includes(key)) {
            (meta as any)[key] = val;
          }
        }
        i++;
      }
      i++; // skip closing ---
    }

    if (!meta.title) {
      for (let j = i; j < lines.length; j++) {
        const h = H1.exec(lines[j]);
        if (h) { meta.title = h[1].trim(); break; }
        if (lines[j].trim() && !lines[j].startsWith('#')) break;
      }
    }
    return meta;
  } catch {
    return {};
  }
}

function describeSession(meta: SessionMeta, basename: string): string {
  // Tag sources: filename brackets are the most curated, then explicit
  // frontmatter, then project. Topics tend to be noisy keyword lists — skip.
  const tags = dedupe([
    ...tagsFromBasename(basename),
    ...(meta.tags ? meta.tags.split(',').map(s => s.trim()) : []),
    ...(meta.project ? [meta.project] : []),
  ]).filter(Boolean).slice(0, 3);

  // Strip date + tag brackets from filename for the fallback title.
  let rawTitle = meta.title;
  if (!rawTitle) {
    rawTitle = basename
      .replace(/\.md$/, '')
      .replace(FILENAME_DATE_PREFIX, '')
      .replace(FILENAME_TAG_BRACKETS, '')
      .replace(/^-+|-+$/g, '')
      .replace(/-/g, ' ')
      .trim();
  }

  // Pull a leading story/issue id out of the title if frontmatter didn't have one.
  let id = meta.issue || meta.story || meta.feature;
  let title = rawTitle;
  if (!id) {
    const m = TITLE_STORY_PREFIX.exec(rawTitle);
    if (m) {
      id = m[1];
      title = m[2].trim();
    }
  }

  const parts: string[] = [];
  if (tags.length) parts.push(`[${tags.slice(0, 4).join(',')}]`);
  if (id) parts.push(id);
  parts.push(title);
  if (meta.status) parts.push(`(${meta.status})`);
  return truncate(parts.join(' '), DESCRIPTION_MAX_CHARS);
}

interface TimelineEntry {
  dayKey: string;       // YYYY-MM-DD
  dayLabel: string;     // "Jun 5, 2026"
  epochMs: number;      // sort key (descending for day, ascending within day)
  timeLabel: string;    // "4:37p"
  emoji: string;
  description: string;
}

function dayLabel(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function resolveSessionTime(meta: SessionMeta, file: RecentSessionFile): Date {
  const candidates = [
    meta.started_at,
    meta.last_updated,
    meta.updated_at,
    meta.finished_at,
    meta.ended_at,
    meta.date,
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (ISO_DATETIME.test(c)) {
      const d = new Date(c);
      if (!isNaN(d.getTime())) return d;
    }
  }
  // Compose date from filename + time from frontmatter (or mtime fallback).
  const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(file.basename);
  if (dateMatch) {
    const baseDate = dateMatch[1];
    const tm = meta.time && ISO_TIME.exec(meta.time);
    if (tm) {
      const d = new Date(`${baseDate}T${tm[1].length === 5 ? tm[1] + ':00' : tm[1]}`);
      if (!isNaN(d.getTime())) return d;
    }
    // Use mtime's time-of-day but the filename date for grouping.
    const mtime = new Date(file.mtimeMs);
    const composed = new Date(`${baseDate}T${String(mtime.getHours()).padStart(2,'0')}:${String(mtime.getMinutes()).padStart(2,'0')}:00`);
    if (!isNaN(composed.getTime())) return composed;
  }
  return new Date(file.mtimeMs);
}

function renderSessionTimeline(files: RecentSessionFile[]): string[] {
  const entries: TimelineEntry[] = files.map(f => {
    const meta = parseSessionHead(f.path);
    const when = resolveSessionTime(meta, f);
    return {
      dayKey: when.toISOString().slice(0, 10),
      dayLabel: dayLabel(when),
      epochMs: when.getTime(),
      timeLabel: formatTimeOfDay(when),
      emoji: statusEmoji(meta.status, f.basename),
      description: describeSession(meta, f.basename),
    };
  });

  // Group by day; days descending (newest first), entries within day ascending.
  const byDay = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    if (!byDay.has(e.dayKey)) byDay.set(e.dayKey, []);
    byDay.get(e.dayKey)!.push(e);
  }
  const dayKeys = [...byDay.keys()].sort().reverse();

  const out: string[] = [];
  for (const k of dayKeys) {
    const group = byDay.get(k)!.sort((a, b) => a.epochMs - b.epochMs);
    out.push(`### ${group[0].dayLabel}`);
    for (const e of group) {
      // Right-align the time label so the emoji column lines up.
      const timeCol = e.timeLabel.padStart(6, ' ');
      out.push(`${timeCol}  ${e.emoji}  ${e.description}`);
    }
    out.push('');
  }
  // Trim trailing blank.
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

function extractNextSteps(filePath: string): string {
  try {
    const text = readFileSync(filePath, 'utf-8');
    const lines = text.split('\n');
    // Find the LAST "Next Steps" heading — session-update files append blocks
    // and the latest one is the operative carry-over.
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (NEXT_STEPS_HEADERS.test(lines[i])) start = i + 1;
    }
    if (start < 0) return '';
    const collected: string[] = [];
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      if (ANY_H2.test(line) || ANY_H3.test(line) || HORIZONTAL_RULE.test(line)) break;
      collected.push(line);
      if (collected.length >= CARRY_OVER_MAX_LINES + 4) break;
    }
    // Drop trailing blanks, then cap at MAX bullets/lines.
    while (collected.length && !collected[collected.length - 1].trim()) collected.pop();
    if (collected.length > CARRY_OVER_MAX_LINES) {
      const trimmed = collected.slice(0, CARRY_OVER_MAX_LINES);
      trimmed.push(`_(+${collected.length - CARRY_OVER_MAX_LINES} more — see file)_`);
      return trimmed.join('\n').trim();
    }
    return collected.join('\n').trim();
  } catch {
    return '';
  }
}

export function renderArtifactPointers(
  project: string,
  cwd: string,
  artifacts: ArtifactPaths,
  recentSessions: RecentSessionFile[]
): string {
  const out: string[] = [];
  out.push(`# [${project}] recent context, ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '');
  out.push(
    'claude-mem-pro routes recall to project artifacts (sessions, specs, memory, CLAUDE.md).',
    'Below are pointers — read on demand via the `recall` skill or directly with Read.',
    ''
  );

  if (artifacts.currentSessionFile && existsSync(artifacts.currentSessionFile)) {
    out.push(`## Current session`);
    out.push(`- ${relative(cwd, artifacts.currentSessionFile)}`);
    out.push('');
  }

  if (recentSessions.length > 0) {
    const sessionsRel = artifacts.sessionsDir ? relative(cwd, artifacts.sessionsDir) : '';
    out.push(`## Recent sessions${sessionsRel ? ` — \`${sessionsRel}/\`` : ''}`);
    out.push(...renderSessionTimeline(recentSessions));
    out.push('');

    const lastNext = extractNextSteps(recentSessions[0].path);
    if (lastNext) {
      out.push(`## Carry-over from last session`);
      out.push(lastNext);
      out.push('');
    }
  } else if (artifacts.sessionsDir) {
    out.push(`## Sessions`);
    out.push(`- ${relative(cwd, artifacts.sessionsDir)}/ (empty)`);
    out.push('');
  }

  if (artifacts.specsDirs && artifacts.specsDirs.length > 0) {
    out.push(`## Specs`);
    for (const d of artifacts.specsDirs) {
      out.push(`- ${relative(cwd, d)}/`);
    }
    out.push('');
  }

  if (artifacts.memoryDir) {
    out.push(`## Memory`);
    out.push(`- ${relative(cwd, artifacts.memoryDir)}/`);
    out.push('');
  }

  if (artifacts.projectTags && artifacts.projectTags.length > 0) {
    out.push(`Tags: ${artifacts.projectTags.join(', ')}`, '');
  }

  out.push('For deeper recall use the `recall` skill or `mem-search`.');
  return out.join('\n').trimEnd();
}
