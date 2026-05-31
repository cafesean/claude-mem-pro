// SPDX-License-Identifier: Apache-2.0

import { UserCorrectionPayloadSchema } from '../../../core/schemas/dev-workflow-kind.js';
import type { PromptContext, PromptModule } from './types.js';
import { renderTopicsBlock } from './types.js';

const SYSTEM = `You are claude-mem's dev-workflow observation extractor for USER_CORRECTION events.

The user just corrected the agent's direction. Capture this as TRAINING DATA — it reveals where the agent needs improvement.

Output a single JSON object matching the user_correction schema.

Required fields:
- verbatim_quote: the user's EXACT words. Do not paraphrase. Preserve casing, punctuation, ellipses.
- agent_did_wrong: what the agent was doing or about to do — be specific (action + reasoning)
- root_cause: WHY the agent misunderstood — ambiguous name, missing context, wrong assumption, forgotten prior instruction, default human-frame bias, etc.

Optional:
- lesson: what to do differently in future (concise, actionable)
- signal_category: "rejection" (no/stop/wrong), "past-reference" (we said, last time, already), "direct" (that's not, should be, instead), or "style" (too much/long/verbose)
- topics: closed-vocab topics if applicable

Quote rules:
- Preserve apostrophes, slashes, em-dashes
- Do NOT clean up typos
- Do NOT translate
- If the user wrote multiple sentences, keep the directly-correcting sentence(s) only

Never invent. If the user message is not actually a correction (e.g. an "Ok" or "say hi"), do NOT emit an observation — skip the event.`;

function buildUser(ctx: PromptContext): string {
  return [
    renderTopicsBlock(ctx.topicsList),
    '',
    'User message:',
    ctx.userMessage ?? '(missing — caller did not provide)',
    ctx.recentAgentActions?.length
      ? `\nMost recent agent actions (oldest first):\n${ctx.recentAgentActions
          .map((a, i) => `  ${i + 1}. ${a}`)
          .join('\n')}`
      : '',
    ctx.narrative ? `\nSession narrative for context:\n${ctx.narrative}` : '',
    ctx.additionalContext ? `\nAdditional context:\n${ctx.additionalContext}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const RESPONSE_JSON_SCHEMA: object = {
  type: 'object',
  required: ['verbatim_quote', 'agent_did_wrong', 'root_cause'],
  properties: {
    verbatim_quote: { type: 'string', minLength: 1 },
    agent_did_wrong: { type: 'string', minLength: 1 },
    root_cause: { type: 'string', minLength: 1 },
    lesson: { type: 'string' },
    signal_category: {
      type: 'string',
      enum: ['rejection', 'past-reference', 'direct', 'style']
    },
    topics: { type: 'array', items: { type: 'string' } }
  }
};

const userCorrectionPromptModule: PromptModule = {
  kind: 'user_correction',
  model: 'haiku',
  systemPrompt: SYSTEM,
  buildUserPrompt: buildUser,
  responseJsonSchema: RESPONSE_JSON_SCHEMA,
  responseZod: UserCorrectionPayloadSchema.omit({ kind: true })
};

export default userCorrectionPromptModule;
