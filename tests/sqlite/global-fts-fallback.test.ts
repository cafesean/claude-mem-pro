import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';
import { SessionSearch } from '../../src/services/sqlite/SessionSearch.js';

describe('SessionSearch global must-know fallback', () => {
  let store: SessionStore;
  let search: SessionSearch;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    search = new SessionSearch(store.db);
  });
  afterEach(() => { store.close(); });

  it('returns a __global__ observation when filtering within a different project', () => {
    const gSession = store.getOrCreateManualSession('__global__');
    store.storeObservation(gSession, '__global__', {
      type: 'must_know', title: 'Terse', subtitle: null, facts: [],
      narrative: 'prefers terse answers', concepts: ['must_know'],
      files_read: [], files_modified: [], agent_type: 'training', agent_id: null,
      metadata: JSON.stringify({ scope: 'global', active: true }),
    });

    // Filter-only path (no query text) exercises buildFilterClause deterministically,
    // without depending on FTS index population in :memory:. The FTS MATCH path uses
    // the same clause.
    const results = search.searchObservations(undefined, { project: 'unrelated-proj' });
    expect(results.some(r => r.title === 'Terse')).toBe(true);
  });
});
