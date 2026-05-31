import { describe, it, expect } from 'bun:test';
import { isObviousFiller, FILLER_ONLY_PATTERNS, MEDIA_PROMPT } from '../../src/shared/prompt-noise.js';

describe('isObviousFiller', () => {
  it('treats the keep-alive noop loop as filler', () => {
    for (const t of ['noop', 'no-op', 'noop ', 'NOOP', 'say noop', 'say "noop"', "say 'noop'"]) {
      expect(isObviousFiller(t)).toBe(true);
    }
  });

  it('treats short chit-chat / acks as filler', () => {
    for (const t of ['ok', 'okay', 'thanks', 'continue', 'go on', 'hi', 'hello', 'yes', 'y', 'test', 'ping', '...', 'perfect']) {
      expect(isObviousFiller(t)).toBe(true);
    }
  });

  it('treats empty / whitespace / nullish as filler', () => {
    expect(isObviousFiller('')).toBe(true);
    expect(isObviousFiller('   ')).toBe(true);
    expect(isObviousFiller(null)).toBe(true);
    expect(isObviousFiller(undefined)).toBe(true);
  });

  it('does NOT treat media-only prompts as filler (may be meaningful)', () => {
    expect(isObviousFiller(MEDIA_PROMPT)).toBe(false);
  });

  it('does NOT treat substantive prompts as filler', () => {
    for (const t of [
      'fix the campaign scheduling bug',
      'continue the migration to phase 3',          // "continue ..." with more words
      'add a region column to merchant_customers',
      'why is the OIDC login looping?',
      'noop the unused variable in parser.ts',       // contains "noop" but substantive
    ]) {
      expect(isObviousFiller(t)).toBe(false);
    }
  });

  it('exposes the filler patterns for reuse', () => {
    expect(Array.isArray(FILLER_ONLY_PATTERNS)).toBe(true);
    expect(FILLER_ONLY_PATTERNS.length).toBeGreaterThan(0);
  });
});
