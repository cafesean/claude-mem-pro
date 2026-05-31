// SPDX-License-Identifier: Apache-2.0

/**
 * dev-workflow prompt registry — Phase 1.4.
 *
 * Static map of every DevWorkflowKind to its prompt module + model tier.
 * This module does NOT touch the existing generation pipeline; consumers
 * (Phase 1.6+) wire the registry into ProviderObservationGenerator.
 */

import type { DevWorkflowKind } from '../../../core/schemas/dev-workflow-kind.js';
import architectureIssuePromptModule from './architecture-issue.js';
import decisionPromptModule from './decision.js';
import lessonPromptModule from './lesson.js';
import problemAnalysisPromptModule from './problem-analysis.js';
import sdkNotePromptModule from './sdk-note.js';
import userCorrectionPromptModule from './user-correction.js';
import { KIND_MODEL } from './types.js';
import type { ModelTier, PromptContext, PromptModule } from './types.js';

export { KIND_MODEL };
export type { ModelTier, PromptContext, PromptModule };

/**
 * Modules for the six new dev-workflow kinds. The three legacy kinds
 * (change, feature, discovery) continue to use claude-mem's existing
 * prompt-builder — they have no entry here.
 */
export const DEV_WORKFLOW_PROMPT_MODULES: Partial<Record<DevWorkflowKind, PromptModule>> = {
  architecture_issue: architectureIssuePromptModule,
  lesson: lessonPromptModule,
  user_correction: userCorrectionPromptModule,
  sdk_note: sdkNotePromptModule,
  problem_analysis: problemAnalysisPromptModule,
  decision: decisionPromptModule
};

export function getPromptModule(kind: DevWorkflowKind): PromptModule | null {
  return DEV_WORKFLOW_PROMPT_MODULES[kind] ?? null;
}

export function modelForKind(kind: DevWorkflowKind): ModelTier {
  return KIND_MODEL[kind];
}

/**
 * List the kinds that have an opted-in dev-workflow prompt module. Used by
 * the future kind detector to know which kinds it can route to.
 */
export function listEnabledKinds(): DevWorkflowKind[] {
  return Object.keys(DEV_WORKFLOW_PROMPT_MODULES) as DevWorkflowKind[];
}
