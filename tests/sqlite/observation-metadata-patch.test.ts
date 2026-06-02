import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';

describe('SessionStore.updateObservationMetadataPatch', () => {
  let store: SessionStore;
  beforeEach(() => { store = new SessionStore(':memory:'); });
  afterEach(() => { store.close(); });

  it('merges top-level keys into existing metadata JSON', () => {
    const memoryId = store.getOrCreateManualSession('proj-x');
    const stored = store.storeObservation(memoryId, 'proj-x', {
      type: 'must_know', title: 'Deploy flow', subtitle: null, facts: [],
      narrative: 'Deploys via Coolify', concepts: ['must_know'], files_read: [],
      files_modified: [], agent_type: 'training', agent_id: null,
      metadata: JSON.stringify({ scope: 'project', source: 'training', active: true }),
    });
    store.updateObservationMetadataPatch(stored.id, { active: false });
    const row = store.db.prepare('SELECT metadata FROM observations WHERE id = ?').get(stored.id) as { metadata: string };
    const meta = JSON.parse(row.metadata);
    expect(meta.active).toBe(false);
    expect(meta.scope).toBe('project');
    expect(meta.source).toBe('training');
  });

  it('creates metadata when none exists', () => {
    const memoryId = store.getOrCreateManualSession('proj-y');
    const stored = store.storeObservation(memoryId, 'proj-y', {
      type: 'must_know', title: 'X', subtitle: null, facts: [], narrative: 'x',
      concepts: [], files_read: [], files_modified: [], agent_type: 'training',
      agent_id: null, metadata: null,
    });
    store.updateObservationMetadataPatch(stored.id, { active: false });
    const row = store.db.prepare('SELECT metadata FROM observations WHERE id = ?').get(stored.id) as { metadata: string };
    expect(JSON.parse(row.metadata).active).toBe(false);
  });

  it('discards corrupt metadata and applies patch cleanly', () => {
    const memoryId = store.getOrCreateManualSession('proj-z');
    const stored = store.storeObservation(memoryId, 'proj-z', {
      type: 'must_know', title: 'Z', subtitle: null, facts: [], narrative: 'z',
      concepts: [], files_read: [], files_modified: [], agent_type: 'training',
      agent_id: null, metadata: null,
    });
    store.db.prepare('UPDATE observations SET metadata = ? WHERE id = ?').run('not-json', stored.id);
    store.updateObservationMetadataPatch(stored.id, { active: false });
    const row = store.db.prepare('SELECT metadata FROM observations WHERE id = ?').get(stored.id) as { metadata: string };
    expect(JSON.parse(row.metadata)).toEqual({ active: false });
  });
});
