// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import { threeWayMerge } from '../../../src/services/dev-workflow/three-way-merge.js';

const BASE = `---
title: "x"
date: 2026-05-28
---

# Session: x

## Objective

old objective

## Lessons Learned

- **lesson A** [\`obs-1\`]

## Next Steps

- step from base
`;

const REGEN = `---
title: "x"
date: 2026-05-28
status: completed
---

# Session: x

## Objective

new objective

## Lessons Learned

- **lesson A** [\`obs-1\`]
- **lesson B** [\`obs-2\`]

## Next Steps

- step from regen
`;

describe('threeWayMerge — initial write', () => {
  it('uses regenerated when no current file exists', () => {
    const out = threeWayMerge(null, null, REGEN);
    expect(out.merged).toBe(REGEN);
    expect(out.diffLog.length).toBeGreaterThan(0);
  });
});

describe('threeWayMerge — frontmatter authoritative', () => {
  it('overwrites frontmatter when current differs', () => {
    const current = BASE; // BASE has no `status` key
    const out = threeWayMerge(BASE, current, REGEN);
    expect(out.merged).toContain('status: completed');
    expect(out.diffLog.some((e) => e.section === 'frontmatter' && e.action === 'overwritten')).toBe(true);
  });
});

describe('threeWayMerge — authoritative sections (Objective)', () => {
  it('replaces objective with regenerated content', () => {
    const current = BASE.replace('old objective', 'human-edited objective');
    const out = threeWayMerge(BASE, current, REGEN);
    expect(out.merged).toContain('new objective');
    expect(out.merged).not.toContain('human-edited objective');
  });
});

describe('threeWayMerge — append-or-keep (Lessons)', () => {
  it('preserves human-added lessons', () => {
    const current = BASE.replace(
      '- **lesson A** [`obs-1`]',
      '- **lesson A** [`obs-1`]\n- **human-added lesson C**'
    );
    const out = threeWayMerge(BASE, current, REGEN);
    expect(out.merged).toContain('human-added lesson C');
    expect(out.merged).toContain('lesson B');
    expect(out.diffLog.some((e) => e.section === '## Lessons Learned' && e.action === 'kept-human')).toBe(true);
  });

  it('inserts new regenerated lessons not in current', () => {
    const out = threeWayMerge(BASE, BASE, REGEN);
    expect(out.merged).toContain('lesson B');
    expect(out.diffLog.some((e) => e.section === '## Lessons Learned' && e.action === 'inserted')).toBe(true);
  });
});

describe('threeWayMerge — append-only (Next Steps)', () => {
  it('keeps human-added next steps', () => {
    const current = BASE.replace(
      '- step from base',
      '- step from base\n- human added step'
    );
    const out = threeWayMerge(BASE, current, REGEN);
    expect(out.merged).toContain('human added step');
    expect(out.merged).toContain('step from regen');
  });
});

describe('threeWayMerge — no-change detection', () => {
  it('logs no-change when sections identical', () => {
    const out = threeWayMerge(BASE, BASE, BASE);
    expect(out.diffLog.some((e) => e.action === 'no-change')).toBe(true);
  });
});
