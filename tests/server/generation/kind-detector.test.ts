// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  detectKinds,
  kindsAbove,
  topKind
} from '../../../src/server/generation/dev-workflow-prompts/kind-detector.js';

describe('detectKinds — user_correction', () => {
  it('fires on rejection signal in user message', () => {
    const out = detectKinds({
      narrative: 'agent edited foo',
      userMessage: 'no stop doing that'
    });
    expect(out.some((r) => r.kind === 'user_correction')).toBe(true);
  });

  it('fires on past-reference signal w/ higher confidence', () => {
    const out = detectKinds({
      narrative: 'agent edited foo',
      userMessage: 'we said no URL field, remember?'
    });
    const uc = out.find((r) => r.kind === 'user_correction');
    expect(uc).toBeDefined();
    expect(uc!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('does not fire when message is positive', () => {
    const out = detectKinds({
      narrative: 'agent edited foo',
      userMessage: 'good, keep going'
    });
    expect(out.some((r) => r.kind === 'user_correction')).toBe(false);
  });

  it('does not fire when there is no user message', () => {
    const out = detectKinds({
      narrative: 'agent edited foo'
    });
    expect(out.some((r) => r.kind === 'user_correction')).toBe(false);
  });
});

describe('detectKinds — architecture_issue', () => {
  it('fires on bypass language', () => {
    const out = detectKinds({
      narrative: 'discovered RLS bypass on neon-http when withPrivilegedDb is used'
    });
    expect(out.some((r) => r.kind === 'architecture_issue')).toBe(true);
  });

  it('fires on cross-cutting language', () => {
    const out = detectKinds({
      narrative: 'this is a cross-cutting inconsistency between cadra-web and yobo-merchant'
    });
    expect(out.some((r) => r.kind === 'architecture_issue')).toBe(true);
  });
});

describe('detectKinds — lesson', () => {
  it('fires on confirmation language', () => {
    const out = detectKinds({
      narrative: 'verified that scope:user is always required for cached org-scoped routes'
    });
    expect(out.some((r) => r.kind === 'lesson')).toBe(true);
  });
});

describe('detectKinds — problem_analysis', () => {
  it('fires on root cause language', () => {
    const out = detectKinds({
      narrative: 'tracked the root cause to a silent failure in the http plugin allow-list'
    });
    expect(out.some((r) => r.kind === 'problem_analysis')).toBe(true);
  });
});

describe('detectKinds — decision', () => {
  it('fires on instead-of language', () => {
    const out = detectKinds({
      narrative: 'chose Tauri instead of Electron because of bundle size'
    });
    expect(out.some((r) => r.kind === 'decision')).toBe(true);
  });
});

describe('detectKinds — sdk_note', () => {
  it('fires when modifying a core-sdk file', () => {
    const out = detectKinds({
      narrative: 'updated SDK actor pattern',
      filesModified: ['core-sdk/src/auth/actor.ts']
    });
    expect(out.some((r) => r.kind === 'sdk_note')).toBe(true);
  });

  it('fires when modifying a @jetdevs scope file', () => {
    const out = detectKinds({
      narrative: 'updated SDK',
      filesModified: ['node_modules/@jetdevs/framework/dist/index.js']
    });
    expect(out.some((r) => r.kind === 'sdk_note')).toBe(true);
  });

  it('does not fire on app-only edits', () => {
    const out = detectKinds({
      narrative: 'tweaked component',
      filesModified: ['cadra-web/src/components/foo.tsx']
    });
    expect(out.some((r) => r.kind === 'sdk_note')).toBe(false);
  });
});

describe('detectKinds — feature vs change baseline', () => {
  it('fires feature when 3+ files modified', () => {
    const out = detectKinds({
      narrative: 'shipped multi-file change',
      toolName: 'Edit',
      filesModified: ['a.ts', 'b.ts', 'c.ts']
    });
    expect(out.some((r) => r.kind === 'feature')).toBe(true);
    expect(out.some((r) => r.kind === 'change')).toBe(false);
  });

  it('fires change for single-file edit', () => {
    const out = detectKinds({
      narrative: 'small tweak',
      toolName: 'Edit',
      filesModified: ['a.ts']
    });
    expect(out.some((r) => r.kind === 'change')).toBe(true);
    expect(out.some((r) => r.kind === 'feature')).toBe(false);
  });

  it('fires feature on conventional commit keyword', () => {
    const out = detectKinds({
      narrative: 'feat: added auth flow',
      toolName: 'Edit',
      filesModified: ['a.ts']
    });
    expect(out.some((r) => r.kind === 'feature')).toBe(true);
  });
});

describe('detectKinds — discovery', () => {
  it('fires on found-that language', () => {
    const out = detectKinds({
      narrative: 'found that the cache is shared across orgs'
    });
    expect(out.some((r) => r.kind === 'discovery')).toBe(true);
  });
});

describe('Multi-kind output', () => {
  it('returns multiple kinds for a complex event', () => {
    const out = detectKinds({
      narrative: 'tracked the root cause to RLS bypass on neon-http; lesson learned: always pass orgId',
      toolName: 'Edit',
      filesModified: ['core-sdk/src/auth/actor.ts']
    });
    const kinds = new Set(out.map((r) => r.kind));
    expect(kinds.has('problem_analysis')).toBe(true);
    expect(kinds.has('architecture_issue')).toBe(true);
    expect(kinds.has('lesson')).toBe(true);
    expect(kinds.has('sdk_note')).toBe(true);
  });

  it('sorts highest-confidence first', () => {
    const out = detectKinds({
      narrative: 'tracked the root cause to architectural inconsistency',
      userMessage: 'we said you should not do that'
    });
    const sorted = [...out].sort((a, b) => b.confidence - a.confidence);
    expect(out).toEqual(sorted);
  });

  it('de-dupes overlapping signals — one result per kind', () => {
    const out = detectKinds({
      narrative: 'root cause found and root-cause confirmed'
    });
    const count = out.filter((r) => r.kind === 'problem_analysis').length;
    expect(count).toBe(1);
  });
});

describe('topKind + kindsAbove', () => {
  it('topKind returns highest confidence', () => {
    const top = topKind({
      narrative: 'root cause and lesson learned',
      userMessage: 'we said'
    });
    expect(top).not.toBeNull();
    expect(top!.confidence).toBeGreaterThan(0);
  });

  it('topKind returns null on empty event', () => {
    const top = topKind({ narrative: '' });
    expect(top).toBeNull();
  });

  it('kindsAbove filters by threshold', () => {
    const all = detectKinds({
      narrative: 'small tweak',
      toolName: 'Edit',
      filesModified: ['a.ts']
    });
    const high = kindsAbove(
      { narrative: 'small tweak', toolName: 'Edit', filesModified: ['a.ts'] },
      0.9
    );
    expect(high.length).toBeLessThanOrEqual(all.length);
    for (const r of high) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });
});
