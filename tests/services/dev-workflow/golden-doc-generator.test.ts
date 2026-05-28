// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  GoldenDocDriftDetector,
  GoldenDocGenerator,
  buildUserPrompt
} from '../../../src/services/dev-workflow/golden-doc-generator.js';
import type {
  LlmCallRequest,
  LlmCallResponse
} from '../../../src/server/generation/dev-workflow-prompts/enrichment-service.js';
import type { LearningRecord } from '../../../src/core/schemas/learning-record.js';

const PRIMARY: LearningRecord = {
  id: 'l-rls',
  topic: 'rls',
  last_synthesized: '2026-05-28T15:00:00Z',
  applies_to: ['cadra-web'],
  summary: 'rls is bypassed on neon-http',
  content: {
    patterns: [
      {
        pattern: 'set scope:user on cached routes',
        when_to_apply: 'when route serves org-scoped data',
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
    open_issues: [
      { observationId: 'arch-1', summary: 'rls bypass on neon-http', status: 'known-limitation' }
    ],
    cross_app_inconsistencies: [],
    rules_of_thumb: ['always include orgId filter in repo queries']
  },
  source_session_ids: ['sess-1', 'sess-2'],
  source_lesson_ids: ['les-1', 'les-2'],
  source_issue_ids: ['arch-1'],
  confidence_distribution: { confirmed: 2, hypothesis: 0 },
  needs_review: false
};

const RELATED: LearningRecord = {
  ...PRIMARY,
  id: 'l-org-iso',
  topic: 'org-isolation',
  summary: 'org isolation is enforced via repo queries'
};

function caller(responder: (req: LlmCallRequest) => LlmCallResponse | Promise<LlmCallResponse>) {
  const calls: LlmCallRequest[] = [];
  const fn = async (req: LlmCallRequest) => {
    calls.push(req);
    return responder(req);
  };
  return { fn, calls };
}

describe('GoldenDocGenerator — happy path', () => {
  it('returns markdown + GoldenDocSource provenance', async () => {
    const { fn, calls } = caller(() => ({
      parsed: null,
      rawText: '# RLS\n\nrendered doc',
      usage: { estimatedUsd: 0.07 }
    }));
    const svc = new GoldenDocGenerator(fn);

    const r = await svc.generate({
      primary: PRIMARY,
      related: [RELATED],
      outputPath: '_context/_arch/rls.md',
      sourceId: 'gold-1'
    });

    expect(r.markdown).toContain('# RLS');
    expect(r.source.golden_doc_path).toBe('_context/_arch/rls.md');
    expect(r.source.source_learning_ids).toEqual(['l-rls', 'l-org-iso']);
    expect(r.source.generation_prompt_hash.length).toBeGreaterThan(0);
    expect(r.source.generation_cost_usd).toBe(0.07);
    expect(calls.length).toBe(1);
  });

  it('falls back to parsed.markdown when rawText absent', async () => {
    const { fn } = caller(() => ({ parsed: { markdown: '# fallback' } }));
    const svc = new GoldenDocGenerator(fn);
    const r = await svc.generate({
      primary: PRIMARY,
      outputPath: '_context/_arch/rls.md',
      sourceId: 'gold-1'
    });
    expect(r.markdown).toBe('# fallback');
  });

  it('hash is deterministic for same inputs', async () => {
    const { fn } = caller(() => ({ rawText: 'doc', parsed: null }));
    const svc = new GoldenDocGenerator(fn);

    const a = await svc.generate({
      primary: PRIMARY,
      outputPath: '_context/_arch/rls.md',
      sourceId: 'gold-1'
    });
    const b = await svc.generate({
      primary: PRIMARY,
      outputPath: '_context/_arch/rls.md',
      sourceId: 'gold-1'
    });
    expect(a.source.generation_prompt_hash).toBe(b.source.generation_prompt_hash);
  });
});

describe('buildUserPrompt', () => {
  it('embeds primary + related records', () => {
    const prompt = buildUserPrompt(PRIMARY, [RELATED]);
    expect(prompt).toContain('primary: rls');
    expect(prompt).toContain('related: org-isolation');
    expect(prompt).toContain('rules_of_thumb');
    expect(prompt).toContain('always include orgId');
  });
});

describe('GoldenDocDriftDetector', () => {
  const SOURCE = {
    id: 'gold-1',
    golden_doc_path: '_context/_arch/rls.md',
    generated_at: '2026-05-28T00:00:00Z',
    source_learning_ids: ['l-rls'],
    generation_prompt_hash: 'abc',
    human_reviewed: true,
    needs_review: false
  };

  it('does not flag when learning is older than doc', () => {
    const d = new GoldenDocDriftDetector();
    const learning = { ...PRIMARY, last_synthesized: '2026-05-27T00:00:00Z' };
    expect(
      d.needsReview({
        source: SOURCE,
        sourceLearnings: [learning]
      })
    ).toBe(false);
  });

  it('flags when a learning was synthesised after doc generation', () => {
    const d = new GoldenDocDriftDetector();
    const learning = { ...PRIMARY, last_synthesized: '2026-05-29T00:00:00Z' };
    expect(
      d.needsReview({
        source: SOURCE,
        sourceLearnings: [learning]
      })
    ).toBe(true);
  });

  it('flags when source.needs_review is already true', () => {
    const d = new GoldenDocDriftDetector();
    expect(
      d.needsReview({
        source: { ...SOURCE, needs_review: true },
        sourceLearnings: []
      })
    ).toBe(true);
  });

  it('flags when a learning has needs_review', () => {
    const d = new GoldenDocDriftDetector();
    const learning = { ...PRIMARY, needs_review: true };
    expect(
      d.needsReview({
        source: SOURCE,
        sourceLearnings: [learning]
      })
    ).toBe(true);
  });
});
