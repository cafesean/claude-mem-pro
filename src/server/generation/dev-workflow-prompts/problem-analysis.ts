// SPDX-License-Identifier: Apache-2.0

import { ProblemAnalysisPayloadSchema } from '../../../core/schemas/dev-workflow-kind.js';
import type { PromptContext, PromptModule } from './types.js';
import { renderTopicsBlock } from './types.js';

const SYSTEM = `You are claude-mem's dev-workflow observation extractor for PROBLEM_ANALYSIS events.

The agent just diagnosed a bug. Capture the FULL debugging chain — symptoms, what was checked, the root cause, and why it was hard to find. This is high-value replay content: future-you should be able to re-recognize the same trap.

Output a single JSON object matching the problem_analysis schema.

Required fields:
- symptoms: exact error messages, observed behavior, reproduction steps — verbatim where possible
- investigation_path: ORDERED list of what was checked and what each step revealed. Each entry is a short sentence describing one investigation step.
- root_cause: the actual underlying mechanism in technical terms
- not_obvious: what made this hard to find (silent failure, error swallowed, default config trap, etc.)

Optional:
- fix: the change applied (commit ref or short description) if the fix landed
- topics: closed-vocab topics
- applies_to: app(s) or SDK(s) affected

Investigation path rules:
- "Looked at code" — REJECT, too vague
- "Checked auth middleware, confirmed token expiry uses lt not lte" — ACCEPT, specific
- Each step should describe an observation, not just an action

Never invent investigation steps. Use only what the conversation actually shows the agent checked.`;

function buildUser(ctx: PromptContext): string {
  return [
    renderTopicsBlock(ctx.topicsList),
    '',
    'Debugging narrative:',
    ctx.narrative,
    ctx.filesModified?.length ? `\nFiles modified: ${ctx.filesModified.join(', ')}` : '',
    ctx.gitContext?.commits?.length
      ? `\nRelevant commits: ${ctx.gitContext.commits.join(', ')}`
      : '',
    ctx.additionalContext ? `\nAdditional context:\n${ctx.additionalContext}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const RESPONSE_JSON_SCHEMA: object = {
  type: 'object',
  required: ['symptoms', 'investigation_path', 'root_cause', 'not_obvious'],
  properties: {
    symptoms: { type: 'string', minLength: 1 },
    investigation_path: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 }
    },
    root_cause: { type: 'string', minLength: 1 },
    not_obvious: { type: 'string', minLength: 1 },
    fix: { type: 'string' },
    topics: { type: 'array', items: { type: 'string' } },
    applies_to: { type: 'array', items: { type: 'string' } }
  }
};

const problemAnalysisPromptModule: PromptModule = {
  kind: 'problem_analysis',
  model: 'sonnet',
  systemPrompt: SYSTEM,
  buildUserPrompt: buildUser,
  responseJsonSchema: RESPONSE_JSON_SCHEMA,
  responseZod: ProblemAnalysisPayloadSchema.omit({ kind: true })
};

export default problemAnalysisPromptModule;
