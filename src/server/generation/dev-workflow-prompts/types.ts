// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import {
  DEV_WORKFLOW_KINDS,
  DevWorkflowKindSchema,
  DevWorkflowPayloadSchema
} from '../../../core/schemas/dev-workflow-kind.js';
import type { DevWorkflowKind } from '../../../core/schemas/dev-workflow-kind.js';

export type { DevWorkflowKind } from '../../../core/schemas/dev-workflow-kind.js';

/**
 * Which Anthropic tier handles each kind.
 *
 * Mechanical kinds (low reasoning, structured output adherence) stay on
 * Haiku for cost. Reasoning kinds (causal analysis, comparison, evidence
 * grading) escalate to Sonnet for quality. See spec § Phase 1.4.
 */
export type ModelTier = 'haiku' | 'sonnet';

export const KIND_MODEL: Record<DevWorkflowKind, ModelTier> = {
  change: 'haiku',
  feature: 'haiku',
  discovery: 'haiku',
  sdk_note: 'haiku',
  user_correction: 'haiku',
  architecture_issue: 'sonnet',
  lesson: 'sonnet',
  problem_analysis: 'sonnet',
  decision: 'sonnet'
};

/**
 * Context passed into prompt-builder per kind. Adapters fill what they have;
 * unknown fields are undefined.
 */
export interface PromptContext {
  /** Raw narrative or LLM-extracted text describing what happened. */
  narrative: string;
  /** Closed taxonomy of topic strings to inject into the prompt. */
  topicsList: readonly string[];
  /** Files modified in the triggering event (Edit/Write/Bash). */
  filesModified?: readonly string[];
  /** Files read in the triggering event. */
  filesRead?: readonly string[];
  /** Recent user message — required for `user_correction`. */
  userMessage?: string;
  /** Recent agent actions — required for `user_correction`. */
  recentAgentActions?: readonly string[];
  /** Git context: branch, commit hashes, working tree status. */
  gitContext?: {
    branch?: string;
    commits?: readonly string[];
    status?: string;
  };
  /** Free-form additional context (transcript excerpt, tool output). */
  additionalContext?: string;
}

/**
 * What every dev-workflow prompt module exports.
 */
export interface PromptModule {
  kind: DevWorkflowKind;
  model: ModelTier;
  /** Static system prompt — describes role, output format, taxonomy rules. */
  systemPrompt: string;
  /** Build the user message from per-call context. */
  buildUserPrompt(ctx: PromptContext): string;
  /**
   * Provider-side response schema (JSON Schema) to enforce via the
   * Anthropic tool_use channel. Mirrors the Zod schema for the kind.
   */
  responseJsonSchema: object;
  /** Zod parser that validates parsed JSON output before storage. */
  responseZod: z.ZodTypeAny;
}

/**
 * Helper — produces the topics block embedded in every system prompt.
 */
export function renderTopicsBlock(topics: readonly string[]): string {
  return [
    'CLOSED TOPIC VOCABULARY — use only these values for any `topics` field:',
    topics.join(', '),
    'If no topic fits, omit the field rather than inventing a new one.'
  ].join('\n');
}

export const ALL_KINDS = DEV_WORKFLOW_KINDS;
export { DevWorkflowKindSchema, DevWorkflowPayloadSchema };
