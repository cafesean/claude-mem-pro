// SPDX-License-Identifier: Apache-2.0

/**
 * Correction detector — Phase 2 of dev-workflow-schema-absorb.
 *
 * Pure-logic pattern matcher specialized for UserPromptSubmit events.
 * Distinct from the generic kind-detector — this one has tighter
 * false-positive guards because it fires on EVERY user prompt.
 *
 * No LLM call. Microsecond-scale. Safe to run inline in the hook
 * pipeline.
 */

export type CorrectionCategory = 'rejection' | 'past-reference' | 'direct' | 'style';

export interface CorrectionSignal {
  category: CorrectionCategory;
  confidence: number;
  matchedText: string;
}

interface PatternGroup {
  category: CorrectionCategory;
  patterns: readonly RegExp[];
  /** Base confidence for any match in this group. */
  baseConfidence: number;
}

const PATTERN_GROUPS: readonly PatternGroup[] = [
  {
    category: 'past-reference',
    baseConfidence: 0.88,
    patterns: [
      /\bwe said\b/i,
      /\bi told you\b/i,
      /\bi already (said|told)\b/i,
      /\blast time\b/i,
      /\bearlier (you|i) (said|told)\b/i,
      /\byou were supposed to\b/i,
      /\bremember that\b/i
    ]
  },
  {
    category: 'direct',
    baseConfidence: 0.85,
    patterns: [
      /\bthat'?s? not (what|how|right)\b/i,
      /\bnot what (i|we) (asked|said|meant)\b/i,
      /\bshould be\b/i,
      /\binstead of\b/i,
      /\brather than\b/i,
      /\bthat'?s? wrong\b/i,
      /\bthat'?s? incorrect\b/i
    ]
  },
  {
    category: 'rejection',
    baseConfidence: 0.7,
    patterns: [
      /^no\b/i,
      /\bplease (stop|don'?t)\b/i,
      /\bstop (doing|that|it)\b/i,
      /\bdon'?t do that\b/i,
      /\bwonky\b/i,
      /\bthat'?s? broken\b/i,
      /\bbroken\b/i
    ]
  },
  {
    category: 'style',
    baseConfidence: 0.65,
    patterns: [
      /\btoo (much|long|verbose)\b/i,
      /\bbe more concise\b/i,
      /\bless (verbose|wordy)\b/i,
      /\bsimpler\b/i,
      /\bshorter\b/i
    ]
  }
];

// Skip-guards: messages that look like corrections but are not.
const POSITIVE_GUARDS: readonly RegExp[] = [
  /\bthanks?\b/i,
  /\bgreat\b/i,
  /\bperfect\b/i,
  /\bkeep going\b/i,
  /\bcontinue\b/i,
  /\bgood (work|job|catch)\b/i,
  /\b(love|like) (it|this|that)\b/i
];

const FIRST_PERSON_AGENT_QUESTIONS: readonly RegExp[] = [
  /\bdo i need\b/i,
  /\bshould i\b/i,
  /\bcan i\b/i,
  /\bwhere (do|should) i\b/i
];

// Single-word filler that should not fire on its own.
const FILLER_ONLY_PATTERNS: readonly RegExp[] = [
  /^ok$/i,
  /^okay$/i,
  /^yes$/i,
  /^y$/i,
  /^hi$/i,
  /^say "?hi"?$/i
];

export interface DetectorOptions {
  /** Confidence floor; matches below are discarded. Default 0.6. */
  minConfidence?: number;
  /** When true, allow matches even when positive guards are present. */
  ignorePositiveGuards?: boolean;
}

const DEFAULTS: Required<DetectorOptions> = {
  minConfidence: 0.6,
  ignorePositiveGuards: false
};

/**
 * Strip fenced and inline code so backtick-quoted words like "broken"
 * inside a code snippet do not trigger a false correction.
 */
function stripCode(message: string): string {
  return message
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/"[^"]*"/g, ' ');
}

function matchesAny(text: string, patterns: readonly RegExp[]): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m;
  }
  return null;
}

/**
 * Detect whether a user message is a correction. Returns the highest-
 * confidence signal, or null if none meets the threshold.
 */
export function detectCorrection(
  userMessage: string,
  options: DetectorOptions = {}
): CorrectionSignal | null {
  const trimmed = userMessage.trim();
  if (!trimmed) return null;

  // Skip pure filler so the cron-loop "say hi" noise doesn't fire.
  if (matchesAny(trimmed, FILLER_ONLY_PATTERNS)) return null;

  const opts = { ...DEFAULTS, ...options };
  const cleaned = stripCode(trimmed);

  // First-person agent self-questions don't count as corrections.
  if (matchesAny(cleaned, FIRST_PERSON_AGENT_QUESTIONS)) return null;

  // Positive guards veto unless explicitly disabled.
  if (!opts.ignorePositiveGuards && matchesAny(cleaned, POSITIVE_GUARDS)) return null;

  // Walk pattern groups in priority order. Return best match.
  let best: CorrectionSignal | null = null;
  for (const group of PATTERN_GROUPS) {
    const match = matchesAny(cleaned, group.patterns);
    if (!match) continue;
    const signal: CorrectionSignal = {
      category: group.category,
      confidence: group.baseConfidence,
      matchedText: match[0]
    };
    if (!best || signal.confidence > best.confidence) {
      best = signal;
    }
  }

  if (!best || best.confidence < opts.minConfidence) return null;
  return best;
}
