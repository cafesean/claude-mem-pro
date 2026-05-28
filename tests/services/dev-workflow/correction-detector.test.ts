// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import { detectCorrection } from '../../../src/services/dev-workflow/correction-detector.js';

describe('detectCorrection — true positives', () => {
  it('fires on past-reference', () => {
    const r = detectCorrection('we said we would not add a URL field');
    expect(r?.category).toBe('past-reference');
  });

  it('fires on direct correction', () => {
    const r = detectCorrection("that's not what I asked for");
    expect(r?.category).toBe('direct');
  });

  it('fires on stop-doing-that', () => {
    const r = detectCorrection('stop doing that');
    expect(r?.category).toBe('rejection');
  });

  it('fires on style request', () => {
    const r = detectCorrection('be more concise');
    expect(r?.category).toBe('style');
  });

  it('fires on wonky', () => {
    const r = detectCorrection('this is wonky');
    expect(r?.category).toBe('rejection');
  });
});

describe('detectCorrection — false positives suppressed', () => {
  it('skips filler "ok"', () => {
    expect(detectCorrection('Ok')).toBeNull();
  });

  it('skips filler "hi"', () => {
    expect(detectCorrection('hi')).toBeNull();
  });

  it('skips literal "say hi"', () => {
    expect(detectCorrection('say "hi"')).toBeNull();
  });

  it('skips when positive guard present', () => {
    expect(detectCorrection('thanks, but stop doing that')).toBeNull();
  });

  it('skips on first-person agent self-question', () => {
    expect(detectCorrection('should I update the file?')).toBeNull();
  });

  it('skips when "broken" appears only in a quote', () => {
    expect(detectCorrection('the doc says "broken pipe"')).toBeNull();
  });

  it('skips when "broken" appears only in a code block', () => {
    expect(detectCorrection('the test prints `broken` in red')).toBeNull();
  });
});

describe('detectCorrection — priority ordering', () => {
  it('past-reference outranks rejection when both fire', () => {
    const r = detectCorrection('we said no');
    expect(r?.category).toBe('past-reference');
  });

  it('direct correction outranks plain rejection', () => {
    const r = detectCorrection("that's not what I asked, stop doing that");
    expect(r?.category).toBe('direct');
  });
});

describe('detectCorrection — confidence threshold', () => {
  it('honours a custom minConfidence', () => {
    expect(detectCorrection('this is wonky', { minConfidence: 0.95 })).toBeNull();
  });

  it('respects ignorePositiveGuards', () => {
    const r = detectCorrection("thanks, but that's wrong", { ignorePositiveGuards: true });
    expect(r?.category).toBe('direct');
  });
});

describe('detectCorrection — match text', () => {
  it('returns the actual matched phrase', () => {
    const r = detectCorrection('we said no URL field');
    expect(r?.matchedText.toLowerCase()).toBe('we said');
  });
});
