// SPDX-License-Identifier: Apache-2.0

/**
 * Golden doc generator — Phase 6.
 *
 * Renders an authoritative `_context/_arch/<topic>.md` document from
 * one primary LearningRecord (plus optional related records). Output
 * is a draft — humans review and commit. Provenance is recorded in
 * GoldenDocSource so the drift detector can flag stale docs.
 */

import { createHash } from 'node:crypto';
import type { LearningRecord } from '../../core/schemas/learning-record.js';
import type { GoldenDocSource } from '../../core/schemas/golden-doc.js';
import type {
  LlmCallRequest,
  LlmCallResponse,
  LlmCaller,
  ModelTier
} from '../../server/generation/dev-workflow-prompts/enrichment-service.js';

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are claude-mem's golden-doc generator.

Produce an authoritative architecture/usage document distilled from a primary LearningRecord plus optionally-related records. Output must be markdown with the following structure:

  # <Topic Title>

  ## Status & ownership

  - Status: (synthesised from confidence_distribution + open_issues)
  - Last reviewed: (filled by host)
  - Applies to: comma-separated apps/SDKs

  ## Rules

  Numbered list of authoritative rules. Each rule should be specific and
  testable, e.g. "Always set scope:user on cached org-scoped routes".

  ## Patterns

  For each pattern: bold name, when to apply, code or example, evidence_refs.

  ## Anti-patterns

  For each anti-pattern: bold name, why avoid, evidence_refs.

  ## Open issues

  Bullet list with observationId and status.

  ## Source sessions

  Bullet list of source_session_ids — host renders as links.

  ## Generation metadata

  HTML comment footer with claude-mem id, model, cost, source ids.

CRITICAL:
  - Do NOT invent facts beyond the supplied LearningRecord(s).
  - Quote rules_of_thumb verbatim where possible.
  - Reference observation IDs from open_issues / evidence_refs only.`;

function renderRecordForPrompt(record: LearningRecord, label: string): string {
  return [
    `### ${label}: ${record.topic}`,
    `Summary: ${record.summary}`,
    `applies_to: ${record.applies_to.join(', ')}`,
    `confidence_distribution: confirmed=${record.confidence_distribution.confirmed} hypothesis=${record.confidence_distribution.hypothesis}`,
    record.content.rules_of_thumb.length
      ? `rules_of_thumb:\n${record.content.rules_of_thumb.map((r) => `  - ${r}`).join('\n')}`
      : 'rules_of_thumb: (none)',
    record.content.patterns.length
      ? `patterns:\n${record.content.patterns
          .map((p) => `  - ${p.pattern} :: when ${p.when_to_apply}`)
          .join('\n')}`
      : 'patterns: (none)',
    record.content.anti_patterns.length
      ? `anti_patterns:\n${record.content.anti_patterns
          .map((a) => `  - ${a.anti_pattern} :: avoid because ${a.why_avoid}`)
          .join('\n')}`
      : 'anti_patterns: (none)',
    record.content.open_issues.length
      ? `open_issues:\n${record.content.open_issues
          .map((i) => `  - ${i.observationId} (${i.status}) — ${i.summary}`)
          .join('\n')}`
      : 'open_issues: (none)'
  ].join('\n');
}

function buildUserPrompt(primary: LearningRecord, related: readonly LearningRecord[]): string {
  return [
    renderRecordForPrompt(primary, 'primary'),
    '',
    ...related.map((r) => renderRecordForPrompt(r, 'related')),
    '',
    'Produce the golden doc markdown now.'
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  model?: ModelTier;
  /** Optional starting hint for the golden doc title. */
  titleHint?: string;
}

export interface GenerateResult {
  markdown: string;
  llm: LlmCallResponse;
  source: GoldenDocSource;
}

export class GoldenDocGenerator {
  private readonly model: ModelTier;

  constructor(
    private readonly llmCaller: LlmCaller,
    options: GenerateOptions = {}
  ) {
    this.model = options.model ?? 'sonnet';
  }

  async generate(input: {
    primary: LearningRecord;
    related?: readonly LearningRecord[];
    outputPath: string;
    sourceId: string;
  }): Promise<GenerateResult> {
    const related = input.related ?? [];
    const request: LlmCallRequest = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(input.primary, related),
      model: this.model,
      responseJsonSchema: { type: 'object' }
    };

    const response = await this.llmCaller(request);
    const markdown =
      typeof response.parsed === 'string'
        ? response.parsed
        : extractMarkdown(response);

    const sourceIds = [input.primary.id, ...related.map((r) => r.id)];
    const promptHash = createHash('sha256')
      .update(SYSTEM_PROMPT)
      .update(request.userPrompt)
      .digest('hex')
      .slice(0, 32);

    const source: GoldenDocSource = {
      id: input.sourceId,
      golden_doc_path: input.outputPath,
      generated_at: new Date().toISOString(),
      source_learning_ids: sourceIds,
      generation_prompt_hash: promptHash,
      generation_cost_usd: response.usage?.estimatedUsd,
      human_reviewed: false,
      needs_review: false,
      last_review_at: undefined
    };

    return { markdown, llm: response, source };
  }
}

function extractMarkdown(response: LlmCallResponse): string {
  if (response.rawText && response.rawText.length > 0) return response.rawText;
  const parsed = response.parsed as { markdown?: string; text?: string } | null;
  if (parsed && typeof parsed.markdown === 'string') return parsed.markdown;
  if (parsed && typeof parsed.text === 'string') return parsed.text;
  return '';
}

// ---------------------------------------------------------------------------
// Drift detector
// ---------------------------------------------------------------------------

export class GoldenDocDriftDetector {
  /**
   * Decide whether a committed golden doc needs review based on its
   * source learning records. If ANY linked record updated after the
   * doc was generated, mark for review.
   */
  needsReview(input: {
    source: GoldenDocSource;
    sourceLearnings: readonly LearningRecord[];
  }): boolean {
    if (input.source.needs_review) return true;
    const generatedAt = Date.parse(input.source.generated_at);
    if (Number.isNaN(generatedAt)) return true;
    for (const learning of input.sourceLearnings) {
      const updated = Date.parse(learning.last_synthesized);
      if (!Number.isNaN(updated) && updated > generatedAt) {
        return true;
      }
      if (learning.needs_review) return true;
    }
    return false;
  }
}

export { SYSTEM_PROMPT as GOLDEN_DOC_SYSTEM_PROMPT, buildUserPrompt };
