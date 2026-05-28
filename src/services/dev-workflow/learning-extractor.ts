// SPDX-License-Identifier: Apache-2.0

/**
 * Per-topic learning extractor — Phase 5.
 *
 * Aggregates lesson + architecture_issue observations for a single
 * topic and synthesises them into a LearningRecord via the injected
 * LlmCaller. Sonnet by default — synthesis quality matters more than
 * cost at this layer.
 *
 * Idempotent: re-running on identical inputs produces the same record
 * (temperature 0). Drift detection elsewhere flags topics that need
 * re-extraction when new lessons land.
 */

import { z } from 'zod';
import { TopicSchema, type Topic } from '../../core/schemas/topics.js';
import {
  LearningContentSchema,
  LearningRecordSchema,
  type LearningContent,
  type LearningRecord,
  type LearningSourceInput
} from '../../core/schemas/learning-record.js';
import type {
  LlmCallRequest,
  LlmCallResponse,
  LlmCaller,
  ModelTier
} from '../../server/generation/dev-workflow-prompts/enrichment-service.js';

// ---------------------------------------------------------------------------
// Inputs / options
// ---------------------------------------------------------------------------

export interface ExtractOptions {
  /** Synthesis model tier. Default 'sonnet'. */
  model?: ModelTier;
  /** Minimum lesson count required to synthesise. Default 3. */
  minLessons?: number;
  /** When true, accept invalid output and surface the validation error. */
  failOpen?: boolean;
}

export interface ExtractResult {
  record: LearningRecord | null;
  llm?: LlmCallResponse;
  validationError?: z.ZodError;
  skipped?: 'below_threshold' | 'no_inputs';
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are claude-mem's dev-workflow learning extractor.

Your job is to consolidate per-topic lessons + architecture issues from many sessions into a single LearningRecord — the canonical "what we know about topic X" entry.

Required output keys:
  patterns                  — proven approaches with when_to_apply + evidence_refs
  anti_patterns             — what NOT to do with why_avoid + evidence_refs
  open_issues               — unresolved architecture issues w/ observationId + status
  cross_app_inconsistencies — places where different apps diverge in the same area
  rules_of_thumb            — terse, durable rules (one sentence each)

CRITICAL:
  - evidence_refs and open_issues.observationId reference IDs from the input set ONLY.
    Do NOT invent IDs.
  - rules_of_thumb: short and specific ("always set scope:user on cached org-scoped routes"),
    not generic advice.
  - Reflect the actual confidence distribution. If most lessons are hypotheses, say so.
  - If two lessons contradict, surface that as a cross_app_inconsistency.`;

function renderSourceForPrompt(source: LearningSourceInput): string {
  const tail = source.evidence ? ` (evidence: ${source.evidence})` : '';
  const appliesTo = source.appliesTo.length ? ` applies_to=${source.appliesTo.join(',')}` : '';
  const status = source.archStatus ? ` status=${source.archStatus}` : '';
  const confidence = source.confidence ? ` confidence=${source.confidence}` : '';
  return `  - id=${source.id} kind=${source.kind}${confidence}${status}${appliesTo}\n      ${source.content}${tail}`;
}

function buildUserPrompt(topic: Topic, sources: readonly LearningSourceInput[]): string {
  const lessons = sources.filter((s) => s.kind === 'lesson');
  const issues = sources.filter((s) => s.kind === 'architecture_issue');
  return [
    `Topic: ${topic}`,
    '',
    `Lessons (${lessons.length}):`,
    lessons.map(renderSourceForPrompt).join('\n') || '  (none)',
    '',
    `Architecture issues (${issues.length}):`,
    issues.map(renderSourceForPrompt).join('\n') || '  (none)',
    '',
    'Return a JSON object that matches the LearningContent schema. Also emit a one-paragraph summary in the prompt response when asked; the host will attach it.'
  ].join('\n');
}

const LEARNING_RESPONSE_SCHEMA: object = {
  type: 'object',
  required: ['patterns', 'anti_patterns', 'open_issues', 'cross_app_inconsistencies', 'rules_of_thumb', 'summary'],
  properties: {
    summary: { type: 'string' },
    patterns: { type: 'array' },
    anti_patterns: { type: 'array' },
    open_issues: { type: 'array' },
    cross_app_inconsistencies: { type: 'array' },
    rules_of_thumb: { type: 'array', items: { type: 'string' } }
  }
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LearningExtractor {
  private readonly model: ModelTier;
  private readonly minLessons: number;
  private readonly failOpen: boolean;

  constructor(
    private readonly llmCaller: LlmCaller,
    options: ExtractOptions = {}
  ) {
    this.model = options.model ?? 'sonnet';
    this.minLessons = options.minLessons ?? 3;
    this.failOpen = options.failOpen ?? false;
  }

  async extract(
    topic: Topic,
    sources: readonly LearningSourceInput[],
    record: { id: string }
  ): Promise<ExtractResult> {
    const parsedTopic = TopicSchema.parse(topic);

    if (!sources.length) {
      return { record: null, skipped: 'no_inputs' };
    }

    const lessons = sources.filter((s) => s.kind === 'lesson');
    if (lessons.length < this.minLessons) {
      return { record: null, skipped: 'below_threshold' };
    }

    const request: LlmCallRequest = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(parsedTopic, sources),
      model: this.model,
      responseJsonSchema: LEARNING_RESPONSE_SCHEMA
    };

    const response = await this.llmCaller(request);
    const raw = response.parsed as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') {
      if (this.failOpen) {
        return {
          record: null,
          llm: response,
          validationError: new z.ZodError([
            {
              code: 'custom',
              path: [],
              message: 'llm returned non-object response',
              input: raw
            }
          ])
        };
      }
      throw new Error('learning_extract: llm returned non-object response');
    }

    const summary = typeof raw.summary === 'string' ? raw.summary : '';
    const contentResult = LearningContentSchema.safeParse(raw);
    if (!contentResult.success) {
      if (this.failOpen) {
        return { record: null, llm: response, validationError: contentResult.error };
      }
      throw new Error(
        `learning_extract: content validation failed: ${contentResult.error.issues[0]?.message}`
      );
    }

    const confirmed = lessons.filter((l) => l.confidence === 'confirmed').length;
    const hypothesis = lessons.filter((l) => l.confidence === 'hypothesis').length;
    const appliesTo = uniq(sources.flatMap((s) => s.appliesTo));
    const sourceSessionIds = uniq(sources.map((s) => s.sessionId).filter((v): v is string => Boolean(v)));

    const candidate = LearningRecordSchema.parse({
      id: record.id,
      topic: parsedTopic,
      last_synthesized: new Date().toISOString(),
      applies_to: appliesTo,
      summary: summary || `Synthesised learnings for ${parsedTopic}.`,
      content: contentResult.data,
      source_session_ids: sourceSessionIds,
      source_lesson_ids: lessons.map((l) => l.id),
      source_issue_ids: sources.filter((s) => s.kind === 'architecture_issue').map((s) => s.id),
      confidence_distribution: { confirmed, hypothesis },
      generation_cost_usd: response.usage?.estimatedUsd,
      generation_input_tokens: response.usage?.inputTokens,
      needs_review: false
    });

    return { record: candidate, llm: response };
  }
}

function uniq<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

// ---------------------------------------------------------------------------
// Drift detector — flags topics that need re-extraction
// ---------------------------------------------------------------------------

export interface DriftDetectorOptions {
  /** Days a record is considered fresh before flagging on any change. */
  staleAfterDays?: number;
}

export class LearningDriftDetector {
  private readonly staleAfterDays: number;

  constructor(options: DriftDetectorOptions = {}) {
    this.staleAfterDays = options.staleAfterDays ?? 14;
  }

  /**
   * Decide whether a learning record needs re-extraction.
   */
  needsReview(input: {
    record: LearningRecord;
    /** Number of NEW confirmed lessons since last_synthesized. */
    newConfirmedLessons: number;
    /** Number of architecture_issue status changes since last_synthesized. */
    archStatusChanges: number;
  }): boolean {
    if (input.record.needs_review) return true;
    if (input.newConfirmedLessons > 0) return true;
    if (input.archStatusChanges > 0) return true;

    const lastDate = Date.parse(input.record.last_synthesized);
    if (Number.isNaN(lastDate)) return true;
    const ageDays = (Date.now() - lastDate) / (24 * 60 * 60 * 1000);
    return ageDays > this.staleAfterDays;
  }
}

export { SYSTEM_PROMPT, LEARNING_RESPONSE_SCHEMA, buildUserPrompt };
