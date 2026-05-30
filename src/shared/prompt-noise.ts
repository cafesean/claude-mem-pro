
/**
 * Prompt noise detection — shared, zero-cost, pure functions.
 *
 * Single source of truth for "is this user prompt trivial filler" used to keep
 * keep-alive / chit-chat prompts (e.g. "noop", "say hi", "continue", empty
 * prompts) out of the memory pipeline:
 *   - capture-side: skip persisting the prompt entirely (no row, no summary
 *     LLM call, no context line) — see worker handleSessionInit.
 *   - render-side: defensive filter so legacy noise rows already in the DB
 *     don't surface in the injected recent-context block.
 *
 * The LLM topic-relevance judge (PromptRelevanceJudge) handles the harder
 * "captured but not substantive" case; this util only catches the obvious,
 * exact-match filler so it never costs an LLM call or a DB row.
 *
 * correction-detector imports FILLER_ONLY_PATTERNS from here so the filler
 * vocabulary lives in exactly one place.
 */

export const FILLER_ONLY_PATTERNS: RegExp[] = [
  /^(ok|okay|k|kk|yes|yep|yeah|no|nope|sure|thanks|thank you|ty|thx)$/i,
  /^(hi|hello|hey|yo|sup)$/i,
  /^(continue|go|go on|proceed|next|keep going|carry on)$/i,
  /^(say ["']?hi["']?|say ["']?hello["']?|say ["']?noop["']?|test|testing|ping|noop|no-?op)$/i,
  /^[\s]*$/,
  /^(done|good|nice|perfect|great|cool|awesome)$/i,
  /^(y|n)$/i,
  /^(\.|\?|!|\.\.\.)$/,
  /^(yes please|no thanks|ok thanks|got it|understood|makes sense)$/i,
];

/** Placeholder the hook substitutes for image/file-only prompts. */
export const MEDIA_PROMPT = '[media prompt]';

/**
 * True when the prompt is obvious filler / keep-alive / empty — safe to skip
 * at capture time with zero LLM cost.
 *
 * Media-only prompts (`[media prompt]`) are intentionally NOT treated as
 * filler: an attached image may be meaningful, so it is left for the LLM judge.
 */
export function isObviousFiller(text: string | null | undefined): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed === MEDIA_PROMPT) return false;
  return FILLER_ONLY_PATTERNS.some((re) => re.test(trimmed));
}
