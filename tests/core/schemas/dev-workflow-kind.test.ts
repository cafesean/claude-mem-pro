// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  ArchitectureIssuePayloadSchema,
  ChangePayloadSchema,
  DEV_WORKFLOW_KINDS,
  DecisionPayloadSchema,
  DevWorkflowKindSchema,
  DevWorkflowPayloadSchema,
  DiscoveryPayloadSchema,
  FeaturePayloadSchema,
  LessonPayloadSchema,
  ProblemAnalysisPayloadSchema,
  SdkNotePayloadSchema,
  UserCorrectionPayloadSchema,
  extractDevWorkflowPayload,
  parseDevWorkflowPayload,
  withDevWorkflowPayload
} from '../../../src/core/schemas/dev-workflow-kind.js';

describe('DEV_WORKFLOW_KINDS', () => {
  it('exposes 9 kinds', () => {
    expect(DEV_WORKFLOW_KINDS.length).toBe(9);
  });

  it('includes the existing claude-mem kinds', () => {
    expect(DEV_WORKFLOW_KINDS).toContain('change');
    expect(DEV_WORKFLOW_KINDS).toContain('feature');
    expect(DEV_WORKFLOW_KINDS).toContain('discovery');
  });

  it('includes new dev-workflow kinds', () => {
    const newKinds = [
      'architecture_issue',
      'lesson',
      'user_correction',
      'sdk_note',
      'problem_analysis',
      'decision'
    ];
    for (const k of newKinds) {
      expect(DEV_WORKFLOW_KINDS).toContain(k);
    }
  });
});

describe('DevWorkflowKindSchema', () => {
  it('accepts valid kinds', () => {
    for (const k of DEV_WORKFLOW_KINDS) {
      expect(DevWorkflowKindSchema.parse(k)).toBe(k);
    }
  });

  it('rejects unknown kinds', () => {
    expect(() => DevWorkflowKindSchema.parse('not-a-kind')).toThrow();
  });
});

describe('ChangePayloadSchema', () => {
  it('parses minimal valid payload', () => {
    const payload = ChangePayloadSchema.parse({
      kind: 'change',
      narrative: 'edited auth middleware'
    });
    expect(payload.topics).toEqual([]);
    expect(payload.files_modified).toEqual([]);
  });
});

describe('FeaturePayloadSchema', () => {
  it('parses payload with topics + commits', () => {
    const payload = FeaturePayloadSchema.parse({
      kind: 'feature',
      topics: ['rls', 'caching'],
      narrative: 'added rls scoping to cache layer',
      commit_hashes: ['abc1234']
    });
    expect(payload.topics).toEqual(['rls', 'caching']);
  });
});

describe('DiscoveryPayloadSchema', () => {
  it('requires narrative and fact', () => {
    const payload = DiscoveryPayloadSchema.parse({
      kind: 'discovery',
      narrative: 'found that the cache shares responses across orgs',
      fact: 'tRPC cache scope defaults to public on neon-http'
    });
    expect(payload.fact).toContain('tRPC');
  });

  it('throws when fact is empty', () => {
    expect(() =>
      DiscoveryPayloadSchema.parse({
        kind: 'discovery',
        narrative: 'x',
        fact: ''
      })
    ).toThrow();
  });
});

describe('ArchitectureIssuePayloadSchema', () => {
  it('parses valid arch issue', () => {
    const payload = ArchitectureIssuePayloadSchema.parse({
      kind: 'architecture_issue',
      status: 'known-limitation',
      topics: ['rls', 'neon-http'],
      applies_to: ['cadra-web'],
      issue: 'rls bypass on neon-http',
      impact: 'data leakage risk if app forgets orgId filter'
    });
    expect(payload.status).toBe('known-limitation');
  });

  it('requires at least one topic', () => {
    expect(() =>
      ArchitectureIssuePayloadSchema.parse({
        kind: 'architecture_issue',
        status: 'unresolved',
        topics: [],
        applies_to: [],
        issue: 'x',
        impact: 'y'
      })
    ).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() =>
      ArchitectureIssuePayloadSchema.parse({
        kind: 'architecture_issue',
        status: 'maybe',
        topics: ['rls'],
        applies_to: [],
        issue: 'x',
        impact: 'y'
      })
    ).toThrow();
  });
});

describe('LessonPayloadSchema', () => {
  it('parses valid lesson with commit evidence', () => {
    const payload = LessonPayloadSchema.parse({
      kind: 'lesson',
      topics: ['caching', 'rls'],
      applies_to: ['cadra-web'],
      confidence: 'confirmed',
      evidence: 'abc1234',
      lesson: 'always set scope:user on cached org-scoped routes'
    });
    expect(payload.confidence).toBe('confirmed');
  });

  it('parses lesson with structured evidence', () => {
    const payload = LessonPayloadSchema.parse({
      kind: 'lesson',
      topics: ['rls'],
      applies_to: [],
      confidence: 'hypothesis',
      evidence: { commit: 'abc1234', file: 'src/foo.ts', line: 42 },
      lesson: 'pattern works'
    });
    expect(typeof payload.evidence).toBe('object');
  });

  it('requires at least one topic', () => {
    expect(() =>
      LessonPayloadSchema.parse({
        kind: 'lesson',
        topics: [],
        applies_to: [],
        confidence: 'confirmed',
        evidence: 'x',
        lesson: 'y'
      })
    ).toThrow();
  });
});

describe('UserCorrectionPayloadSchema', () => {
  it('parses correction with all fields', () => {
    const payload = UserCorrectionPayloadSchema.parse({
      kind: 'user_correction',
      verbatim_quote: "we said we wouldn't add a URL field",
      agent_did_wrong: 'added a workspace URL input box',
      root_cause: 'forgot prior spec decision',
      signal_category: 'past-reference'
    });
    expect(payload.signal_category).toBe('past-reference');
  });

  it('allows correction without signal category', () => {
    const payload = UserCorrectionPayloadSchema.parse({
      kind: 'user_correction',
      verbatim_quote: 'no',
      agent_did_wrong: 'tried to delete file',
      root_cause: 'misread instruction'
    });
    expect(payload.signal_category).toBeUndefined();
  });
});

describe('SdkNotePayloadSchema', () => {
  it('parses sdk note', () => {
    const payload = SdkNotePayloadSchema.parse({
      kind: 'sdk_note',
      sdk_package: '@jetdevs/core',
      topics: ['actor-pattern'],
      applies_to: ['cadra-web'],
      narrative: 'createActor reads from session.user.currentOrgId'
    });
    expect(payload.sdk_package).toBe('@jetdevs/core');
  });

  it('rejects unknown sdk package', () => {
    expect(() =>
      SdkNotePayloadSchema.parse({
        kind: 'sdk_note',
        sdk_package: '@nope/thing',
        topics: [],
        applies_to: [],
        narrative: 'x'
      })
    ).toThrow();
  });
});

describe('ProblemAnalysisPayloadSchema', () => {
  it('parses full debugging chain', () => {
    const payload = ProblemAnalysisPayloadSchema.parse({
      kind: 'problem_analysis',
      symptoms: '500 on second submit',
      investigation_path: ['checked logs', 'inspected db row', 'found duplicate state'],
      root_cause: 'bare insert throws on duplicate state',
      not_obvious: 'first attempt always succeeded; only second attempt repro'
    });
    expect(payload.investigation_path.length).toBe(3);
  });

  it('requires at least one investigation step', () => {
    expect(() =>
      ProblemAnalysisPayloadSchema.parse({
        kind: 'problem_analysis',
        symptoms: 'x',
        investigation_path: [],
        root_cause: 'y',
        not_obvious: 'z'
      })
    ).toThrow();
  });
});

describe('DecisionPayloadSchema', () => {
  it('parses decision with two options', () => {
    const payload = DecisionPayloadSchema.parse({
      kind: 'decision',
      options_considered: [
        { name: 'Electron', trade_offs: 'large bundle' },
        { name: 'Tauri', trade_offs: 'rust dep' }
      ],
      chosen: 'Tauri',
      why: 'smaller install footprint and native menu bar fit'
    });
    expect(payload.chosen).toBe('Tauri');
  });

  it('requires at least two options', () => {
    expect(() =>
      DecisionPayloadSchema.parse({
        kind: 'decision',
        options_considered: [{ name: 'Only one' }],
        chosen: 'Only one',
        why: 'no alternative'
      })
    ).toThrow();
  });
});

describe('DevWorkflowPayloadSchema (discriminated union)', () => {
  it('parses every valid kind', () => {
    const samples = [
      { kind: 'change', narrative: 'edited file' },
      { kind: 'feature', narrative: 'shipped feature' },
      { kind: 'discovery', narrative: 'learned X', fact: 'fact text' },
      {
        kind: 'architecture_issue',
        status: 'unresolved',
        topics: ['rls'],
        applies_to: [],
        issue: 'x',
        impact: 'y'
      },
      {
        kind: 'lesson',
        topics: ['caching'],
        applies_to: [],
        confidence: 'confirmed',
        evidence: 'abc',
        lesson: 'lesson text'
      },
      {
        kind: 'user_correction',
        verbatim_quote: 'no',
        agent_did_wrong: 'wrong',
        root_cause: 'rc'
      },
      {
        kind: 'sdk_note',
        sdk_package: '@cadraos/sdk',
        topics: [],
        applies_to: [],
        narrative: 'note'
      },
      {
        kind: 'problem_analysis',
        symptoms: 's',
        investigation_path: ['step'],
        root_cause: 'rc',
        not_obvious: 'no'
      },
      {
        kind: 'decision',
        options_considered: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        why: 'because'
      }
    ];
    for (const sample of samples) {
      expect(DevWorkflowPayloadSchema.parse(sample).kind).toBe(sample.kind);
    }
  });
});

describe('parseDevWorkflowPayload', () => {
  it('returns ok on valid payload', () => {
    const result = parseDevWorkflowPayload({ kind: 'change', narrative: 'x' });
    expect(result.ok).toBe(true);
  });

  it('returns ok=false on invalid payload', () => {
    const result = parseDevWorkflowPayload({ kind: 'bogus' });
    expect(result.ok).toBe(false);
  });
});

describe('extractDevWorkflowPayload', () => {
  it('extracts a valid payload from metadata.dev_workflow', () => {
    const metadata = {
      other_key: 'value',
      dev_workflow: { kind: 'change', narrative: 'x' }
    };
    const payload = extractDevWorkflowPayload(metadata);
    expect(payload?.kind).toBe('change');
  });

  it('returns null when key absent', () => {
    expect(extractDevWorkflowPayload({ other: 'value' })).toBeNull();
    expect(extractDevWorkflowPayload(null)).toBeNull();
    expect(extractDevWorkflowPayload(undefined)).toBeNull();
  });

  it('returns null on invalid payload', () => {
    expect(extractDevWorkflowPayload({ dev_workflow: { kind: 'bogus' } })).toBeNull();
  });
});

describe('withDevWorkflowPayload', () => {
  it('merges payload into base metadata', () => {
    const merged = withDevWorkflowPayload(
      { existing: 'value' },
      { kind: 'change', narrative: 'x' } as const
    );
    expect(merged.existing).toBe('value');
    expect((merged.dev_workflow as { kind: string }).kind).toBe('change');
  });

  it('handles null base', () => {
    const merged = withDevWorkflowPayload(null, { kind: 'change', narrative: 'x' } as const);
    expect((merged.dev_workflow as { kind: string }).kind).toBe('change');
  });

  it('throws on invalid payload at insert time', () => {
    expect(() =>
      withDevWorkflowPayload(null, { kind: 'bogus' } as never)
    ).toThrow();
  });
});
