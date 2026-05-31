// SPDX-License-Identifier: Apache-2.0

/**
 * Three-way markdown merge — Phase 4.
 *
 * Inputs:
 *   base         — previously rendered output (what claude-mem wrote last)
 *   current      — file on disk now (may have human edits)
 *   regenerated  — fresh render from updated session_record
 *
 * Output:
 *   merged       — what to write back to disk
 *   diffLog      — structured record of every overwrite + preserved edit
 *
 * Section-aware rules per spec Appendix B:
 *   - frontmatter: regenerated wins (warn on overwrite)
 *   - Lessons / User Steering / Architecture Issues: append-or-keep
 *   - Next Steps: append-only (never delete human items)
 *   - Updates: append-only
 */

const SECTION_HEADERS = [
  '## Objective',
  '## SDK Notes',
  '## Architecture Issues',
  '## Context Documents',
  '## Lessons Learned',
  '## User Steering & Corrections',
  '## Next Steps',
  '## Updates'
] as const;

export type SectionName = (typeof SECTION_HEADERS)[number];

export type DiffAction =
  | 'kept-human'
  | 'inserted'
  | 'overwritten'
  | 'preserved-empty'
  | 'no-change';

export interface DiffEntry {
  section: 'frontmatter' | SectionName;
  action: DiffAction;
  detail: string;
}

export interface MergeResult {
  merged: string;
  diffLog: DiffEntry[];
}

interface ParsedDoc {
  frontmatter: string;
  body: string;
  sections: Map<string, string>;
}

const FRONTMATTER_FENCE = /^---\n([\s\S]*?)\n---\n?/;

function parse(doc: string): ParsedDoc {
  const m = doc.match(FRONTMATTER_FENCE);
  let frontmatter = '';
  let body = doc;
  if (m) {
    frontmatter = m[1];
    body = doc.slice(m[0].length);
  }
  const sections = new Map<string, string>();
  const lines = body.split('\n');
  let currentHeader: string | null = null;
  let buffer: string[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeader) sections.set(currentHeader, buffer.join('\n').trim());
      currentHeader = line.trim();
      buffer = [];
    } else if (currentHeader) {
      buffer.push(line);
    }
  }
  if (currentHeader) sections.set(currentHeader, buffer.join('\n').trim());

  return { frontmatter, body, sections };
}

function sectionRule(header: string): 'authoritative' | 'append-or-keep' | 'append-only' {
  switch (header) {
    case '## Lessons Learned':
    case '## User Steering & Corrections':
    case '## Architecture Issues':
      return 'append-or-keep';
    case '## Next Steps':
      return 'append-only';
    case '## Updates':
      return 'append-only';
    default:
      return 'authoritative';
  }
}

function lineSet(content: string): Set<string> {
  return new Set(
    content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  );
}

function mergeAppendOrKeep(
  base: string | undefined,
  current: string | undefined,
  regenerated: string | undefined
): { merged: string; humanLines: string[]; insertedLines: string[] } {
  const baseLines = base ? lineSet(base) : new Set<string>();
  const currentLines = current
    ? current
        .split('\n')
        .map((l) => l)
        .filter((l) => l.trim().length > 0)
    : [];
  const regenLines = regenerated
    ? regenerated
        .split('\n')
        .map((l) => l)
        .filter((l) => l.trim().length > 0)
    : [];

  const result: string[] = [];
  const humanLines: string[] = [];
  const inserted: string[] = [];

  // 1. Keep all current lines (human edits + previously rendered).
  for (const line of currentLines) {
    result.push(line);
    if (!baseLines.has(line.trim())) {
      humanLines.push(line.trim());
    }
  }

  // 2. Append regenerated lines not already present in current.
  const currentSet = new Set(currentLines.map((l) => l.trim()));
  for (const line of regenLines) {
    if (!currentSet.has(line.trim())) {
      result.push(line);
      inserted.push(line.trim());
    }
  }

  return {
    merged: result.join('\n').trim(),
    humanLines,
    insertedLines: inserted
  };
}

export function threeWayMerge(
  base: string | null,
  current: string | null,
  regenerated: string
): MergeResult {
  const log: DiffEntry[] = [];

  // No prior file → use regenerated as-is.
  if (!current) {
    return {
      merged: regenerated,
      diffLog: [
        {
          section: 'frontmatter',
          action: 'inserted',
          detail: 'no prior file — wrote regenerated output'
        }
      ]
    };
  }

  const baseDoc = base ? parse(base) : null;
  const currentDoc = parse(current);
  const regenDoc = parse(regenerated);

  // Frontmatter: regenerated wins.
  let mergedFrontmatter = regenDoc.frontmatter;
  if (currentDoc.frontmatter !== regenDoc.frontmatter) {
    log.push({
      section: 'frontmatter',
      action: 'overwritten',
      detail: 'regenerated frontmatter took precedence'
    });
  } else {
    log.push({
      section: 'frontmatter',
      action: 'no-change',
      detail: 'frontmatter identical'
    });
  }

  // Process every known section.
  const mergedSections = new Map<string, string>();
  for (const header of SECTION_HEADERS) {
    const baseSection = baseDoc?.sections.get(header);
    const currentSection = currentDoc.sections.get(header);
    const regenSection = regenDoc.sections.get(header);
    const rule = sectionRule(header);

    if (!currentSection && !regenSection) {
      mergedSections.set(header, '');
      continue;
    }

    if (rule === 'authoritative') {
      const next = regenSection ?? currentSection ?? '';
      mergedSections.set(header, next);
      if (regenSection !== undefined && currentSection !== regenSection) {
        log.push({
          section: header,
          action: 'overwritten',
          detail: 'regenerated content replaced current'
        });
      } else {
        log.push({ section: header, action: 'no-change', detail: '' });
      }
      continue;
    }

    if (rule === 'append-or-keep' || rule === 'append-only') {
      const merged = mergeAppendOrKeep(baseSection, currentSection, regenSection);
      mergedSections.set(header, merged.merged);
      if (merged.humanLines.length) {
        log.push({
          section: header,
          action: 'kept-human',
          detail: `${merged.humanLines.length} human-authored lines preserved`
        });
      }
      if (merged.insertedLines.length) {
        log.push({
          section: header,
          action: 'inserted',
          detail: `${merged.insertedLines.length} new lines appended`
        });
      }
      if (!merged.humanLines.length && !merged.insertedLines.length) {
        log.push({ section: header, action: 'no-change', detail: '' });
      }
      continue;
    }
  }

  // Reconstruct merged markdown.
  const sectionBlocks: string[] = [];
  for (const header of SECTION_HEADERS) {
    const body = mergedSections.get(header) ?? '';
    if (!body) continue;
    sectionBlocks.push(`${header}\n\n${body}`);
  }

  // Title line — keep current document's H1 if present, otherwise regenerated.
  const title = extractTitle(currentDoc.body) ?? extractTitle(regenDoc.body) ?? '';

  const merged = [
    `---\n${mergedFrontmatter}\n---`,
    title ? `\n${title}` : '',
    '',
    sectionBlocks.join('\n\n')
  ]
    .filter(Boolean)
    .join('\n');

  return { merged: merged.replace(/\n{3,}/g, '\n\n').trim() + '\n', diffLog: log };
}

function extractTitle(body: string): string | null {
  const match = body.match(/^# .+$/m);
  return match ? match[0] : null;
}

export const __test__ = { parse, sectionRule };
