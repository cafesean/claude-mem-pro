import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';
import {
  createTrainingFact,
  listTrainingFacts,
  retireTrainingFact,
  GLOBAL_PROJECT,
} from '../../src/services/training/TrainingService.js';

describe('TrainingService', () => {
  let store: SessionStore;
  beforeEach(() => { store = new SessionStore(':memory:'); });
  afterEach(() => { store.close(); });

  it('creates a global fact under the reserved project and lists it', async () => {
    const res = await createTrainingFact(store, null, {
      cwd: '/tmp/whatever', scope: 'global', title: 'Terse answers',
      content: 'Sean prefers terse answers.',
    });
    expect(res.project).toBe(GLOBAL_PROJECT);
    expect(res.id).toBeGreaterThan(0);

    const facts = listTrainingFacts(store, { project: 'some-proj', includeGlobal: true });
    expect(facts.some(f => f.title === 'Terse answers' && f.scope === 'global')).toBe(true);
  });

  it('creates a project fact tagged must_know with active metadata', async () => {
    const res = await createTrainingFact(store, null, {
      cwd: '/tmp/proj-a', scope: 'project', title: 'Deploy',
      content: 'Deploys via Coolify.',
    });
    const facts = listTrainingFacts(store, { project: res.project, includeGlobal: false });
    const fact = facts.find(f => f.title === 'Deploy');
    expect(fact).toBeDefined();
    expect(fact!.scope).toBe('project');
    expect(fact!.active).toBe(true);
  });

  it('global fact is excluded when includeGlobal is false', async () => {
    await createTrainingFact(store, null, {
      cwd: '/tmp/x', scope: 'global', title: 'Global only',
      content: 'Should not appear for project-scoped lists.',
    });
    const facts = listTrainingFacts(store, { project: 'some-proj', includeGlobal: false });
    expect(facts.some(f => f.title === 'Global only')).toBe(false);
  });

  it('retire flips active to false and hides from default list', async () => {
    const res = await createTrainingFact(store, null, {
      cwd: '/tmp/proj-b', scope: 'project', title: 'Temp', content: 'temp fact',
    });
    retireTrainingFact(store, res.id);
    const active = listTrainingFacts(store, { project: res.project, includeGlobal: false });
    expect(active.some(f => f.id === res.id)).toBe(false);
  });
});
