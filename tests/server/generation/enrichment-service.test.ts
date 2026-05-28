// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  DevWorkflowEnrichmentService,
  type LlmCallRequest,
  type LlmCallResponse
} from '../../../src/server/generation/dev-workflow-prompts/enrichment-service.js';

// ---------------------------------------------------------------------------
// Fake LLM caller — deterministic, no network.
// ---------------------------------------------------------------------------

type Responder = (req: LlmCallRequest) => LlmCallResponse | Promise<LlmCallResponse>;

function makeCaller(responder: Responder) {
  const calls: LlmCallRequest[] = [];
  const fn = async (req: LlmCallRequest): Promise<LlmCallResponse> => {
    calls.push(req);
    return responder(req);
  };
  return { fn, calls };
}

const VALID_ARCH_ISSUE = {
  status: 'unresolved',
  topics: ['rls'],
  applies_to: ['cadra-web'],
  issue: 'RLS bypass on neon-http',
  impact: 'data leakage across orgs if app forgets orgId filter'
};

const VALID_LESSON = {
  topics: ['rls', 'caching'],
  applies_to: ['cadra-web'],
  confidence: 'confirmed',
  evidence: 'commit abc1234',
  lesson: 'always set scope:user on cached org-scoped routes'
};

const VALID_SDK_NOTE = {
  sdk_package: '@jetdevs/core',
  topics: ['actor-pattern'],
  applies_to: ['cadra-web'],
  narrative: 'createActor reads from session.user.currentOrgId'
};

const VALID_CHANGE = {
  topics: [],
  applies_to: [],
  narrative: 'edited the routing file',
  files_modified: [],
  files_read: []
};

const VALID_FEATURE = {
  topics: ['data-table'],
  applies_to: [],
  narrative: 'shipped multi-file table component',
  files_modified: [],
  commit_hashes: []
};

describe('DevWorkflowEnrichmentService — happy path', () => {
  it('enriches a single arch-issue event into one observation', async () => {
    const { fn, calls } = makeCaller(() => ({
      parsed: VALID_ARCH_ISSUE,
      usage: { estimatedUsd: 0.01 }
    }));
    const service = new DevWorkflowEnrichmentService(fn);

    const result = await service.enrich({
      narrative: 'discovered an RLS bypass on neon-http that breaks org isolation'
    });

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(result.observations.length).toBeGreaterThanOrEqual(1);
    const archObs = result.observations.find((o) => o.kind === 'architecture_issue');
    expect(archObs?.payload?.kind).toBe('architecture_issue');
    expect(result.totalCostUsd).toBeCloseTo(0.01 * result.observations.length, 5);
  });

  it('attaches metadata under dev_workflow key', async () => {
    const { fn } = makeCaller(() => ({ parsed: VALID_ARCH_ISSUE }));
    const service = new DevWorkflowEnrichmentService(fn);

    const result = await service.enrich({
      narrative: 'discovered an RLS bypass on neon-http'
    });

    const archObs = result.observations.find((o) => o.kind === 'architecture_issue');
    expect(archObs?.metadata).not.toBeNull();
    const dw = (archObs?.metadata as Record<string, unknown>).dev_workflow as { kind: string };
    expect(dw.kind).toBe('architecture_issue');
  });

  it('dispatches multiple kinds for a complex event', async () => {
    const { fn, calls } = makeCaller((req) => {
      const body = req.userPrompt + req.systemPrompt;
      if (body.includes('ARCHITECTURE_ISSUE')) return { parsed: VALID_ARCH_ISSUE };
      if (body.includes('LESSON')) return { parsed: VALID_LESSON };
      if (body.includes('SDK_NOTE')) return { parsed: VALID_SDK_NOTE };
      throw new Error('unexpected kind');
    });
    const service = new DevWorkflowEnrichmentService(fn);

    const result = await service.enrich({
      narrative:
        'discovered RLS bypass on neon-http — lesson learned: always pass orgId. SDK actor pattern needs update.',
      filesModified: ['core-sdk/src/auth/actor.ts']
    });

    const kinds = new Set(result.observations.map((o) => o.kind));
    expect(kinds.has('architecture_issue')).toBe(true);
    expect(kinds.has('lesson')).toBe(true);
    expect(kinds.has('sdk_note')).toBe(true);
    // Calls only happen for kinds with a registered prompt module
    expect(calls.length).toBe(result.observations.length);
  });
});

describe('DevWorkflowEnrichmentService — failure handling', () => {
  it('skips a kind when LLM call throws', async () => {
    const { fn } = makeCaller(() => {
      throw new Error('rate_limit');
    });
    const service = new DevWorkflowEnrichmentService(fn);

    const result = await service.enrich({
      narrative: 'discovered an RLS bypass on neon-http'
    });

    expect(result.observations.length).toBe(0);
    expect(result.skipped.length).toBeGreaterThanOrEqual(1);
    expect(result.skipped[0].reason).toContain('llm_call_failed');
    expect(result.skipped[0].reason).toContain('rate_limit');
  });

  it('skips on validation failure by default', async () => {
    const { fn } = makeCaller(() => ({
      parsed: { status: 'invalid_status' /* missing required fields */ }
    }));
    const service = new DevWorkflowEnrichmentService(fn);

    const result = await service.enrich({
      narrative: 'discovered an RLS bypass on neon-http'
    });

    expect(result.observations.length).toBe(0);
    expect(result.skipped.some((s) => s.reason.startsWith('validation_failed'))).toBe(true);
  });

  it('retains raw observation on validation failure when failOpen=true', async () => {
    const { fn } = makeCaller(() => ({
      parsed: { status: 'invalid_status' }
    }));
    const service = new DevWorkflowEnrichmentService(fn, { failOpen: true });

    const result = await service.enrich({
      narrative: 'discovered an RLS bypass on neon-http'
    });

    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.observations[0].payload).toBeNull();
    expect(result.observations[0].validationError).toBeDefined();
  });
});

describe('DevWorkflowEnrichmentService — change/feature fallback', () => {
  it('skips legacy kinds because they have no prompt module', async () => {
    const { fn, calls } = makeCaller(() => ({ parsed: VALID_FEATURE }));
    // Lower minConfidence so the legacy-kind detection (confidence ~0.4-0.5)
    // reaches the prompt-module dispatch path, where it must be skipped.
    const service = new DevWorkflowEnrichmentService(fn, { minConfidence: 0.3 });

    const result = await service.enrich({
      narrative: 'feat: multi-file change shipped',
      toolName: 'Edit',
      filesModified: ['cadra-web/src/a.ts', 'cadra-web/src/b.ts', 'cadra-web/src/c.ts']
    });

    // Feature detected, but legacy kinds have no module → recorded in skipped
    expect(calls.length).toBe(0);
    const featureSkip = result.skipped.find((s) => s.kind === 'feature');
    expect(featureSkip).toBeDefined();
    expect(featureSkip?.reason).toContain('no prompt module');
  });
});

describe('DevWorkflowEnrichmentService — options', () => {
  it('honors minConfidence threshold', async () => {
    const { fn } = makeCaller(() => ({ parsed: VALID_ARCH_ISSUE }));
    const service = new DevWorkflowEnrichmentService(fn, { minConfidence: 0.95 });

    const result = await service.enrich({
      narrative: 'small RLS bypass concern'
    });

    // All confidences are below 0.95 → no enrichment attempts
    expect(result.observations.length).toBe(0);
    expect(result.skipped.length).toBe(0);
  });

  it('caps the number of kinds per event', async () => {
    const { fn } = makeCaller(() => ({ parsed: VALID_LESSON }));
    const service = new DevWorkflowEnrichmentService(fn, {
      maxKindsPerEvent: 1
    });

    const result = await service.enrich({
      narrative:
        'root cause was RLS bypass on neon-http — lesson learned: always pass orgId',
      filesModified: ['core-sdk/src/foo.ts']
    });

    expect(result.observations.length + result.skipped.length).toBeLessThanOrEqual(1);
  });
});

describe('estimateModelMix (dry run)', () => {
  it('returns model tier per detected kind without LLM calls', async () => {
    const { fn, calls } = makeCaller(() => ({ parsed: VALID_ARCH_ISSUE }));
    const service = new DevWorkflowEnrichmentService(fn);

    const mix = service.estimateModelMix({
      narrative: 'discovered an RLS bypass on neon-http',
      filesModified: ['core-sdk/src/foo.ts']
    });

    expect(calls.length).toBe(0);
    expect(mix.length).toBeGreaterThan(0);
    for (const entry of mix) {
      expect(['haiku', 'sonnet']).toContain(entry.model);
    }
    const arch = mix.find((m) => m.kind === 'architecture_issue');
    expect(arch?.model).toBe('sonnet');
    const sdk = mix.find((m) => m.kind === 'sdk_note');
    expect(sdk?.model).toBe('haiku');
  });
});

describe('enrichToMetadata', () => {
  it('returns only the metadata objects for validated payloads', async () => {
    const { fn } = makeCaller((req) => {
      const body = req.systemPrompt;
      if (body.includes('ARCHITECTURE_ISSUE')) return { parsed: VALID_ARCH_ISSUE };
      if (body.includes('LESSON')) return { parsed: VALID_LESSON };
      return { parsed: VALID_LESSON };
    });
    const service = new DevWorkflowEnrichmentService(fn);

    const out = await service.enrichToMetadata({
      narrative: 'RLS bypass on neon-http — lesson: always pass orgId'
    });

    expect(out.length).toBeGreaterThan(0);
    for (const meta of out) {
      const dw = meta.dev_workflow as { kind: string };
      expect(['architecture_issue', 'lesson']).toContain(dw.kind);
    }
  });
});
