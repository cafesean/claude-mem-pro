// SPDX-License-Identifier: Apache-2.0

/**
 * dev-workflow observation kinds — typed metadata layered on top of
 * the existing MemoryItem schema.
 *
 * Existing claude-mem schema:
 *   memory_item.kind     ∈ {observation, summary, prompt, manual}
 *   memory_item.type     — free-form
 *   memory_item.concepts — free-form string array
 *   memory_item.metadata — JsonObject
 *
 * This module adds a structured contract that lives INSIDE metadata
 * under the key `dev_workflow`, so existing observation rows are
 * unaffected and existing queries keep working. The wider Phase 1
 * change is that observation generators can opt-in to writing a
 * `dev_workflow` payload validated by these Zod schemas.
 *
 * See spec: monorepo/_context/plugins/claude-mem/_specs/dev-workflow-schema-absorb/
 */

import { z } from 'zod';
import { TopicSchema } from './topics.js';

// ---------------------------------------------------------------------------
// Kind enum
// ---------------------------------------------------------------------------

export const DEV_WORKFLOW_KINDS = [
  'change',
  'feature',
  'discovery',
  'architecture_issue',
  'lesson',
  'user_correction',
  'sdk_note',
  'problem_analysis',
  'decision'
] as const satisfies readonly string[];

export type DevWorkflowKind = (typeof DEV_WORKFLOW_KINDS)[number];

export const DevWorkflowKindSchema = z.enum(DEV_WORKFLOW_KINDS as unknown as [string, ...string[]]);

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const TopicsArrayNonEmpty = z.array(TopicSchema).min(1);
const NonEmptyString = z.string().min(1);

const AppliesTo = z.array(NonEmptyString).default([]);
const Evidence = z.union([
  NonEmptyString,
  z.object({
    commit: z.string().optional(),
    file: z.string().optional(),
    line: z.number().int().nonnegative().optional(),
    note: z.string().optional()
  })
]);

const ArchIssueStatus = z.enum([
  'resolved',
  'workaround-applied',
  'known-limitation',
  'unresolved',
  'investigating'
]);

const Confidence = z.enum(['confirmed', 'hypothesis']);

const SdkPackage = z.enum([
  '@jetdevs/core',
  '@jetdevs/framework',
  '@jetdevs/cloud',
  '@jetdevs/messaging',
  '@cadraos/sdk',
  'other'
]);

// ---------------------------------------------------------------------------
// Per-kind metadata schemas
// ---------------------------------------------------------------------------

export const ChangePayloadSchema = z.object({
  kind: z.literal('change'),
  topics: z.array(TopicSchema).default([]),
  applies_to: AppliesTo,
  narrative: NonEmptyString,
  files_modified: z.array(z.string()).default([]),
  files_read: z.array(z.string()).default([])
});

export const FeaturePayloadSchema = z.object({
  kind: z.literal('feature'),
  topics: z.array(TopicSchema).default([]),
  applies_to: AppliesTo,
  narrative: NonEmptyString,
  files_modified: z.array(z.string()).default([]),
  commit_hashes: z.array(z.string()).default([])
});

export const DiscoveryPayloadSchema = z.object({
  kind: z.literal('discovery'),
  topics: z.array(TopicSchema).default([]),
  applies_to: AppliesTo,
  narrative: NonEmptyString,
  fact: NonEmptyString
});

export const ArchitectureIssuePayloadSchema = z.object({
  kind: z.literal('architecture_issue'),
  status: ArchIssueStatus,
  topics: TopicsArrayNonEmpty,
  applies_to: AppliesTo,
  issue: NonEmptyString,
  impact: NonEmptyString,
  correct_pattern: NonEmptyString.optional()
});

export const LessonPayloadSchema = z.object({
  kind: z.literal('lesson'),
  topics: TopicsArrayNonEmpty,
  applies_to: AppliesTo,
  confidence: Confidence,
  evidence: Evidence,
  lesson: NonEmptyString
});

export const UserCorrectionPayloadSchema = z.object({
  kind: z.literal('user_correction'),
  topics: z.array(TopicSchema).default([]),
  verbatim_quote: NonEmptyString,
  agent_did_wrong: NonEmptyString,
  root_cause: NonEmptyString,
  lesson: z.string().optional(),
  signal_category: z
    .enum(['rejection', 'past-reference', 'direct', 'style'])
    .optional()
});

export const SdkNotePayloadSchema = z.object({
  kind: z.literal('sdk_note'),
  sdk_package: SdkPackage,
  topics: z.array(TopicSchema).default([]),
  applies_to: AppliesTo,
  narrative: NonEmptyString
});

export const ProblemAnalysisPayloadSchema = z.object({
  kind: z.literal('problem_analysis'),
  topics: z.array(TopicSchema).default([]),
  applies_to: AppliesTo,
  symptoms: NonEmptyString,
  investigation_path: z.array(NonEmptyString).min(1),
  root_cause: NonEmptyString,
  not_obvious: NonEmptyString,
  fix: z.string().optional()
});

export const DecisionPayloadSchema = z.object({
  kind: z.literal('decision'),
  topics: z.array(TopicSchema).default([]),
  applies_to: AppliesTo,
  options_considered: z
    .array(
      z.object({
        name: NonEmptyString,
        trade_offs: z.string().optional()
      })
    )
    .min(2),
  chosen: NonEmptyString,
  why: NonEmptyString
});

// ---------------------------------------------------------------------------
// Discriminated union + dispatcher
// ---------------------------------------------------------------------------

export const DevWorkflowPayloadSchema = z.discriminatedUnion('kind', [
  ChangePayloadSchema,
  FeaturePayloadSchema,
  DiscoveryPayloadSchema,
  ArchitectureIssuePayloadSchema,
  LessonPayloadSchema,
  UserCorrectionPayloadSchema,
  SdkNotePayloadSchema,
  ProblemAnalysisPayloadSchema,
  DecisionPayloadSchema
]);

export type DevWorkflowPayload = z.infer<typeof DevWorkflowPayloadSchema>;
export type ChangePayload = z.infer<typeof ChangePayloadSchema>;
export type FeaturePayload = z.infer<typeof FeaturePayloadSchema>;
export type DiscoveryPayload = z.infer<typeof DiscoveryPayloadSchema>;
export type ArchitectureIssuePayload = z.infer<typeof ArchitectureIssuePayloadSchema>;
export type LessonPayload = z.infer<typeof LessonPayloadSchema>;
export type UserCorrectionPayload = z.infer<typeof UserCorrectionPayloadSchema>;
export type SdkNotePayload = z.infer<typeof SdkNotePayloadSchema>;
export type ProblemAnalysisPayload = z.infer<typeof ProblemAnalysisPayloadSchema>;
export type DecisionPayload = z.infer<typeof DecisionPayloadSchema>;

/**
 * Validate a dev_workflow metadata payload using the discriminated union.
 * Returns a parse result object — no throwing — so callers can decide
 * fail-open vs reject behavior.
 */
export function parseDevWorkflowPayload(
  data: unknown
): { ok: true; payload: DevWorkflowPayload } | { ok: false; error: z.ZodError } {
  const result = DevWorkflowPayloadSchema.safeParse(data);
  if (result.success) {
    return { ok: true, payload: result.data };
  }
  return { ok: false, error: result.error };
}

/**
 * Extract a dev_workflow payload from a memory item's metadata field.
 * Returns null if the payload key is absent.
 */
export function extractDevWorkflowPayload(
  metadata: Record<string, unknown> | null | undefined
): DevWorkflowPayload | null {
  if (!metadata) return null;
  const raw = (metadata as Record<string, unknown>).dev_workflow;
  if (raw === undefined || raw === null) return null;
  const result = DevWorkflowPayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Build a memory_item.metadata payload with a validated dev_workflow block.
 * Merges into existing metadata; does not overwrite unrelated keys.
 */
export function withDevWorkflowPayload(
  base: Record<string, unknown> | null | undefined,
  payload: DevWorkflowPayload
): Record<string, unknown> {
  const parsed = DevWorkflowPayloadSchema.parse(payload);
  return {
    ...(base ?? {}),
    dev_workflow: parsed
  };
}
