import { describe, it, expect } from 'bun:test';
import { buildObservationProjectFilter } from '../../../src/services/worker/SearchManager.js';

describe('buildObservationProjectFilter', () => {
  it('includes current project, merged_into_project, and the global bucket', () => {
    const f = buildObservationProjectFilter('my-proj');
    expect(f).toEqual({
      $or: [
        { project: 'my-proj' },
        { merged_into_project: 'my-proj' },
        { project: '__global__' },
      ],
    });
  });
});
