import { describe, it, expect } from 'bun:test';
import { PrivacyCheckValidator } from '../../../src/services/worker/validation/PrivacyCheckValidator.js';

/** Minimal SessionStore stand-in: only getUserPrompt is exercised. */
function storeReturning(text: string | null): any {
  return { getUserPrompt: () => text };
}

describe('PrivacyCheckValidator — noise gate', () => {
  it('returns null for the noop keep-alive loop (skips summary + observation)', () => {
    for (const t of ['noop', 'say "noop"', 'no-op', 'NOOP']) {
      const r = PrivacyCheckValidator.checkUserPromptPrivacy(storeReturning(t), 'cs', 1, 'summarize', 1);
      expect(r).toBeNull();
    }
  });

  it('returns null for bare acks / pings', () => {
    for (const t of ['ok', 'thanks', 'ping', 'continue']) {
      const r = PrivacyCheckValidator.checkUserPromptPrivacy(storeReturning(t), 'cs', 1, 'observation', 1);
      expect(r).toBeNull();
    }
  });

  it('still returns null for empty/private prompts (unchanged behavior)', () => {
    expect(PrivacyCheckValidator.checkUserPromptPrivacy(storeReturning(''), 'cs', 1, 'summarize', 1)).toBeNull();
    expect(PrivacyCheckValidator.checkUserPromptPrivacy(storeReturning(null), 'cs', 1, 'summarize', 1)).toBeNull();
  });

  it('returns the prompt for substantive turns (summary still generated)', () => {
    const t = 'fix the campaign scheduling bug in yobo-merchant';
    const r = PrivacyCheckValidator.checkUserPromptPrivacy(storeReturning(t), 'cs', 1, 'summarize', 1);
    expect(r).toBe(t);
  });

  it('does not over-match prompts that merely contain a filler word', () => {
    const t = 'remove the noop placeholder from parser.ts';
    expect(PrivacyCheckValidator.checkUserPromptPrivacy(storeReturning(t), 'cs', 1, 'summarize', 1)).toBe(t);
  });
});
