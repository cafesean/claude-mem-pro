// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import { CorrectionCaptureService } from '../../../src/services/dev-workflow/correction-capture-service.js';
import type {
  LlmCallRequest,
  LlmCallResponse
} from '../../../src/server/generation/dev-workflow-prompts/enrichment-service.js';

const VALID_CORRECTION = {
  verbatim_quote: 'we said no URL field',
  agent_did_wrong: 'added a workspace URL input box',
  root_cause: 'forgot a prior spec decision',
  signal_category: 'past-reference'
};

function makeService(
  responder: (req: LlmCallRequest) => LlmCallResponse | Promise<LlmCallResponse>
) {
  const llmCalls: LlmCallRequest[] = [];
  const stored: Array<{ sessionId: string; observation: unknown; signal: unknown }> = [];

  const llm = async (req: LlmCallRequest) => {
    llmCalls.push(req);
    return responder(req);
  };
  const storage = async (input: any) => {
    stored.push(input);
  };

  return {
    service: new CorrectionCaptureService(llm, storage, { dedupeWindowMs: 1000 }),
    llmCalls,
    stored
  };
}

describe('CorrectionCaptureService — happy path', () => {
  it('captures, enriches, and stores a correction', async () => {
    const { service, llmCalls, stored } = makeService(() => ({ parsed: VALID_CORRECTION }));

    const result = await service.capture({
      userMessage: 'we said no URL field, we already decided',
      sessionId: 'sess-1',
      recentActions: [{ summary: 'Edit src/ConnectView.tsx' }],
      sessionContext: 'user feedback during connect view review'
    });

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('user_correction');
    expect(llmCalls.length).toBe(1);
    expect(stored.length).toBe(1);
    expect(stored[0].sessionId).toBe('sess-1');
  });

  it('returns null without calling LLM when message is not a correction', async () => {
    const { service, llmCalls, stored } = makeService(() => ({ parsed: VALID_CORRECTION }));

    const result = await service.capture({
      userMessage: 'Ok',
      sessionId: 'sess-1'
    });

    expect(result).toBeNull();
    expect(llmCalls.length).toBe(0);
    expect(stored.length).toBe(0);
  });

  it('returns null when positive guard suppresses the signal', async () => {
    const { service, llmCalls } = makeService(() => ({ parsed: VALID_CORRECTION }));

    await service.capture({
      userMessage: 'thanks, but stop doing that',
      sessionId: 'sess-1'
    });
    expect(llmCalls.length).toBe(0);
  });
});

describe('CorrectionCaptureService — dedupe', () => {
  it('skips identical message within dedupe window', async () => {
    const { service, llmCalls } = makeService(() => ({ parsed: VALID_CORRECTION }));

    const r1 = await service.capture({
      userMessage: 'we said no URL field',
      sessionId: 'sess-1'
    });
    const r2 = await service.capture({
      userMessage: 'we said no URL field',
      sessionId: 'sess-1'
    });

    expect(r1).not.toBeNull();
    expect(r2).toBeNull();
    expect(llmCalls.length).toBe(1);
  });

  it('different sessions do not dedupe', async () => {
    const { service, llmCalls } = makeService(() => ({ parsed: VALID_CORRECTION }));

    await service.capture({
      userMessage: 'we said no URL field',
      sessionId: 'sess-A'
    });
    await service.capture({
      userMessage: 'we said no URL field',
      sessionId: 'sess-B'
    });

    expect(llmCalls.length).toBe(2);
  });
});

describe('CorrectionCaptureService — failure handling', () => {
  it('returns null when LLM fails', async () => {
    const { service, stored } = makeService(() => {
      throw new Error('rate_limit');
    });

    const result = await service.capture({
      userMessage: 'we said no URL field',
      sessionId: 'sess-1'
    });

    expect(result).toBeNull();
    expect(stored.length).toBe(0);
  });

  it('returns null when LLM returns no user_correction observation', async () => {
    const { service, stored } = makeService(() => ({ parsed: { /* invalid */ } }));

    const result = await service.capture({
      userMessage: 'we said no URL field',
      sessionId: 'sess-1'
    });

    expect(result).toBeNull();
    expect(stored.length).toBe(0);
  });

  it('records onSkip telemetry for each skip path', async () => {
    const skips: string[] = [];
    const llm = async () => ({ parsed: VALID_CORRECTION });
    const storage = async () => {};
    const service = new CorrectionCaptureService(llm, storage, {
      dedupeWindowMs: 1000,
      onSkip: (reason) => skips.push(reason)
    });

    await service.capture({ userMessage: 'Ok', sessionId: 's' });
    await service.capture({ userMessage: 'we said no', sessionId: 's' });
    await service.capture({ userMessage: 'we said no', sessionId: 's' });

    expect(skips).toContain('no_correction_signal');
    expect(skips).toContain('deduped');
  });
});

describe('CorrectionCaptureService — detect() preview', () => {
  it('returns signal without LLM call', () => {
    const { service, llmCalls } = makeService(() => ({ parsed: VALID_CORRECTION }));

    const signal = service.detect('we said no URL field');
    expect(signal?.category).toBe('past-reference');
    expect(llmCalls.length).toBe(0);
  });

  it('returns null on non-correction', () => {
    const { service } = makeService(() => ({ parsed: VALID_CORRECTION }));
    expect(service.detect('Ok')).toBeNull();
  });
});
