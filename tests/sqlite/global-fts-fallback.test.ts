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

describe('SessionSearch active-filter — retired observations excluded', () => {
  let store: SessionStore;
  let search: SessionSearch;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    search = new SessionSearch(store.db);
  });
  afterEach(() => { store.close(); });

  it('hides a must_know observation after active is flipped to false', () => {
    const session = store.getOrCreateManualSession('test-proj');

    // Store an active must_know fact.
    const obs = store.storeObservation(session, 'test-proj', {
      type: 'must_know', title: 'Active fact', subtitle: null, facts: [],
      narrative: 'this is active', concepts: ['must_know'],
      files_read: [], files_modified: [], agent_type: 'training', agent_id: null,
      metadata: JSON.stringify({ scope: 'project', active: true }),
    });

    // Should appear before retiring.
    const before = search.searchObservations(undefined, { project: 'test-proj' });
    expect(before.some(r => r.id === obs.id)).toBe(true);

    // Retire it.
    store.updateObservationMetadataPatch(obs.id, { active: false });

    // Should no longer appear after retiring.
    const after = search.searchObservations(undefined, { project: 'test-proj' });
    expect(after.some(r => r.id === obs.id)).toBe(false);
  });

  it('still returns a normal observation with no active key (regression guard)', () => {
    const session = store.getOrCreateManualSession('test-proj2');

    // Store a plain observation with no 'active' key in metadata.
    const obs = store.storeObservation(session, 'test-proj2', {
      type: 'insight', title: 'Normal fact', subtitle: null, facts: [],
      narrative: 'no active key here', concepts: [],
      files_read: [], files_modified: [], agent_type: 'manual', agent_id: null,
      metadata: JSON.stringify({ source: 'manual' }),
    });

    const results = search.searchObservations(undefined, { project: 'test-proj2' });
    expect(results.some(r => r.id === obs.id)).toBe(true);
  });

  it('still returns an observation whose active key is explicitly true', () => {
    const session = store.getOrCreateManualSession('test-proj3');

    const obs = store.storeObservation(session, 'test-proj3', {
      type: 'must_know', title: 'Explicitly active', subtitle: null, facts: [],
      narrative: 'active is true', concepts: ['must_know'],
      files_read: [], files_modified: [], agent_type: 'training', agent_id: null,
      metadata: JSON.stringify({ scope: 'project', active: true }),
    });

    const results = search.searchObservations(undefined, { project: 'test-proj3' });
    expect(results.some(r => r.id === obs.id)).toBe(true);
  });
});
