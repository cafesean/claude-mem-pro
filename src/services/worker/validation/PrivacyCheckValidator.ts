import { SessionStore } from '../../sqlite/SessionStore.js';
import { logger } from '../../../utils/logger.js';
import { isObviousFiller } from '../../../shared/prompt-noise.js';

export class PrivacyCheckValidator {
  static checkUserPromptPrivacy(
    store: SessionStore,
    contentSessionId: string,
    promptNumber: number,
    operationType: 'observation' | 'summarize',
    sessionDbId: number,
    additionalContext?: Record<string, any>
  ): string | null {
    const userPrompt = store.getUserPrompt(contentSessionId, promptNumber);

    if (!userPrompt || userPrompt.trim() === '') {
      logger.debug('HOOK', `Skipping ${operationType} - user prompt was entirely private`, {
        sessionId: sessionDbId,
        promptNumber,
        ...additionalContext
      });
      return null;
    }

    // Noise gate: when the turn's user prompt is obvious filler (keep-alive
    // loops like "noop", bare "ok"/"ping", empty), skip BOTH summary and
    // observation generation. Returning null here means no SDK/LLM call is
    // queued for this turn — so we never spend inference tokens summarizing
    // noise, and no hollow "User requested noop / learned: None" summary row
    // is ever created. Substantive turns are unaffected.
    if (isObviousFiller(userPrompt)) {
      logger.debug('HOOK', `Skipping ${operationType} - user prompt is noise filler`, {
        sessionId: sessionDbId,
        promptNumber,
        preview: userPrompt.trim().slice(0, 40),
        ...additionalContext
      });
      return null;
    }

    return userPrompt;
  }
}
