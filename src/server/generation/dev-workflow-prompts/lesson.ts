// SPDX-License-Identifier: Apache-2.0

import { LessonPayloadSchema } from '../../../core/schemas/dev-workflow-kind.js';
import type { PromptContext, PromptModule } from './types.js';
import { renderTopicsBlock } from './types.js';

const SYSTEM = `You are claude-mem's dev-workflow observation extractor for LESSON events.

You are observing a development session and the agent has just confirmed a pattern, learned something the user expects to apply across future work, or had a hypothesis verified.

Output a single JSON object matching the lesson schema.

Required fields:
- topics: 1+ topics from the closed vocabulary (NEVER empty for lessons)
- applies_to: list of app or SDK names this lesson is relevant to
- confidence: "confirmed" if the lesson was proven by test/deploy/observed behavior; "hypothesis" if suspected but not yet proven
- evidence: either a short string (commit hash, "commit abc1234", "verified via browser test") OR a structured object { commit, file, line, note }
- lesson: a SPECIFIC, ACTIONABLE statement — not generic advice

Lesson rules:
- "Use proper error handling" — REJECT, generic
- "Use NextResponse.redirect for server-side redirects" — REJECT, doesn't say WHEN
- "Browsers block server-side HTTP 307 redirects to custom URI schemes; return HTML+JS doing window.location.href=customScheme instead" — ACCEPT, specific + actionable

Never invent. If you cannot infer the lesson with confidence, omit the observation.`;

function buildUser(ctx: PromptContext): string {
  return [
    renderTopicsBlock(ctx.topicsList),
    '',
    'Session narrative or finding:',
    ctx.narrative,
    ctx.gitContext?.commits?.length
      ? `\nRelevant commits: ${ctx.gitContext.commits.join(', ')}`
      : '',
    ctx.filesModified?.length ? `\nFiles modified: ${ctx.filesModified.join(', ')}` : '',
    ctx.additionalContext ? `\nAdditional context:\n${ctx.additionalContext}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const RESPONSE_JSON_SCHEMA: object = {
  type: 'object',
  required: ['topics', 'applies_to', 'confidence', 'evidence', 'lesson'],
  properties: {
    topics: { type: 'array', minItems: 1, items: { type: 'string' } },
    applies_to: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['confirmed', 'hypothesis'] },
    evidence: {
      oneOf: [
        { type: 'string', minLength: 1 },
        {
          type: 'object',
          properties: {
            commit: { type: 'string' },
            file: { type: 'string' },
            line: { type: 'integer', minimum: 0 },
            note: { type: 'string' }
          }
        }
      ]
    },
    lesson: { type: 'string', minLength: 1 }
  }
};

const lessonPromptModule: PromptModule = {
  kind: 'lesson',
  model: 'sonnet',
  systemPrompt: SYSTEM,
  buildUserPrompt: buildUser,
  responseJsonSchema: RESPONSE_JSON_SCHEMA,
  responseZod: LessonPayloadSchema.omit({ kind: true })
};

export default lessonPromptModule;
