// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  buildDevWorkflowWhere,
  buildScopedDevWorkflowSelect
} from '../../src/storage/postgres/observation-dev-workflow-search.js';

describe('buildDevWorkflowWhere — empty inputs', () => {
  it('returns empty sql when no filters', () => {
    const out = buildDevWorkflowWhere({});
    expect(out.sql).toBe('');
    expect(out.params).toEqual([]);
  });

  it('requireDevWorkflowKey forces existence check', () => {
    const out = buildDevWorkflowWhere({}, { requireDevWorkflowKey: true });
    expect(out.sql).toBe("metadata ? 'dev_workflow'");
    expect(out.params).toEqual([]);
  });
});

describe('buildDevWorkflowWhere — single filters', () => {
  it('builds kind filter with ANY', () => {
    const out = buildDevWorkflowWhere({ kinds: ['lesson'] });
    expect(out.sql).toContain("metadata->'dev_workflow'->>'kind' = ANY($1::text[])");
    expect(out.params).toEqual([['lesson']]);
  });

  it('builds anyTopic filter using JSON ?| operator', () => {
    const out = buildDevWorkflowWhere({ anyTopic: ['rls', 'caching'] });
    expect(out.sql).toContain("metadata->'dev_workflow'->'topics' ?| $1::text[]");
    expect(out.params).toEqual([['rls', 'caching']]);
  });

  it('builds allTopics filter using JSON ?& operator', () => {
    const out = buildDevWorkflowWhere({ allTopics: ['rls'] });
    expect(out.sql).toContain("metadata->'dev_workflow'->'topics' ?& $1::text[]");
  });

  it('builds applies_to filter', () => {
    const out = buildDevWorkflowWhere({ anyAppliesTo: ['cadra-web'] });
    expect(out.sql).toContain("metadata->'dev_workflow'->'applies_to' ?| $1::text[]");
  });

  it('builds confidence filter', () => {
    const out = buildDevWorkflowWhere({ confidence: 'confirmed' });
    expect(out.sql).toContain("metadata->'dev_workflow'->>'confidence' = $1");
    expect(out.params).toEqual(['confirmed']);
  });

  it('builds archStatus filter', () => {
    const out = buildDevWorkflowWhere({ archStatus: ['unresolved', 'investigating'] });
    expect(out.sql).toContain("metadata->'dev_workflow'->>'status' = ANY($1::text[])");
    expect(out.params).toEqual([['unresolved', 'investigating']]);
  });

  it('builds sdkPackage filter', () => {
    const out = buildDevWorkflowWhere({ sdkPackage: ['@jetdevs/core'] });
    expect(out.sql).toContain("metadata->'dev_workflow'->>'sdk_package' = ANY($1::text[])");
  });
});

describe('buildDevWorkflowWhere — combined filters', () => {
  it('AND-joins multiple filters', () => {
    const out = buildDevWorkflowWhere({
      kinds: ['lesson'],
      anyTopic: ['rls'],
      confidence: 'confirmed'
    });
    expect(out.sql.startsWith('(')).toBe(true);
    expect(out.sql.endsWith(')')).toBe(true);
    expect(out.sql.split(' AND ').length).toBe(3);
    expect(out.params).toEqual([['lesson'], ['rls'], 'confirmed']);
  });

  it('increments param indices monotonically', () => {
    const out = buildDevWorkflowWhere({
      kinds: ['lesson'],
      anyTopic: ['rls'],
      anyAppliesTo: ['cadra-web']
    });
    expect(out.sql).toContain('$1');
    expect(out.sql).toContain('$2');
    expect(out.sql).toContain('$3');
    expect(out.params.length).toBe(3);
  });

  it('honors a custom startParamIndex', () => {
    const out = buildDevWorkflowWhere(
      { kinds: ['lesson'], anyTopic: ['rls'] },
      { startParamIndex: 7 }
    );
    expect(out.sql).toContain('$7');
    expect(out.sql).toContain('$8');
    expect(out.sql).not.toContain('$1');
  });

  it('honors a custom metadata column', () => {
    const out = buildDevWorkflowWhere(
      { kinds: ['lesson'] },
      { metadataColumn: 'm' }
    );
    expect(out.sql).toContain("m->'dev_workflow'->>'kind'");
    expect(out.sql).not.toContain("metadata->'dev_workflow'->>'kind'");
  });
});

describe('buildScopedDevWorkflowSelect', () => {
  it('builds full SELECT with no extra filters', () => {
    const out = buildScopedDevWorkflowSelect(
      {},
      { projectId: 'p1', teamId: 't1', limit: 50 }
    );
    expect(out.sql).toContain('SELECT * FROM observations');
    expect(out.sql).toContain('WHERE project_id = $1');
    expect(out.sql).toContain('AND team_id = $2');
    expect(out.sql).toContain('LIMIT $3');
    expect(out.params).toEqual(['p1', 't1', 50]);
  });

  it('builds full SELECT with filters spliced in', () => {
    const out = buildScopedDevWorkflowSelect(
      { kinds: ['lesson'], anyTopic: ['rls'] },
      { projectId: 'p1', teamId: 't1' }
    );
    expect(out.sql).toContain("metadata->'dev_workflow'->>'kind' = ANY($3::text[])");
    expect(out.sql).toContain("metadata->'dev_workflow'->'topics' ?| $4::text[]");
    expect(out.sql).toContain('LIMIT $5');
    expect(out.params).toEqual(['p1', 't1', ['lesson'], ['rls'], 100]);
  });

  it('uses default limit of 100', () => {
    const out = buildScopedDevWorkflowSelect(
      {},
      { projectId: 'p1', teamId: 't1' }
    );
    expect(out.params[out.params.length - 1]).toBe(100);
  });
});
