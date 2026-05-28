// SPDX-License-Identifier: Apache-2.0

/**
 * SessionRecord — Phase 3 entity.
 *
 * Structured representation of a single dev-workflow session that
 * absorbs the YAML schema used by the dev-workflow plugin's
 * /session-start, /session-update, and /session-end commands.
 *
 * A session_record is synthesised from claude-mem observations + the
 * conversation transcript + git state at boundary time. Once persisted,
 * it can be rendered back to markdown (Phase 4) so the existing
 * dev-workflow `_ai/sessions/*.md` workflow keeps producing the same
 * artefacts while the structured data lives in claude-mem.
 */

import { z } from 'zod';
import { TopicSchema } from './topics.js';
import { DEV_WORKFLOW_KINDS } from './dev-workflow-kind.js';

const NonEmpty = z.string().min(1);

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const SessionStatusSchema = z.enum([
  'in-progress',
  'completed',
  'blocked',
  'paused'
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionTypeSchema = z.enum([
  'feature',
  'bugfix',
  'refactor',
  'investigation',
  'qa',
  'migration',
  'infrastructure'
]);
export type SessionType = z.infer<typeof SessionTypeSchema>;

// ---------------------------------------------------------------------------
// Sub-records
// ---------------------------------------------------------------------------

export const CommitEntrySchema = z.object({
  hash: NonEmpty,
  message: NonEmpty,
  files: z.array(z.string()).default([])
});
export type CommitEntry = z.infer<typeof CommitEntrySchema>;

export const FileChangeSchema = z.object({
  path: NonEmpty,
  /** M, A, D, R per `git diff --name-status`. */
  changeType: z.enum(['M', 'A', 'D', 'R']),
  description: z.string().optional()
});
export type FileChange = z.infer<typeof FileChangeSchema>;

export const GitStatusSnapshotSchema = z.object({
  branch: NonEmpty.optional(),
  lastCommit: z.string().optional(),
  workingTree: z.enum(['clean', 'dirty']).optional(),
  uncommittedCount: z.number().int().nonnegative().optional()
});
export type GitStatusSnapshot = z.infer<typeof GitStatusSnapshotSchema>;

export const SessionUpdateSchema = z.object({
  timestamp: NonEmpty,
  what_changed: NonEmpty,
  /** Reference to a problem_analysis observation if present. */
  problem_analysis_ref: z.string().optional(),
  implementation_details: z.string().default(''),
  commit_log: z.array(CommitEntrySchema).default([]),
  files_changed: z.array(FileChangeSchema).default([]),
  git_status: GitStatusSnapshotSchema.optional()
});
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>;

export const ContextDocRefSchema = z.object({
  document: NonEmpty,
  path: NonEmpty,
  why_it_matters: NonEmpty
});
export type ContextDocRef = z.infer<typeof ContextDocRefSchema>;

export const SdkNotesBlockSchema = z
  .record(z.string(), z.string())
  .default({});
export type SdkNotesBlock = z.infer<typeof SdkNotesBlockSchema>;

/**
 * References to observations of a particular kind. The record stores
 * IDs only; render layer hydrates against the observations table.
 */
export const ObservationRefSchema = z.object({
  observationId: NonEmpty,
  /** Cached title for fast rendering — re-hydrate if observation changes. */
  cachedTitle: z.string().optional(),
  /** Optional ordering / display weight. */
  weight: z.number().optional()
});
export type ObservationRef = z.infer<typeof ObservationRefSchema>;

// ---------------------------------------------------------------------------
// SessionRecord top-level schema
// ---------------------------------------------------------------------------

export const SessionRecordContentSchema = z.object({
  objective: z.string().default(''),
  updates: z.array(SessionUpdateSchema).default([]),
  sdk_notes: SdkNotesBlockSchema,
  architecture_issues: z.array(ObservationRefSchema).default([]),
  context_documents: z.array(ContextDocRefSchema).default([]),
  lessons_learned: z.array(ObservationRefSchema).default([]),
  user_steering: z.array(ObservationRefSchema).default([]),
  next_steps: z.array(NonEmpty).default([])
});
export type SessionRecordContent = z.infer<typeof SessionRecordContentSchema>;

export const SessionRecordSchema = z.object({
  id: NonEmpty,
  /** claude-mem session id this record is anchored to. */
  session_id: NonEmpty,
  title: NonEmpty,
  /** YYYY-MM-DD. */
  date: NonEmpty,
  projects: z.array(NonEmpty).default([]),
  branch: z.string().optional(),
  status: SessionStatusSchema,
  type: SessionTypeSchema,
  topics: z.array(TopicSchema).default([]),
  tags: z.array(z.string()).default([]),
  /** ISO-8601 timestamp. */
  last_updated: NonEmpty,
  sdk_touched: z.array(z.string()).default([]),
  apps_touched: z.array(z.string()).default([]),
  commits: z.array(z.string()).default([]),
  related_sessions: z.array(z.string()).default([]),
  specs: z.array(z.string()).default([]),
  content: SessionRecordContentSchema,
  /** Observation ids contributing to this record (back-link). */
  observation_refs: z.array(z.string()).default([]),
  /** Provenance — synthesis cost + duration. */
  generation_metadata: z
    .object({
      synthesized_at: z.string().optional(),
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
      cost_usd: z.number().nonnegative().optional(),
      synthesis_model: z.string().optional()
    })
    .optional()
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;

// ---------------------------------------------------------------------------
// Synthesis inputs
// ---------------------------------------------------------------------------

export const SynthesisObservationInputSchema = z.object({
  id: NonEmpty,
  kind: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().optional()
});
export type SynthesisObservationInput = z.infer<typeof SynthesisObservationInputSchema>;

export const SynthesisInputsSchema = z.object({
  sessionId: NonEmpty,
  projectName: z.string().optional(),
  observations: z.array(SynthesisObservationInputSchema).default([]),
  /** Optional excerpts from the conversation. */
  transcriptExcerpt: z.string().optional(),
  git: z
    .object({
      branch: z.string().optional(),
      commits: z.array(z.string()).default([]),
      status: GitStatusSnapshotSchema.optional()
    })
    .optional(),
  specPaths: z.array(z.string()).default([])
});
export type SynthesisInputs = z.infer<typeof SynthesisInputsSchema>;

/**
 * Allow-list of legacy kinds that may appear in observations. Kept in
 * sync with DEV_WORKFLOW_KINDS so callers can filter inputs.
 */
export const KNOWN_KIND_VALUES: ReadonlySet<string> = new Set(DEV_WORKFLOW_KINDS);
