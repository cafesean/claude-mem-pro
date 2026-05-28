// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import { SessionBoundary } from '../../../src/services/dev-workflow/session-boundary.js';
import type { SessionRecord, SynthesisInputs } from '../../../src/core/schemas/session-record.js';

const RECORD: SessionRecord = {
  id: 'rec-1',
  session_id: 'sess-1',
  title: 'Phase 1',
  date: '2026-05-28',
  projects: ['claude-mem'],
  branch: 'feature/x',
  status: 'completed',
  type: 'feature',
  topics: [],
  tags: [],
  last_updated: '2026-05-28T15:00:00Z',
  sdk_touched: [],
  apps_touched: ['claude-mem'],
  commits: [],
  related_sessions: [],
  specs: [],
  content: {
    objective: '',
    updates: [],
    sdk_notes: {},
    architecture_issues: [],
    context_documents: [],
    lessons_learned: [],
    user_steering: [],
    next_steps: []
  },
  observation_refs: []
};

const INPUTS: SynthesisInputs = {
  sessionId: 'sess-1',
  observations: [],
  specPaths: []
};

function makeAdapters(over: Partial<Record<string, unknown>> = {}) {
  const calls: Record<string, number> = {
    gather: 0,
    synth: 0,
    persist: 0,
    exists: 0
  };
  const persistArgs: SessionRecord[] = [];

  const adapters = {
    gatherInputs: async () => {
      calls.gather++;
      return INPUTS;
    },
    synthesise: async () => {
      calls.synth++;
      return { record: RECORD, costUsd: 0.05, durationMs: 120 };
    },
    persist: async (record: SessionRecord) => {
      calls.persist++;
      persistArgs.push(record);
    },
    exists: async () => {
      calls.exists++;
      return true;
    },
    ...over
  };

  return { adapters, calls, persistArgs };
}

describe('SessionBoundary — happy path', () => {
  it('closes a session end-to-end via SessionStop hook', async () => {
    const { adapters, calls, persistArgs } = makeAdapters();
    const boundary = new SessionBoundary(adapters);

    const result = await boundary.onSessionStop('sess-1');

    expect(result.sessionId).toBe('sess-1');
    expect(result.trigger).toBe('session-stop-hook');
    expect(result.record).toBe(RECORD);
    expect(result.synthesisCostUsd).toBe(0.05);
    expect(result.synthesisDurationMs).toBe(120);
    expect(calls.exists).toBe(1);
    expect(calls.gather).toBe(1);
    expect(calls.synth).toBe(1);
    expect(calls.persist).toBe(1);
    expect(persistArgs[0]).toBe(RECORD);
  });

  it('closes via explicit cmd trigger', async () => {
    const { adapters } = makeAdapters();
    const boundary = new SessionBoundary(adapters);

    const result = await boundary.closeSession('sess-1', {
      trigger: 'explicit-cmd',
      project: 'claude-mem'
    });

    expect(result.trigger).toBe('explicit-cmd');
  });

  it('invokes onClose listener', async () => {
    const { adapters } = makeAdapters();
    const events: string[] = [];
    const boundary = new SessionBoundary(adapters, {
      onClose: (r) => events.push(`${r.trigger}:${r.sessionId}`)
    });

    await boundary.onSessionStop('sess-1');
    expect(events).toEqual(['session-stop-hook:sess-1']);
  });
});

describe('SessionBoundary — error handling', () => {
  it('throws when session does not exist', async () => {
    const { adapters } = makeAdapters({
      exists: async () => false
    });
    const boundary = new SessionBoundary(adapters);

    await expect(boundary.onSessionStop('missing')).rejects.toThrow('session_not_found');
  });

  it('does not persist when synthesise returns null record', async () => {
    const { adapters, calls } = makeAdapters({
      synthesise: async () => ({ record: null })
    });
    const boundary = new SessionBoundary(adapters);

    const result = await boundary.onSessionStop('sess-1');

    expect(result.record).toBeNull();
    expect(calls.persist).toBe(0);
  });
});

describe('SessionBoundary — idle timeout', () => {
  it('shouldAutoClose is disabled by default', () => {
    const { adapters } = makeAdapters();
    const boundary = new SessionBoundary(adapters);

    expect(boundary.shouldAutoClose(new Date(Date.now() - 24 * 3600_000))).toBe(false);
  });

  it('shouldAutoClose fires when configured + elapsed', () => {
    const { adapters } = makeAdapters();
    const boundary = new SessionBoundary(adapters, { idleCloseMinutes: 30 });

    expect(boundary.shouldAutoClose(new Date(Date.now() - 31 * 60_000))).toBe(true);
    expect(boundary.shouldAutoClose(new Date(Date.now() - 5 * 60_000))).toBe(false);
  });

  it('shouldAutoClose returns false on null lastActivityAt', () => {
    const { adapters } = makeAdapters();
    const boundary = new SessionBoundary(adapters, { idleCloseMinutes: 30 });

    expect(boundary.shouldAutoClose(null)).toBe(false);
  });
});
