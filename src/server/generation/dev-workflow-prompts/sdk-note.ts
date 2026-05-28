// SPDX-License-Identifier: Apache-2.0

import { SdkNotePayloadSchema } from '../../../core/schemas/dev-workflow-kind.js';
import type { PromptContext, PromptModule } from './types.js';
import { renderTopicsBlock } from './types.js';

const SYSTEM = `You are claude-mem's dev-workflow observation extractor for SDK_NOTE events.

You are observing a development session that touched one of the shared SDK packages: @jetdevs/core, @jetdevs/framework, @jetdevs/cloud, @jetdevs/messaging, or @cadraos/sdk.

Capture an SDK-specific note: how the SDK is being used, a gap or workaround discovered, a cross-app inconsistency, or an SDK bug encountered.

Output a single JSON object matching the sdk_note schema.

Required fields:
- sdk_package: one of "@jetdevs/core" | "@jetdevs/framework" | "@jetdevs/cloud" | "@jetdevs/messaging" | "@cadraos/sdk" | "other"
- topics: closed-vocab topics (may be empty if no fit)
- applies_to: app(s) this note pertains to
- narrative: the SDK-specific finding — focus on the SDK contract, not the app code that consumed it

Note rules:
- Stay SDK-focused: "the cache pattern" → too generic. "core-sdk createRouterWithActor reads from session.user.currentOrgId" → SDK-focused
- Patterns, gaps, bugs, cross-app inconsistencies — all qualify
- App-only changes (no SDK contract surface) → do NOT emit sdk_note; let it be a "change" instead

Never invent SDK behavior. If the narrative does not reference a real SDK call site or contract, skip the event.`;

function buildUser(ctx: PromptContext): string {
  return [
    renderTopicsBlock(ctx.topicsList),
    '',
    'Session narrative:',
    ctx.narrative,
    ctx.filesModified?.length ? `\nFiles modified: ${ctx.filesModified.join(', ')}` : '',
    ctx.additionalContext ? `\nAdditional context:\n${ctx.additionalContext}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const RESPONSE_JSON_SCHEMA: object = {
  type: 'object',
  required: ['sdk_package', 'applies_to', 'narrative'],
  properties: {
    sdk_package: {
      type: 'string',
      enum: [
        '@jetdevs/core',
        '@jetdevs/framework',
        '@jetdevs/cloud',
        '@jetdevs/messaging',
        '@cadraos/sdk',
        'other'
      ]
    },
    topics: { type: 'array', items: { type: 'string' } },
    applies_to: { type: 'array', items: { type: 'string' } },
    narrative: { type: 'string', minLength: 1 }
  }
};

const sdkNotePromptModule: PromptModule = {
  kind: 'sdk_note',
  model: 'haiku',
  systemPrompt: SYSTEM,
  buildUserPrompt: buildUser,
  responseJsonSchema: RESPONSE_JSON_SCHEMA,
  responseZod: SdkNotePayloadSchema.omit({ kind: true })
};

export default sdkNotePromptModule;
