import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { renderMutationDigest, topicOf } from '../../../src/services/context/MutationDigest.js';
import { MutationStore } from '../../../src/services/sqlite/MutationStore.js';

const NOW = Date.parse('2026-06-02T00:00:00Z');
const t = (iso: string) => Date.parse(iso);

function seed(): Database {
  const db = new Database(':memory:');
  const store = new MutationStore(db as never);

  // Session A — busy worktree session (klaviyo), many files on 2026-06-01
  const A = 'sess-a';
  for (let i = 0; i < 12; i++) {
    store.insert({
      toolName: 'Edit',
      target: `/Volumes/HD/code/monorepo/yobo/.claude/worktrees/klaviyo-sync-orchestration/src/file${i}.ts`,
      verb: 'edit',
      project: 'monorepo',
      contentSessionId: A,
      createdAtEpoch: t('2026-06-01T10:00:00Z') + i * 1000,
    });
  }
  store.insert({ toolName: 'git', target: 'feat: klaviyo sync', verb: 'commit', project: 'monorepo', contentSessionId: A, createdAtEpoch: t('2026-06-01T10:30:00Z') });

  // Session B — small spec-doc session, same day
  const B = 'sess-b';
  store.insert({ toolName: 'Edit', target: '/Volumes/HD/code/monorepo/_context/yobo-merchant/_specs/p26-backoffice-connectors/specs.md', verb: 'edit', project: 'monorepo', contentSessionId: B, createdAtEpoch: t('2026-06-01T14:00:00Z') });
  store.insert({ toolName: 'Write', target: '/Volumes/HD/code/monorepo/_context/yobo-merchant/_specs/p26-backoffice-connectors/implementation.md', verb: 'write', project: 'monorepo', contentSessionId: B, createdAtEpoch: t('2026-06-01T14:05:00Z') });

  // Session C — earlier day, cadra-web
  const C = 'sess-c';
  store.insert({ toolName: 'Edit', target: '/Volumes/HD/code/monorepo/cadra-web/src/a.ts', verb: 'edit', project: 'monorepo', contentSessionId: C, createdAtEpoch: t('2026-05-30T09:00:00Z') });

  // Old row outside a 7-day window from NOW (should be filtered by windowDays)
  store.insert({ toolName: 'Edit', target: '/Volumes/HD/code/monorepo/cadra-web/src/old.ts', verb: 'edit', project: 'monorepo', contentSessionId: 'sess-old', createdAtEpoch: t('2026-05-01T09:00:00Z') });

  return db;
}

describe('topicOf', () => {
  it('extracts worktree, spec, skill and repo topics', () => {
    expect(topicOf('/Volumes/HD/code/monorepo/yobo/.claude/worktrees/klaviyo-sync-orchestration/src/x.ts')).toBe('yobo/klaviyo-sync-orchestration');
    expect(topicOf('/Volumes/HD/code/monorepo/_context/y/_specs/p26-backoffice-connectors/specs.md')).toBe('_specs/p26-backoffice-connectors');
    expect(topicOf('/Volumes/General/seanliao/.claude/skills/health-check/SKILL.md')).toBe('.claude/health-check');
    expect(topicOf('/Volumes/HD/code/monorepo/cadra-web/src/a.ts')).toBe('cadra-web');
    expect(topicOf('feat: a commit message')).toBe('');
    expect(topicOf(null)).toBe('');
  });
});

describe('renderMutationDigest — session grouping (default)', () => {
  it('renders one block per session, labelled by dominant topic, with capped samples', () => {
    const out = renderMutationDigest(seed() as never, ['monorepo'], { nowEpoch: NOW }).join('\n');
    expect(out).toContain('## Recent work (by session)');
    // busy klaviyo session collapses to ONE labelled block (13 mutations), not 13 lines
    expect(out).toContain('- yobo/klaviyo-sync-orchestration — 13 changes');
    expect((out.match(/yobo\/klaviyo-sync-orchestration/g) ?? []).length).toBe(1);
    // file samples capped at 4 with "+N more"
    expect(out).toContain('+8 more');
    // other sessions still surface (not crowded out by the busy one)
    expect(out).toContain('_specs/p26-backoffice-connectors');
    expect(out).toContain('cadra-web');
    // day grouping, newest first
    expect(out).toContain('### 2026-06-01');
    expect(out).toContain('### 2026-05-30');
    expect(out.indexOf('### 2026-06-01')).toBeLessThan(out.indexOf('### 2026-05-30'));
    // sessions ordered by recency within a day (spec session ended later than klaviyo)
    expect(out.indexOf('_specs/p26-backoffice-connectors')).toBeLessThan(out.indexOf('yobo/klaviyo-sync-orchestration'));
  });

  it('respects the time window (windowDays)', () => {
    const out = renderMutationDigest(seed() as never, ['monorepo'], { nowEpoch: NOW, windowDays: 7 }).join('\n');
    expect(out).not.toContain('old.ts');
    const all = renderMutationDigest(seed() as never, ['monorepo'], { nowEpoch: NOW, windowDays: 0 }).join('\n');
    expect(all).toContain('cadra-web'); // sess-old also cadra-web; with no window it's included
  });

  it('caps the number of session blocks (maxBlocks)', () => {
    const out = renderMutationDigest(seed() as never, ['monorepo'], { nowEpoch: NOW, maxBlocks: 1 }).join('\n');
    // only the single most-recent session block survives (spec session ended latest)
    expect(out).toContain('_specs/p26-backoffice-connectors');
    expect(out).not.toContain('cadra-web');
    expect(out).not.toContain('yobo/klaviyo-sync-orchestration');
  });
});

describe('renderMutationDigest — topic grouping', () => {
  it('rolls up across sessions into area blocks', () => {
    const out = renderMutationDigest(seed() as never, ['monorepo'], { nowEpoch: NOW, group: 'topic' }).join('\n');
    expect(out).toContain('## Recent changes by area (last 7 days)');
    // topic mode buckets purely by path topic, so the git commit (no path) → 'misc',
    // leaving 12 file edits under the klaviyo area
    expect(out).toContain('- yobo/klaviyo-sync-orchestration — 12 changes');
    expect(out).toContain('_specs/p26-backoffice-connectors');
  });
});

describe('renderMutationDigest — flat grouping (legacy)', () => {
  it('renders the per-file list, deduped per day', () => {
    const out = renderMutationDigest(seed() as never, ['monorepo'], { nowEpoch: NOW, group: 'flat', maxBlocks: 100 }).join('\n');
    expect(out).toContain('## Recent changes (durable mutations)');
    expect(out).toContain('edit: cadra-web/src/a.ts');
    expect(out).toContain('commit: feat: klaviyo sync');
  });
});

describe('renderMutationDigest — empty', () => {
  it('returns empty when no mutations for the project', () => {
    expect(renderMutationDigest(seed() as never, ['other-project'], { nowEpoch: NOW })).toEqual([]);
    expect(renderMutationDigest(seed() as never, [], { nowEpoch: NOW })).toEqual([]);
  });
});
