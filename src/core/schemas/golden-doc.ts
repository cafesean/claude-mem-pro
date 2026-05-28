// SPDX-License-Identifier: Apache-2.0

/**
 * GoldenDocSource — Phase 6 entity.
 *
 * Provenance row for an authoritative `_context/_arch/*.md`
 * document generated from one or more LearningRecord rows. Lets the
 * drift detector flag golden docs whose source learnings have moved
 * since the doc was committed.
 */

import { z } from 'zod';

const NonEmpty = z.string().min(1);

export const GoldenDocSourceSchema = z.object({
  id: NonEmpty,
  /** Filesystem path of the committed doc, e.g. _context/_arch/rls.md */
  golden_doc_path: NonEmpty,
  generated_at: NonEmpty,
  source_learning_ids: z.array(NonEmpty).default([]),
  generation_prompt_hash: NonEmpty,
  generation_cost_usd: z.number().nonnegative().optional(),
  human_reviewed: z.boolean().default(false),
  reviewer: z.string().optional(),
  needs_review: z.boolean().default(false),
  last_review_at: z.string().optional()
});
export type GoldenDocSource = z.infer<typeof GoldenDocSourceSchema>;
