// SPDX-License-Identifier: Apache-2.0

/**
 * LearningRecord — Phase 5 entity.
 *
 * Per-topic synthesis aggregating confirmed lessons + open
 * architecture issues across many sessions. The unit a RAG layer
 * returns when a query matches a topic — one synthesised record
 * with linked source observations, rather than 47 fragmented hits.
 */

import { z } from 'zod';
import { TopicSchema } from './topics.js';

const NonEmpty = z.string().min(1);

export const PatternSchema = z.object({
  pattern: NonEmpty,
  when_to_apply: NonEmpty,
  evidence_refs: z.array(z.string()).default([])
});
export type Pattern = z.infer<typeof PatternSchema>;

export const AntiPatternSchema = z.object({
  anti_pattern: NonEmpty,
  why_avoid: NonEmpty,
  evidence_refs: z.array(z.string()).default([])
});
export type AntiPattern = z.infer<typeof AntiPatternSchema>;

export const CrossAppInconsistencySchema = z.object({
  description: NonEmpty,
  apps_involved: z.array(NonEmpty).min(2)
});
export type CrossAppInconsistency = z.infer<typeof CrossAppInconsistencySchema>;

export const LearningContentSchema = z.object({
  patterns: z.array(PatternSchema).default([]),
  anti_patterns: z.array(AntiPatternSchema).default([]),
  open_issues: z
    .array(
      z.object({
        observationId: NonEmpty,
        summary: NonEmpty,
        status: z.enum([
          'resolved',
          'workaround-applied',
          'known-limitation',
          'unresolved',
          'investigating'
        ])
      })
    )
    .default([]),
  cross_app_inconsistencies: z.array(CrossAppInconsistencySchema).default([]),
  rules_of_thumb: z.array(NonEmpty).default([])
});
export type LearningContent = z.infer<typeof LearningContentSchema>;

export const LearningRecordSchema = z.object({
  id: NonEmpty,
  topic: TopicSchema,
  last_synthesized: NonEmpty,
  applies_to: z.array(NonEmpty).default([]),
  summary: NonEmpty,
  content: LearningContentSchema,
  source_session_ids: z.array(z.string()).default([]),
  source_lesson_ids: z.array(z.string()).default([]),
  source_issue_ids: z.array(z.string()).default([]),
  confidence_distribution: z
    .object({
      confirmed: z.number().int().nonnegative().default(0),
      hypothesis: z.number().int().nonnegative().default(0)
    })
    .default({ confirmed: 0, hypothesis: 0 }),
  generation_cost_usd: z.number().nonnegative().optional(),
  generation_input_tokens: z.number().int().nonnegative().optional(),
  needs_review: z.boolean().default(false)
});
export type LearningRecord = z.infer<typeof LearningRecordSchema>;

export const LearningSourceInputSchema = z.object({
  /** Observation id. */
  id: NonEmpty,
  /** kind = 'lesson' or 'architecture_issue'. */
  kind: z.enum(['lesson', 'architecture_issue']),
  topic: TopicSchema,
  appliesTo: z.array(NonEmpty).default([]),
  confidence: z.enum(['confirmed', 'hypothesis']).optional(),
  archStatus: z
    .enum([
      'resolved',
      'workaround-applied',
      'known-limitation',
      'unresolved',
      'investigating'
    ])
    .optional(),
  content: NonEmpty,
  evidence: z.string().optional(),
  sessionId: z.string().optional()
});
export type LearningSourceInput = z.infer<typeof LearningSourceInputSchema>;
