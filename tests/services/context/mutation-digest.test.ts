import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { renderMutationDigest } from '../../../src/services/context/MutationDigest.js';
import { MutationStore } from '../../../src/services/sqlite/MutationStore.js';

function seed(): Database {
  const db = new Database(':memory:');
  const store = new MutationStore(db as never);
  // two days, with a dup on day 2
  store.insert({ toolName: 'Edit', target: '/Volumes/HD/code/monorepo/cadra-web/src/a.ts', verb: 'edit', project: 'monorepo', contentSessionId: 's', createdAtEpoch: Date.parse('2026-05-29T10:00:00Z') });
  store.insert({ toolName: 'git', target: 'feat: x', verb: 'commit', project: 'monorepo', contentSessionId: 's', createdAtEpoch: Date.parse('2026-05-30T09:00:00Z') });
  store.insert({ toolName: 'git', target: 'feat: x', verb: 'commit', project: 'monorepo', contentSessionId: 's', createdAtEpoch: Date.parse('2026-05-30T09:05:00Z') }); // dup
  store.insert({ toolName: 'mcp__notion__update', target: null, verb: 'update', project: 'monorepo', contentSessionId: 's', createdAtEpoch: Date.parse('2026-05-30T11:00:00Z') });
  return db;
}

describe('renderMutationDigest', () => {
  it('renders newest-day-first, grouped, deduped, with clean paths', () => {
    const out = renderMutationDigest(seed() as never, ['monorepo']).join('\n');
    expect(out).toContain('## Recent changes (durable mutations)');
    expect(out).toContain('### 2026-05-30');
    expect(out).toContain('### 2026-05-29');
    // path stripped of /Volumes/HD/code/monorepo/
    expect(out).toContain('edit: cadra-web/src/a.ts');
    // external (null target) shown
    expect(out).toContain('update: (external)');
    // dup commit appears once on its day
    expect(out.match(/commit: feat: x/g)?.length).toBe(1);
    // newest day appears before older day
    expect(out.indexOf('### 2026-05-30')).toBeLessThan(out.indexOf('### 2026-05-29'));
  });

  it('returns empty when no mutations for the project', () => {
    expect(renderMutationDigest(seed() as never, ['other-project'])).toEqual([]);
    expect(renderMutationDigest(seed() as never, [])).toEqual([]);
  });
});
