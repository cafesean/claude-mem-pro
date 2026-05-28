// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  DEV_WORKFLOW_PROMPT_MODULES,
  KIND_MODEL,
  getPromptModule,
  listEnabledKinds,
  modelForKind
} from '../../../src/server/generation/dev-workflow-prompts/index.js';
import {
  DEV_WORKFLOW_KINDS,
  type DevWorkflowKind
} from '../../../src/core/schemas/dev-workflow-kind.js';
import { TOPICS } from '../../../src/core/schemas/topics.js';

const NEW_KINDS: DevWorkflowKind[] = [
  'architecture_issue',
  'lesson',
  'user_correction',
  'sdk_note',
  'problem_analysis',
  'decision'
];

const LEGACY_KINDS: DevWorkflowKind[] = ['change', 'feature', 'discovery'];

describe('KIND_MODEL routing', () => {
  it('routes every kind to a model tier', () => {
    for (const k of DEV_WORKFLOW_KINDS) {
      expect(['haiku', 'sonnet']).toContain(KIND_MODEL[k]);
    }
  });

  it('routes mechanical kinds to haiku', () => {
    for (const k of ['change', 'feature', 'discovery', 'sdk_note', 'user_correction'] as const) {
      expect(KIND_MODEL[k]).toBe('haiku');
    }
  });

  it('routes reasoning-heavy kinds to sonnet', () => {
    for (const k of ['architecture_issue', 'lesson', 'problem_analysis', 'decision'] as const) {
      expect(KIND_MODEL[k]).toBe('sonnet');
    }
  });

  it('modelForKind matches KIND_MODEL', () => {
    for (const k of DEV_WORKFLOW_KINDS) {
      expect(modelForKind(k)).toBe(KIND_MODEL[k]);
    }
  });
});

describe('Module registry', () => {
  it('has a module for each of the 6 new kinds', () => {
    for (const k of NEW_KINDS) {
      expect(DEV_WORKFLOW_PROMPT_MODULES[k]).toBeDefined();
    }
  });

  it('does NOT have modules for legacy kinds (handled by existing pipeline)', () => {
    for (const k of LEGACY_KINDS) {
      expect(DEV_WORKFLOW_PROMPT_MODULES[k]).toBeUndefined();
    }
  });

  it('listEnabledKinds returns exactly the 6 new kinds', () => {
    const enabled = listEnabledKinds().sort();
    expect(enabled).toEqual([...NEW_KINDS].sort());
  });

  it('getPromptModule returns null for legacy kinds', () => {
    for (const k of LEGACY_KINDS) {
      expect(getPromptModule(k)).toBeNull();
    }
  });

  it('every module declares the matching kind', () => {
    for (const k of NEW_KINDS) {
      const m = getPromptModule(k);
      expect(m).not.toBeNull();
      expect(m?.kind).toBe(k);
    }
  });

  it('every module declares a model tier consistent with KIND_MODEL', () => {
    for (const k of NEW_KINDS) {
      const m = getPromptModule(k);
      expect(m?.model).toBe(KIND_MODEL[k]);
    }
  });
});

describe('System prompts', () => {
  it('each system prompt mentions its kind name', () => {
    for (const k of NEW_KINDS) {
      const m = getPromptModule(k);
      expect(m?.systemPrompt.toUpperCase()).toContain(k.toUpperCase());
    }
  });

  it('each system prompt warns against invention', () => {
    for (const k of NEW_KINDS) {
      const m = getPromptModule(k);
      const text = m?.systemPrompt.toLowerCase() ?? '';
      expect(text.includes('never invent') || text.includes('do not')).toBe(true);
    }
  });
});

describe('User prompt builder', () => {
  const sampleCtx = {
    narrative: 'agent fixed the rls bypass on neon-http',
    topicsList: ['rls', 'neon-http'] as const,
    filesModified: ['src/server/api/trpc.ts'],
    additionalContext: 'session was investigating cross-org data leak'
  };

  it('embeds the topics vocabulary list verbatim', () => {
    for (const k of NEW_KINDS) {
      const out = getPromptModule(k)!.buildUserPrompt(sampleCtx);
      expect(out).toContain('rls');
      expect(out).toContain('neon-http');
    }
  });

  it('embeds the narrative', () => {
    for (const k of NEW_KINDS) {
      const out = getPromptModule(k)!.buildUserPrompt(sampleCtx);
      expect(out).toContain('agent fixed the rls bypass on neon-http');
    }
  });

  it('user-correction surfaces user message + recent actions', () => {
    const m = getPromptModule('user_correction')!;
    const out = m.buildUserPrompt({
      narrative: 'context',
      topicsList: TOPICS,
      userMessage: "no don't do that",
      recentAgentActions: ['Edit src/foo.ts', 'Write src/bar.ts']
    });
    expect(out).toContain("no don't do that");
    expect(out).toContain('Edit src/foo.ts');
    expect(out).toContain('Write src/bar.ts');
  });
});

describe('Response JSON Schema', () => {
  it('every module defines an object schema with required fields', () => {
    for (const k of NEW_KINDS) {
      const schema = getPromptModule(k)!.responseJsonSchema as Record<string, unknown>;
      expect(schema.type).toBe('object');
      expect(Array.isArray(schema.required)).toBe(true);
      expect((schema.required as string[]).length).toBeGreaterThan(0);
    }
  });

  it('architecture_issue schema enforces status enum', () => {
    const schema = getPromptModule('architecture_issue')!.responseJsonSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, { enum?: string[] }>;
    expect(props.status?.enum).toContain('resolved');
    expect(props.status?.enum).toContain('unresolved');
  });

  it('lesson schema enforces confidence enum', () => {
    const schema = getPromptModule('lesson')!.responseJsonSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, { enum?: string[] }>;
    expect(props.confidence?.enum).toEqual(['confirmed', 'hypothesis']);
  });

  it('decision schema enforces minItems on options_considered', () => {
    const schema = getPromptModule('decision')!.responseJsonSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, { minItems?: number }>;
    expect(props.options_considered?.minItems).toBe(2);
  });
});

describe('Response Zod parsers', () => {
  it('architecture_issue parser accepts valid payload', () => {
    const parser = getPromptModule('architecture_issue')!.responseZod;
    const result = parser.safeParse({
      status: 'unresolved',
      topics: ['rls'],
      applies_to: ['cadra-web'],
      issue: 'rls bypass',
      impact: 'data leak'
    });
    expect(result.success).toBe(true);
  });

  it('lesson parser rejects empty topics', () => {
    const parser = getPromptModule('lesson')!.responseZod;
    const result = parser.safeParse({
      topics: [],
      applies_to: [],
      confidence: 'confirmed',
      evidence: 'abc',
      lesson: 'x'
    });
    expect(result.success).toBe(false);
  });

  it('decision parser rejects single-option lists', () => {
    const parser = getPromptModule('decision')!.responseZod;
    const result = parser.safeParse({
      options_considered: [{ name: 'only one' }],
      chosen: 'only one',
      why: 'no alternative'
    });
    expect(result.success).toBe(false);
  });
});
