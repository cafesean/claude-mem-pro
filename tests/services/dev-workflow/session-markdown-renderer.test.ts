// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  renderSessionFilename,
  renderSessionMarkdown,
  type HydratedObservation
} from '../../../src/services/dev-workflow/session-markdown-renderer.js';
import type { SessionRecord } from '../../../src/core/schemas/session-record.js';

const RECORD: SessionRecord = {
  id: 'rec-1',
  session_id: 'sess-1',
  title: 'Phase 1 implementation',
  date: '2026-05-28',
  projects: ['claude-mem'],
  branch: 'feature/dev-workflow-schema-absorb-phase-1',
  status: 'completed',
  type: 'feature',
  topics: ['rls', 'caching'],
  tags: ['phase-1'],
  last_updated: '2026-05-28T15:00:00Z',
  sdk_touched: [],
  apps_touched: ['claude-mem'],
  commits: ['0a994cda', '12d1b6a7'],
  related_sessions: [],
  specs: ['_context/spec.md'],
  content: {
    objective: 'wire up dev-workflow schema absorb phase 1',
    updates: [
      {
        timestamp: '2026-05-28T15:00:00Z',
        what_changed: 'added topic taxonomy + kind discriminator',
        implementation_details: 'pure additions, no migration',
        commit_log: [{ hash: '0a994cda', message: 'feat(schemas)', files: [] }],
        files_changed: [{ path: 'src/foo.ts', changeType: 'A' }],
        git_status: { branch: 'feature/x', workingTree: 'clean' }
      }
    ],
    sdk_notes: { '@cadraos/sdk': 'no changes' },
    architecture_issues: [{ observationId: 'obs-1', cachedTitle: 'RLS bypass' }],
    context_documents: [
      { document: 'specs.md', path: '_context/spec.md', why_it_matters: 'design source' }
    ],
    lessons_learned: [{ observationId: 'obs-2' }],
    user_steering: [],
    next_steps: ['continue to Phase 2', 'ship Phase 1 PR']
  },
  observation_refs: ['obs-1', 'obs-2'],
  generation_metadata: {
    synthesized_at: '2026-05-28T15:01:00Z',
    input_tokens: 1000,
    output_tokens: 800,
    cost_usd: 0.04,
    synthesis_model: 'claude-sonnet-4-7'
  }
};

describe('renderSessionFilename', () => {
  it('produces the dev-workflow naming convention', () => {
    expect(renderSessionFilename(RECORD, 'phase-1')).toBe(
      '2026-05-28-[claude-mem]-phase-1.md'
    );
  });

  it('falls back to unknown project tag', () => {
    const r = { ...RECORD, projects: [] };
    expect(renderSessionFilename(r, 'phase-1')).toBe('2026-05-28-[unknown]-phase-1.md');
  });
});

describe('renderSessionMarkdown', () => {
  it('includes frontmatter with all standard keys', async () => {
    const md = await renderSessionMarkdown(RECORD);
    expect(md).toContain('---');
    expect(md).toContain('title: "Phase 1 implementation"');
    expect(md).toContain('date: 2026-05-28');
    expect(md).toContain('projects: [claude-mem]');
    expect(md).toContain('status: completed');
    expect(md).toContain('topics: [rls, caching]');
  });

  it('renders all standard sections', async () => {
    const md = await renderSessionMarkdown(RECORD);
    expect(md).toContain('# Session: Phase 1 implementation');
    expect(md).toContain('## Objective');
    expect(md).toContain('## SDK Notes');
    expect(md).toContain('## Architecture Issues');
    expect(md).toContain('## Context Documents');
    expect(md).toContain('## Lessons Learned');
    expect(md).toContain('## User Steering & Corrections');
    expect(md).toContain('## Next Steps');
    expect(md).toContain('## Updates');
  });

  it('falls back to cachedTitle when no resolver provided', async () => {
    const md = await renderSessionMarkdown(RECORD);
    expect(md).toContain('RLS bypass');
    expect(md).toContain('obs-1');
  });

  it('uses resolver-hydrated observation titles when present', async () => {
    const resolver = async (ids: readonly string[]) => {
      const map = new Map<string, HydratedObservation>();
      for (const id of ids) {
        map.set(id, {
          observationId: id,
          title: `Resolved title for ${id}`,
          body: 'hydrated body'
        });
      }
      return map;
    };
    const md = await renderSessionMarkdown(RECORD, { resolver });
    expect(md).toContain('Resolved title for obs-1');
    expect(md).toContain('Resolved title for obs-2');
    expect(md).toContain('hydrated body');
  });

  it('renders provenance footer when generation_metadata present', async () => {
    const md = await renderSessionMarkdown(RECORD);
    expect(md).toContain('<!-- claude-mem session_record provenance');
    expect(md).toContain('model: claude-sonnet-4-7');
    expect(md).toContain('cost: $0.0400');
  });

  it('honors includeProvenance=false', async () => {
    const md = await renderSessionMarkdown(RECORD, { includeProvenance: false });
    expect(md).not.toContain('<!-- claude-mem session_record provenance');
  });

  it('renders empty sections with placeholder text', async () => {
    const empty: SessionRecord = {
      ...RECORD,
      content: {
        ...RECORD.content,
        sdk_notes: {},
        architecture_issues: [],
        context_documents: [],
        lessons_learned: [],
        user_steering: [],
        next_steps: [],
        objective: ''
      }
    };
    const md = await renderSessionMarkdown(empty);
    expect(md).toContain('_(no objective recorded)_');
    expect(md).toContain('_(nothing this session)_');
    expect(md).toContain('_(none referenced)_');
  });

  it('renders updates with commits + files + git', async () => {
    const md = await renderSessionMarkdown(RECORD);
    expect(md).toContain('### Update — 2026-05-28T15:00:00Z');
    expect(md).toContain('`0a994cda`');
    expect(md).toContain('A src/foo.ts');
    expect(md).toContain('branch feature/x');
  });
});
