import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { MutationStore, extractVerb } from '../../../src/services/sqlite/MutationStore.js';

function freshStore(): MutationStore {
  return new MutationStore(new Database(':memory:') as never);
}

describe('MutationStore', () => {
  it('creates table idempotently and inserts a row', () => {
    const s = freshStore();
    const id = s.insert({
      toolName: 'Write', target: '/repo/src/x.ts', verb: 'write',
      project: 'monorepo', contentSessionId: 'sess-1', createdAtEpoch: 1000,
    });
    expect(id).toBeGreaterThan(0);
    expect(s.countByProject('monorepo')).toBe(1);
  });

  it('returns recent mutations newest-first, scoped by project', () => {
    const s = freshStore();
    s.insert({ toolName: 'Edit', target: '/a', verb: 'edit', project: 'p1', contentSessionId: 's', createdAtEpoch: 100 });
    s.insert({ toolName: 'mcp__notion__update', target: 'page', verb: 'update', project: 'p1', contentSessionId: 's', createdAtEpoch: 300 });
    s.insert({ toolName: 'Write', target: '/b', verb: 'write', project: 'p2', contentSessionId: 's', createdAtEpoch: 200 });

    const p1 = s.recentByProject('p1');
    expect(p1.length).toBe(2);
    expect(p1[0].createdAtEpoch).toBe(300);  // newest first
    expect(p1[0].verb).toBe('update');
    expect(s.recentByProject('p2').length).toBe(1);
  });

  it('respects the limit', () => {
    const s = freshStore();
    for (let i = 0; i < 5; i++) {
      s.insert({ toolName: 'Write', target: `/f${i}`, verb: 'write', project: 'p', contentSessionId: 's', createdAtEpoch: i });
    }
    expect(s.recentByProject('p', 3).length).toBe(3);
  });
});

describe('extractVerb', () => {
  it('pulls verb from git command', () => {
    expect(extractVerb('Bash', 'git commit -m x')).toBe('commit');
    expect(extractVerb('Bash', 'git push origin develop')).toBe('push');
  });
  it('pulls verb from mcp tool name', () => {
    expect(extractVerb('mcp__notion__update-page')).toBe('update');
    expect(extractVerb('mcp__jira__create_issue')).toBe('create');
  });
  it('returns null when no verb', () => {
    expect(extractVerb('Write')).toBe(null);
  });
});
