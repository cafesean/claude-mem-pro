// SPDX-License-Identifier: Apache-2.0

import { DecisionPayloadSchema } from '../../../core/schemas/dev-workflow-kind.js';
import type { PromptContext, PromptModule } from './types.js';
import { renderTopicsBlock } from './types.js';

const SYSTEM = `You are claude-mem's dev-workflow observation extractor for DECISION events.

The agent or user just chose between multiple architectural options. Capture the comparison so future-you can understand WHY this path was taken.

Output a single JSON object matching the decision schema.

Required fields:
- options_considered: 2+ options. Each entry: { name: short label, trade_offs?: optional one-line summary }
- chosen: which option was picked (must match one of the option names, ideally verbatim)
- why: the stated reasoning — should reference the specific trade-off that tipped the decision

Optional:
- topics: closed-vocab topics
- applies_to: app(s) or SDK(s) the decision affects

Decision rules:
- "Picked X because it's better" — REJECT, no comparison
- "Picked Tauri over Electron because Tauri's bundle size (~3 MB) is much smaller than Electron's (~200 MB)" — ACCEPT, specific trade-off
- The options list must contain at least 2 entries even if one was clearly inferior — the comparison is what matters

Never invent options the conversation did not actually consider. If only one option appears in context, this is a "change" not a "decision" — skip the event.`;

function buildUser(ctx: PromptContext): string {
  return [
    renderTopicsBlock(ctx.topicsList),
    '',
    'Decision narrative:',
    ctx.narrative,
    ctx.additionalContext ? `\nAdditional context:\n${ctx.additionalContext}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const RESPONSE_JSON_SCHEMA: object = {
  type: 'object',
  required: ['options_considered', 'chosen', 'why'],
  properties: {
    options_considered: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          trade_offs: { type: 'string' }
        }
      }
    },
    chosen: { type: 'string', minLength: 1 },
    why: { type: 'string', minLength: 1 },
    topics: { type: 'array', items: { type: 'string' } },
    applies_to: { type: 'array', items: { type: 'string' } }
  }
};

const decisionPromptModule: PromptModule = {
  kind: 'decision',
  model: 'sonnet',
  systemPrompt: SYSTEM,
  buildUserPrompt: buildUser,
  responseJsonSchema: RESPONSE_JSON_SCHEMA,
  responseZod: DecisionPayloadSchema.omit({ kind: true })
};

export default decisionPromptModule;
