// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  LearningDriftDetector,
  LearningExtractor
} from '../../../src/services/dev-workflow/learning-extractor.js';
import type {
  LlmCallRequest,
  LlmCallResponse
} from '../../../src/server/generation/dev-workflow-prompts/enrichment-service.js';
import type { LearningSourceInput } from '../../../src/core/schemas/learning-record.js';

const VALID_RESPONSE = {
  summary: 'always pass orgId; rls is bypassed on neon-http',
  patterns: [
    {
      pattern: 'set scope:user on cached org-scoped routes',
      when_to_apply: 'tRPC routes serving per-org data',
      evidence_refs: ['les-1']
    }
  ],
  anti_patterns: [
    {
      anti_pattern: 'cache: {ttl: N} without scope',
      why_avoid: 'CDN shares responses across orgs',
      evidence_refs: ['les-1']
    }
  ],
  open_issues: [{ observationId: 'arch-1', summary: 'rls bypass on neon-http', status: 'known-limitation' }],
  cross_app_inconsistencies: [],
  rules_of_thumb: ['always include orgId filter in repo queries']
};

const LESSONS: LearningSourceInput[] = [
  {
    id: 'les-1',
    kind: 'lesson',
    topic: 'rls',
    appliesTo: ['cadra-web'],
    confidence: 'confirmed',
    content: 'always set scope:user',
    evidence: 'abc1234'
  },
  {
    id: 'les-2',
    kind: 'lesson',
    topic: 'rls',
    appliesTo: ['cadra-web'],
    confidence: 'confirmed',
    content: 'rls bypass on neon-http',
    evidence: 'def5678'
  },
  {
    id: 'les-3',
    kind: 'lesson',
    topic: 'rls',
    appliesTo: ['yobo-merchant'],
    confidence: 'hypothesis',
    content: 'similar pattern likely applies to yobo'
  }
];

const ISSUES: LearningSourceInput[] = [
  {
    id: 'arch-1',
    kind: 'architecture_issue',
    topic: 'rls',
    appliesTo: ['cadra-web'],
    archStatus: 'known-limitation',
    content: 'withPrivilegedDb bypasses rls'
  }
];

function caller(responder: (req: LlmCallRequest) => LlmCallResponse | Promise<LlmCallResponse>) {
  const calls: LlmCallRequest[] = [];
  const fn = async (req: LlmCallRequest) => {
    calls.push(req);
    return responder(req);
  };
  return { fn, calls };
}

describe('LearningExtractor — happy path', () => {
  it('produces a learning record from lessons + issues', async () => {
    const { fn, calls } = caller(() => ({
      parsed: VALID_RESPONSE,
      usage: { inputTokens: 1500, outputTokens: 600, estimatedUsd: 0.05 }
    }));
    const svc = new LearningExtractor(fn);

    const r = await svc.extract('rls', [...LESSONS, ...ISSUES], { id: 'learn-1' });

    expect(r.record).not.toBeNull();
    expect(r.record?.topic).toBe('rls');
    expect(r.record?.summary).toContain('always pass orgId');
    expect(r.record?.applies_to).toContain('cadra-web');
    expect(r.record?.applies_to).toContain('yobo-merchant');
    expect(r.record?.source_lesson_ids).toEqual(['les-1', 'les-2', 'les-3']);
    expect(r.record?.source_issue_ids).toEqual(['arch-1']);
    expect(r.record?.confidence_distribution).toEqual({ confirmed: 2, hypothesis: 1 });
    expect(r.record?.generation_cost_usd).toBe(0.05);
    expect(calls[0].userPrompt).toContain('Topic: rls');
  });

  it('honors model option', async () => {
    const { fn, calls } = caller(() => ({ parsed: VALID_RESPONSE }));
    const svc = new LearningExtractor(fn, { model: 'haiku' });
    await svc.extract('rls', LESSONS, { id: 'learn-1' });
    expect(calls[0].model).toBe('haiku');
  });
});

describe('LearningExtractor — thresholds + empty', () => {
  it('skips when no inputs', async () => {
    const { fn } = caller(() => ({ parsed: VALID_RESPONSE }));
    const svc = new LearningExtractor(fn);
    const r = await svc.extract('rls', [], { id: 'learn-1' });
    expect(r.record).toBeNull();
    expect(r.skipped).toBe('no_inputs');
  });

  it('skips when lesson count below minLessons', async () => {
    const { fn } = caller(() => ({ parsed: VALID_RESPONSE }));
    const svc = new LearningExtractor(fn, { minLessons: 10 });
    const r = await svc.extract('rls', LESSONS, { id: 'learn-1' });
    expect(r.record).toBeNull();
    expect(r.skipped).toBe('below_threshold');
  });
});

describe('LearningExtractor — validation', () => {
  it('throws on invalid LLM output (failOpen=false)', async () => {
    const { fn } = caller(() => ({ parsed: { patterns: 'not-an-array' } }));
    const svc = new LearningExtractor(fn);
    await expect(svc.extract('rls', LESSONS, { id: 'learn-1' })).rejects.toThrow();
  });

  it('returns failOpen=true result with validation error', async () => {
    const { fn } = caller(() => ({ parsed: { patterns: 'not-an-array' } }));
    const svc = new LearningExtractor(fn, { failOpen: true });
    const r = await svc.extract('rls', LESSONS, { id: 'learn-1' });
    expect(r.record).toBeNull();
    expect(r.validationError).toBeDefined();
  });
});

describe('LearningDriftDetector', () => {
  const baseRecord = {
    id: 'l',
    topic: 'rls' as const,
    last_synthesized: new Date().toISOString(),
    applies_to: ['cadra-web'],
    summary: 'summary',
    content: {
      patterns: [],
      anti_patterns: [],
      open_issues: [],
      cross_app_inconsistencies: [],
      rules_of_thumb: []
    },
    source_session_ids: [],
    source_lesson_ids: [],
    source_issue_ids: [],
    confidence_distribution: { confirmed: 0, hypothesis: 0 },
    needs_review: false
  } as const;

  it('flags when needs_review is true', () => {
    const d = new LearningDriftDetector();
    expect(
      d.needsReview({
        record: { ...baseRecord, needs_review: true },
        newConfirmedLessons: 0,
        archStatusChanges: 0
      })
    ).toBe(true);
  });

  it('flags when new confirmed lessons exist', () => {
    const d = new LearningDriftDetector();
    expect(
      d.needsReview({
        record: baseRecord,
        newConfirmedLessons: 1,
        archStatusChanges: 0
      })
    ).toBe(true);
  });

  it('flags when arch status has changed', () => {
    const d = new LearningDriftDetector();
    expect(
      d.needsReview({
        record: baseRecord,
        newConfirmedLessons: 0,
        archStatusChanges: 1
      })
    ).toBe(true);
  });

  it('flags when stale beyond staleAfterDays', () => {
    const d = new LearningDriftDetector({ staleAfterDays: 1 });
    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      d.needsReview({
        record: { ...baseRecord, last_synthesized: old },
        newConfirmedLessons: 0,
        archStatusChanges: 0
      })
    ).toBe(true);
  });

  it('passes when nothing changed and fresh', () => {
    const d = new LearningDriftDetector({ staleAfterDays: 14 });
    expect(
      d.needsReview({
        record: baseRecord,
        newConfirmedLessons: 0,
        archStatusChanges: 0
      })
    ).toBe(false);
  });
});
