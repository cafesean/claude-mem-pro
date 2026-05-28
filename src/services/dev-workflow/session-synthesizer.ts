// SPDX-License-Identifier: Apache-2.0

/**
 * Session synthesiser — Phase 3 of dev-workflow-schema-absorb.
 *
 * Takes raw inputs gathered at session-boundary time (observations,
 * transcript excerpt, git context) and produces a structured
 * SessionRecord. The actual LLM call is delegated to a caller-injected
 * LlmCaller — same contract as the Phase 1 enrichment service.
 *
 * Synthesis is deterministic (temperature 0). Re-running on the same
 * inputs yields the same record up to LLM tie-breaking.
 *
 * This module owns no storage. The caller decides where to persist the
 * resulting record (e.g. a postgres session_records table).
 */

import { z } from 'zod';
import { TOPICS } from '../../core/schemas/topics.js';
import {
  SessionRecordContentSchema,
  SessionRecordSchema,
  SessionStatusSchema,
  SessionTypeSchema,
  type SessionRecord,
  type SessionRecordContent,
  type SynthesisInputs,
  type SynthesisObservationInput
} from '../../core/schemas/session-record.js';
import type {
  LlmCallRequest,
  LlmCallResponse,
  LlmCaller,
  ModelTier
} from '../../server/generation/dev-workflow-prompts/enrichment-service.js';

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

export interface SynthesiseOptions {
  /** Model tier for synthesis. Default 'sonnet'. */
  model?: ModelTier;
  /** Topics vocabulary; defaults to the locked TOPICS. */
  topicsList?: readonly string[];
  /** Max observations to send to the model. Default 200. */
  observationCap?: number;
  /** When true, accept records that fail validation, returning raw. */
  failOpen?: boolean;
}

export interface SynthesiseResult {
  /** Final validated record, or null on validation failure when failOpen=true. */
  record: SessionRecord | null;
  /** Raw LLM response. */
  llm: LlmCallResponse;
  /** Cost + duration metadata. */
  metadata: {
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
  /** Validation error if parse failed and failOpen=true. */
  validationError?: z.ZodError;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are claude-mem's dev-workflow session synthesiser.

Your job is to consolidate a session's observations + conversation excerpt + git state into a structured SessionRecord that mirrors the YAML schema used by the dev-workflow plugin's /session-start and /session-update commands.

OUTPUT: a single JSON object matching the SessionRecord content schema.

Required output keys:
  objective              — what the session was for, extracted from first user prompt + spec reads
  updates                — ordered list of update blocks clustered by feature boundaries
  sdk_notes              — map of SDK package name to a paragraph (e.g. { "@jetdevs/core": "..." })
  architecture_issues    — REFERENCES (observationId only) to observations of kind=architecture_issue
  context_documents      — table of files referenced
  lessons_learned        — REFERENCES to observations of kind=lesson
  user_steering          — REFERENCES to observations of kind=user_correction
  next_steps             — actionable items for resuming

CRITICAL RULES:
  - architecture_issues, lessons_learned, user_steering store ONLY references {observationId} — do NOT duplicate the content. Render layer hydrates them.
  - next_steps must be actionable, not vague ("commit cadra-web worktree changes", not "wrap up").
  - Use topics from the closed vocabulary only.
  - If a section has no input data, set it to an empty array or empty string, not null.
  - Never invent observations. Only reference observation IDs that appear in the provided list.`;

function renderObservationsForPrompt(observations: readonly SynthesisObservationInput[]): string {
  return observations
    .map((o, i) => `  ${i + 1}. id=${o.id} kind=${o.kind} :: ${o.content.slice(0, 240).replace(/\s+/g, ' ')}`)
    .join('\n');
}

function buildUserPrompt(inputs: SynthesisInputs, topicsList: readonly string[]): string {
  const observations = inputs.observations.slice(0, 200);
  return [
    'TOPIC VOCABULARY (use only these in the topics field):',
    topicsList.join(', '),
    '',
    inputs.projectName ? `Project: ${inputs.projectName}` : '',
    inputs.git?.branch ? `Branch: ${inputs.git.branch}` : '',
    inputs.git?.commits?.length
      ? `Commits: ${inputs.git.commits.join(', ')}`
      : '',
    inputs.specPaths.length ? `Spec docs referenced: ${inputs.specPaths.join(', ')}` : '',
    '',
    `Observations (${observations.length} provided):`,
    renderObservationsForPrompt(observations),
    '',
    inputs.transcriptExcerpt
      ? `Conversation excerpt:\n${inputs.transcriptExcerpt}`
      : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const SYNTHESIS_RESPONSE_SCHEMA: object = {
  type: 'object',
  required: ['objective', 'updates', 'sdk_notes', 'architecture_issues', 'context_documents', 'lessons_learned', 'user_steering', 'next_steps'],
  properties: {
    objective: { type: 'string' },
    updates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['timestamp', 'what_changed'],
        properties: {
          timestamp: { type: 'string' },
          what_changed: { type: 'string' },
          problem_analysis_ref: { type: 'string' },
          implementation_details: { type: 'string' },
          commit_log: { type: 'array' },
          files_changed: { type: 'array' },
          git_status: { type: 'object' }
        }
      }
    },
    sdk_notes: { type: 'object', additionalProperties: { type: 'string' } },
    architecture_issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['observationId'],
        properties: { observationId: { type: 'string' }, cachedTitle: { type: 'string' } }
      }
    },
    context_documents: {
      type: 'array',
      items: {
        type: 'object',
        required: ['document', 'path', 'why_it_matters'],
        properties: {
          document: { type: 'string' },
          path: { type: 'string' },
          why_it_matters: { type: 'string' }
        }
      }
    },
    lessons_learned: {
      type: 'array',
      items: {
        type: 'object',
        required: ['observationId'],
        properties: { observationId: { type: 'string' }, cachedTitle: { type: 'string' } }
      }
    },
    user_steering: {
      type: 'array',
      items: {
        type: 'object',
        required: ['observationId'],
        properties: { observationId: { type: 'string' }, cachedTitle: { type: 'string' } }
      }
    },
    next_steps: { type: 'array', items: { type: 'string' } }
  }
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SessionSynthesizer {
  private readonly topicsList: readonly string[];
  private readonly model: ModelTier;
  private readonly cap: number;
  private readonly failOpen: boolean;

  constructor(
    private readonly llmCaller: LlmCaller,
    options: SynthesiseOptions = {}
  ) {
    this.topicsList = options.topicsList ?? TOPICS;
    this.model = options.model ?? 'sonnet';
    this.cap = options.observationCap ?? 200;
    this.failOpen = options.failOpen ?? false;
  }

  async synthesise(
    inputs: SynthesisInputs,
    record: {
      id: string;
      title: string;
      date: string;
      status?: 'in-progress' | 'completed' | 'blocked' | 'paused';
      type?: 'feature' | 'bugfix' | 'refactor' | 'investigation' | 'qa' | 'migration' | 'infrastructure';
    }
  ): Promise<SynthesiseResult> {
    const startedAt = Date.now();
    const truncatedInputs: SynthesisInputs = {
      ...inputs,
      observations: inputs.observations.slice(0, this.cap)
    };

    const request: LlmCallRequest = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(truncatedInputs, this.topicsList),
      model: this.model,
      responseJsonSchema: SYNTHESIS_RESPONSE_SCHEMA
    };

    const llmResponse = await this.llmCaller(request);
    const durationMs = Date.now() - startedAt;

    const parsedContent = SessionRecordContentSchema.safeParse(llmResponse.parsed);
    if (!parsedContent.success) {
      if (this.failOpen) {
        return {
          record: null,
          llm: llmResponse,
          metadata: {
            durationMs,
            inputTokens: llmResponse.usage?.inputTokens,
            outputTokens: llmResponse.usage?.outputTokens,
            costUsd: llmResponse.usage?.estimatedUsd
          },
          validationError: parsedContent.error
        };
      }
      throw new Error(
        `session synthesis validation failed: ${parsedContent.error.issues[0]?.message ?? 'invalid'}`
      );
    }

    const observationRefs = inputs.observations.map((o) => o.id);
    const projects = inputs.projectName ? [inputs.projectName] : [];
    const candidate = SessionRecordSchema.parse({
      id: record.id,
      session_id: inputs.sessionId,
      title: record.title,
      date: record.date,
      projects,
      branch: inputs.git?.branch,
      status: SessionStatusSchema.parse(record.status ?? 'completed'),
      type: SessionTypeSchema.parse(record.type ?? 'feature'),
      topics: [],
      tags: [],
      last_updated: new Date().toISOString(),
      sdk_touched: [],
      apps_touched: projects,
      commits: inputs.git?.commits ?? [],
      related_sessions: [],
      specs: inputs.specPaths,
      content: parsedContent.data,
      observation_refs: observationRefs,
      generation_metadata: {
        synthesized_at: new Date().toISOString(),
        input_tokens: llmResponse.usage?.inputTokens,
        output_tokens: llmResponse.usage?.outputTokens,
        cost_usd: llmResponse.usage?.estimatedUsd,
        synthesis_model: llmResponse.modelId
      }
    });

    return {
      record: candidate,
      llm: llmResponse,
      metadata: {
        durationMs,
        inputTokens: llmResponse.usage?.inputTokens,
        outputTokens: llmResponse.usage?.outputTokens,
        costUsd: llmResponse.usage?.estimatedUsd
      }
    };
  }

  /**
   * Static helper — also exported so the prompt registry can be
   * inspected without standing the service up.
   */
  buildPromptForInspection(inputs: SynthesisInputs): LlmCallRequest {
    return {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(inputs, this.topicsList),
      model: this.model,
      responseJsonSchema: SYNTHESIS_RESPONSE_SCHEMA
    };
  }
}

export { SYSTEM_PROMPT, SYNTHESIS_RESPONSE_SCHEMA, buildUserPrompt };
