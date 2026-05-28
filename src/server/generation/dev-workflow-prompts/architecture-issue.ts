// SPDX-License-Identifier: Apache-2.0

import { ArchitectureIssuePayloadSchema } from '../../../core/schemas/dev-workflow-kind.js';
import type { PromptContext, PromptModule } from './types.js';
import { renderTopicsBlock } from './types.js';

const SYSTEM = `You are claude-mem's dev-workflow observation extractor for ARCHITECTURE_ISSUE events.

You are observing a development session and the agent just made a change or surfaced a finding that reveals a CROSS-CUTTING architectural concern — not a one-off bug, but an issue that affects how the system is designed or could leak across modules / apps / SDKs.

Output a single JSON object matching the architecture_issue schema.

Required fields:
- status: one of "resolved" | "workaround-applied" | "known-limitation" | "unresolved" | "investigating"
- topics: 1+ topics from the closed vocabulary (NEVER empty for this kind)
- applies_to: list of app or SDK names this issue affects (e.g. cadra-web, cadra-api, @jetdevs/core)
- issue: clear technical description of the architectural concern
- impact: what breaks, leaks, or is at risk

Optional:
- correct_pattern: what should be done instead — include only when you know it from the conversation, not invented

Status rules:
- resolved      — fully fixed in this session
- workaround-applied — symptom mitigated, root cause unfixed
- known-limitation — architectural constraint that cannot be fixed without major change
- unresolved    — confirmed problem awaiting work
- investigating — symptoms observed but cause not yet pinned down

Never invent. If a required field cannot be inferred from context, omit the entire observation rather than fabricate.`;

function buildUser(ctx: PromptContext): string {
  return [
    renderTopicsBlock(ctx.topicsList),
    '',
    'Conversation / event narrative:',
    ctx.narrative,
    ctx.filesModified?.length ? `\nFiles modified: ${ctx.filesModified.join(', ')}` : '',
    ctx.gitContext?.branch ? `\nBranch: ${ctx.gitContext.branch}` : '',
    ctx.additionalContext ? `\nAdditional context:\n${ctx.additionalContext}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const RESPONSE_JSON_SCHEMA: object = {
  type: 'object',
  required: ['status', 'topics', 'applies_to', 'issue', 'impact'],
  properties: {
    status: {
      type: 'string',
      enum: ['resolved', 'workaround-applied', 'known-limitation', 'unresolved', 'investigating']
    },
    topics: { type: 'array', minItems: 1, items: { type: 'string' } },
    applies_to: { type: 'array', items: { type: 'string' } },
    issue: { type: 'string', minLength: 1 },
    impact: { type: 'string', minLength: 1 },
    correct_pattern: { type: 'string' }
  }
};

const architectureIssuePromptModule: PromptModule = {
  kind: 'architecture_issue',
  model: 'sonnet',
  systemPrompt: SYSTEM,
  buildUserPrompt: buildUser,
  responseJsonSchema: RESPONSE_JSON_SCHEMA,
  responseZod: ArchitectureIssuePayloadSchema.omit({ kind: true })
};

export default architectureIssuePromptModule;
