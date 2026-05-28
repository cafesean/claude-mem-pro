// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import { SessionSynthesizer } from '../../../src/services/dev-workflow/session-synthesizer.js';
import type {
  LlmCallRequest,
  LlmCallResponse
} from '../../../src/server/generation/dev-workflow-prompts/enrichment-service.js';
import type { SynthesisInputs } from '../../../src/core/schemas/session-record.js';

const VALID_CONTENT = {
  objective: 'wire up dev-workflow schema absorb phase 1',
  updates: [
    {
      timestamp: '2026-05-28T15:00:00Z',
      what_changed: 'added topic taxonomy + kind discriminator',
      implementation_details: 'pure additions, no migration',
      commit_log: [],
      files_changed: []
    }
  ],
  sdk_notes: { '@cadraos/sdk': 'no changes' },
  architecture_issues: [{ observationId: 'obs-1' }],
  context_documents: [
    { document: 'specs.md', path: '_context/spec.md', why_it_matters: 'design source' }
  ],
  lessons_learned: [{ observationId: 'obs-2' }],
  user_steering: [],
  next_steps: ['continue to Phase 2']
};

const SAMPLE_INPUTS: SynthesisInputs = {
  sessionId: 'sess-1',
  projectName: 'claude-mem',
  observations: [
    { id: 'obs-1', kind: 'architecture_issue', content: 'rls bypass', metadata: {} },
    { id: 'obs-2', kind: 'lesson', content: 'always pass orgId', metadata: {} }
  ],
  transcriptExcerpt: 'user asked to autonomously continue',
  git: {
    branch: 'feature/dev-workflow-schema-absorb-phase-1',
    commits: ['0a994cda', '12d1b6a7']
  },
  specPaths: ['_context/plugins/claude-mem/_specs/dev-workflow-schema-absorb/specs.md']
};

function caller(responder: (req: LlmCallRequest) => LlmCallResponse | Promise<LlmCallResponse>) {
  const calls: LlmCallRequest[] = [];
  const fn = async (req: LlmCallRequest): Promise<LlmCallResponse> => {
    calls.push(req);
    return responder(req);
  };
  return { fn, calls };
}

describe('SessionSynthesizer — happy path', () => {
  it('synthesises a record with content + frontmatter populated', async () => {
    const { fn, calls } = caller(() => ({
      parsed: VALID_CONTENT,
      usage: { inputTokens: 1000, outputTokens: 800, estimatedUsd: 0.04 }
    }));
    const svc = new SessionSynthesizer(fn);

    const result = await svc.synthesise(SAMPLE_INPUTS, {
      id: 'rec-1',
      title: 'Phase 1 implementation',
      date: '2026-05-28'
    });

    expect(calls.length).toBe(1);
    expect(result.record).not.toBeNull();
    expect(result.record?.session_id).toBe('sess-1');
    expect(result.record?.title).toBe('Phase 1 implementation');
    expect(result.record?.projects).toEqual(['claude-mem']);
    expect(result.record?.branch).toBe(
      'feature/dev-workflow-schema-absorb-phase-1'
    );
    expect(result.record?.commits).toEqual(['0a994cda', '12d1b6a7']);
    expect(result.record?.specs).toEqual(SAMPLE_INPUTS.specPaths);
    expect(result.metadata.costUsd).toBe(0.04);
    expect(result.metadata.inputTokens).toBe(1000);
  });

  it('back-links observation ids', async () => {
    const { fn } = caller(() => ({ parsed: VALID_CONTENT }));
    const svc = new SessionSynthesizer(fn);

    const result = await svc.synthesise(SAMPLE_INPUTS, {
      id: 'rec-1',
      title: 'p',
      date: '2026-05-28'
    });

    expect(result.record?.observation_refs).toEqual(['obs-1', 'obs-2']);
  });

  it('honors model option', async () => {
    const { fn, calls } = caller(() => ({ parsed: VALID_CONTENT }));
    const svc = new SessionSynthesizer(fn, { model: 'haiku' });

    await svc.synthesise(SAMPLE_INPUTS, {
      id: 'rec-1',
      title: 'p',
      date: '2026-05-28'
    });

    expect(calls[0].model).toBe('haiku');
  });

  it('embeds topic vocabulary in user prompt', async () => {
    const { fn, calls } = caller(() => ({ parsed: VALID_CONTENT }));
    const svc = new SessionSynthesizer(fn);

    await svc.synthesise(SAMPLE_INPUTS, {
      id: 'rec-1',
      title: 'p',
      date: '2026-05-28'
    });

    expect(calls[0].userPrompt).toContain('rls');
    expect(calls[0].userPrompt).toContain('caching');
  });
});

describe('SessionSynthesizer — validation', () => {
  it('throws when LLM returns invalid content (failOpen=false)', async () => {
    const { fn } = caller(() => ({ parsed: { objective: 1 /* wrong type */ } }));
    const svc = new SessionSynthesizer(fn);

    await expect(
      svc.synthesise(SAMPLE_INPUTS, {
        id: 'rec-1',
        title: 'p',
        date: '2026-05-28'
      })
    ).rejects.toThrow();
  });

  it('returns record=null + validation error when failOpen=true', async () => {
    const { fn } = caller(() => ({ parsed: { objective: 1 } }));
    const svc = new SessionSynthesizer(fn, { failOpen: true });

    const result = await svc.synthesise(SAMPLE_INPUTS, {
      id: 'rec-1',
      title: 'p',
      date: '2026-05-28'
    });

    expect(result.record).toBeNull();
    expect(result.validationError).toBeDefined();
  });
});

describe('SessionSynthesizer — observation cap', () => {
  it('truncates observations beyond cap', async () => {
    const big: SynthesisInputs = {
      ...SAMPLE_INPUTS,
      observations: Array.from({ length: 250 }, (_, i) => ({
        id: `obs-${i}`,
        kind: 'change',
        content: `change ${i}`,
        metadata: {}
      }))
    };
    const { fn, calls } = caller(() => ({ parsed: VALID_CONTENT }));
    const svc = new SessionSynthesizer(fn, { observationCap: 100 });

    await svc.synthesise(big, { id: 'rec-1', title: 'p', date: '2026-05-28' });

    // Only first 100 observations should appear in the prompt
    expect(calls[0].userPrompt).toContain('obs-99');
    expect(calls[0].userPrompt).not.toContain('obs-150');
  });
});

describe('buildPromptForInspection', () => {
  it('returns the request without invoking the LLM', () => {
    const { fn, calls } = caller(() => ({ parsed: VALID_CONTENT }));
    const svc = new SessionSynthesizer(fn);

    const req = svc.buildPromptForInspection(SAMPLE_INPUTS);
    expect(req.systemPrompt.length).toBeGreaterThan(0);
    expect(req.userPrompt.length).toBeGreaterThan(0);
    expect(calls.length).toBe(0);
  });
});
