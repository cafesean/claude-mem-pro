// SPDX-License-Identifier: Apache-2.0

/**
 * Session markdown renderer — Phase 4.
 *
 * Renders a SessionRecord into a markdown document matching the
 * dev-workflow plugin's session-update output format. The render
 * is purely structural — observation references are hydrated by a
 * caller-injected resolver so the renderer stays free of DB deps.
 */

import type { SessionRecord } from '../../core/schemas/session-record.js';

export interface HydratedObservation {
  observationId: string;
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export type ObservationResolver = (
  ids: readonly string[]
) => Promise<Map<string, HydratedObservation>>;

export interface RenderOptions {
  /** Resolver to hydrate observation refs. If null, refs render as id-only stubs. */
  resolver?: ObservationResolver | null;
  /** Whether to render the generation_metadata footer. Default true. */
  includeProvenance?: boolean;
}

const DEFAULT_OPTIONS: Required<Pick<RenderOptions, 'includeProvenance'>> = {
  includeProvenance: true
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yamlList(values: readonly string[] | undefined): string {
  if (!values?.length) return '[]';
  return `[${values.map((v) => yamlScalar(v)).join(', ')}]`;
}

function yamlScalar(value: string): string {
  if (/[:,#\n[\]{}&*!|>'"%@`]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function renderFrontmatter(record: SessionRecord): string {
  const lines = [
    '---',
    `title: ${JSON.stringify(record.title)}`,
    `date: ${record.date}`,
    `projects: ${yamlList(record.projects)}`,
    record.branch ? `branch: ${yamlScalar(record.branch)}` : '',
    `status: ${record.status}`,
    `type: ${record.type}`,
    `topics: ${yamlList(record.topics)}`,
    `tags: ${yamlList(record.tags)}`,
    `last_updated: ${record.last_updated}`,
    `sdk_touched: ${yamlList(record.sdk_touched)}`,
    `apps_touched: ${yamlList(record.apps_touched)}`,
    `commits: ${yamlList(record.commits)}`,
    `related_sessions: ${yamlList(record.related_sessions)}`,
    `specs: ${yamlList(record.specs)}`,
    '---'
  ].filter(Boolean);
  return lines.join('\n');
}

function renderObservationBlock(
  refs: readonly { observationId: string; cachedTitle?: string }[],
  hydrated: Map<string, HydratedObservation>,
  bullet = '-'
): string {
  if (!refs.length) return '';
  return refs
    .map((ref) => {
      const hit = hydrated.get(ref.observationId);
      const title = hit?.title ?? ref.cachedTitle ?? `(observation ${ref.observationId})`;
      const body = hit?.body ? `\n  ${hit.body.split('\n').join('\n  ')}` : '';
      return `${bullet} **${title}** [\`${ref.observationId}\`]${body}`;
    })
    .join('\n');
}

function renderSdkNotes(notes: Record<string, string>): string {
  const keys = Object.keys(notes);
  if (!keys.length) return '_(nothing this session)_';
  return keys
    .map((pkg) => `### ${pkg}\n\n${notes[pkg]}`)
    .join('\n\n');
}

function renderUpdates(updates: SessionRecord['content']['updates']): string {
  if (!updates.length) return '_(no updates recorded)_';
  return updates
    .map((u) => {
      const commits = u.commit_log.length
        ? `\n**Commits:**\n${u.commit_log
            .map((c) => `- \`${c.hash}\` ${c.message}`)
            .join('\n')}`
        : '';
      const files = u.files_changed.length
        ? `\n**Files:**\n${u.files_changed
            .map((f) => `- ${f.changeType} ${f.path}${f.description ? ` — ${f.description}` : ''}`)
            .join('\n')}`
        : '';
      const status = u.git_status
        ? `\n**Git:** branch ${u.git_status.branch ?? '?'}, tree ${u.git_status.workingTree ?? '?'}`
        : '';
      return [
        `### Update — ${u.timestamp}`,
        '',
        `**What changed:** ${u.what_changed}`,
        u.implementation_details ? `\n${u.implementation_details}` : '',
        commits,
        files,
        status
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

function renderContextDocs(docs: SessionRecord['content']['context_documents']): string {
  if (!docs.length) return '_(none referenced)_';
  return [
    '| Document | Path | Why It Matters |',
    '|----------|------|----------------|',
    ...docs.map((d) => `| ${d.document} | \`${d.path}\` | ${d.why_it_matters} |`)
  ].join('\n');
}

function renderProvenance(record: SessionRecord): string {
  if (!record.generation_metadata) return '';
  const m = record.generation_metadata;
  const parts = [
    m.synthesized_at ? `synthesised: ${m.synthesized_at}` : '',
    m.synthesis_model ? `model: ${m.synthesis_model}` : '',
    m.cost_usd !== undefined ? `cost: $${m.cost_usd.toFixed(4)}` : '',
    m.input_tokens !== undefined ? `in: ${m.input_tokens}t` : '',
    m.output_tokens !== undefined ? `out: ${m.output_tokens}t` : ''
  ].filter(Boolean);
  if (!parts.length) return '';
  return `<!-- claude-mem session_record provenance — ${parts.join(' · ')} -->`;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Construct the filename per the dev-workflow naming convention:
 *   YYYY-MM-DD-[project]-slug.md
 */
export function renderSessionFilename(record: SessionRecord, slug: string): string {
  const project = record.projects[0] ?? 'unknown';
  return `${record.date}-[${project}]-${slug}.md`;
}

export async function renderSessionMarkdown(
  record: SessionRecord,
  options: RenderOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const refIds = [
    ...record.content.architecture_issues.map((r) => r.observationId),
    ...record.content.lessons_learned.map((r) => r.observationId),
    ...record.content.user_steering.map((r) => r.observationId)
  ];
  const hydrated = options.resolver
    ? await options.resolver(refIds)
    : new Map<string, HydratedObservation>();

  const sections: string[] = [
    renderFrontmatter(record),
    '',
    `# Session: ${record.title}`,
    '',
    '## Objective',
    '',
    record.content.objective || '_(no objective recorded)_',
    '',
    '## SDK Notes',
    '',
    renderSdkNotes(record.content.sdk_notes),
    '',
    '## Architecture Issues',
    '',
    renderObservationBlock(record.content.architecture_issues, hydrated) || '_(none)_',
    '',
    '## Context Documents',
    '',
    renderContextDocs(record.content.context_documents),
    '',
    '## Lessons Learned',
    '',
    renderObservationBlock(record.content.lessons_learned, hydrated) || '_(none)_',
    '',
    '## User Steering & Corrections',
    '',
    renderObservationBlock(record.content.user_steering, hydrated) || '_(none)_',
    '',
    '## Next Steps',
    '',
    record.content.next_steps.length
      ? record.content.next_steps.map((s) => `- ${s}`).join('\n')
      : '_(none)_',
    '',
    '---',
    '',
    '## Updates',
    '',
    renderUpdates(record.content.updates)
  ];

  if (opts.includeProvenance) {
    const provenance = renderProvenance(record);
    if (provenance) sections.push('', provenance);
  }

  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
