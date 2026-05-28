// SPDX-License-Identifier: Apache-2.0

/**
 * Correction capture service — Phase 2 entry point.
 *
 * Wraps the correction detector + the Phase 1 enrichment service so
 * a hook handler can fire-and-forget on every UserPromptSubmit.
 *
 * Not wired into the live UserPromptSubmit hook in this PR. A future
 * change adds an opt-in flag (CLAUDE_MEM_CAPTURE_CORRECTIONS) that
 * the session-init handler can read to decide whether to dispatch.
 */

import {
  DevWorkflowEnrichmentService,
  type EnrichedObservation,
  type EnrichmentOptions,
  type LlmCaller
} from '../../server/generation/dev-workflow-prompts/enrichment-service.js';
import { detectCorrection, type CorrectionSignal } from './correction-detector.js';

export interface RecentAction {
  /** Short label, e.g. "Edit src/foo.ts" or "Bash: pnpm test". */
  summary: string;
  /** Optional ISO timestamp; not currently used by the service. */
  at?: string;
}

export interface CaptureRequest {
  userMessage: string;
  sessionId: string;
  recentActions?: readonly RecentAction[];
  /** Free-form context (last agent response excerpt, etc). */
  sessionContext?: string;
}

export type StorageAdapter = (input: {
  sessionId: string;
  observation: EnrichedObservation;
  signal: CorrectionSignal;
}) => Promise<void>;

export interface CaptureOptions extends EnrichmentOptions {
  /** Confidence floor for the pattern detector. Default 0.6. */
  detectorMinConfidence?: number;
  /** Dedupe window in milliseconds. Default 60s. */
  dedupeWindowMs?: number;
  /** Optional logger hook for telemetry. */
  onSkip?: (reason: string, request: CaptureRequest) => void;
}

const DEFAULT_DEDUPE_MS = 60_000;

/**
 * Stateless service — owns no DB connection. The caller provides the
 * LLM caller (so tests can stub Anthropic) and the storage adapter
 * (so the observation lands wherever the host wants — usually the
 * Postgres observation repository).
 */
export class CorrectionCaptureService {
  private readonly enrichment: DevWorkflowEnrichmentService;
  private readonly detectorMinConfidence: number;
  private readonly dedupeWindowMs: number;
  private readonly onSkip?: (reason: string, request: CaptureRequest) => void;
  private readonly recentHashes = new Map<string, number>();

  constructor(
    private readonly llmCaller: LlmCaller,
    private readonly storage: StorageAdapter,
    options: CaptureOptions = {}
  ) {
    this.enrichment = new DevWorkflowEnrichmentService(this.llmCaller, options);
    this.detectorMinConfidence = options.detectorMinConfidence ?? 0.6;
    this.dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_MS;
    this.onSkip = options.onSkip;
  }

  /**
   * Synchronous detection + async enrichment + persistence.
   * Returns the captured observation if persisted, or null otherwise.
   *
   * Designed for fire-and-forget use:
   *   void captureService.capture(request);
   */
  async capture(request: CaptureRequest): Promise<EnrichedObservation | null> {
    const signal = detectCorrection(request.userMessage, {
      minConfidence: this.detectorMinConfidence
    });
    if (!signal) {
      this.onSkip?.('no_correction_signal', request);
      return null;
    }

    if (this.isDuplicate(request)) {
      this.onSkip?.('deduped', request);
      return null;
    }

    const enriched = await this.enrichment.enrich({
      narrative: request.sessionContext ?? 'user issued a correction during the active session',
      userMessage: request.userMessage,
      recentAgentActions: request.recentActions?.map((a) => a.summary),
      agentText: request.sessionContext
    });

    const observation = enriched.observations.find((o) => o.kind === 'user_correction');
    if (!observation) {
      this.onSkip?.('llm_returned_no_correction', request);
      return null;
    }

    await this.storage({ sessionId: request.sessionId, observation, signal });
    this.markCaptured(request);
    return observation;
  }

  /**
   * Lower-overhead variant — returns the pattern detection result
   * without dispatching to LLM. Useful for previewing what would fire.
   */
  detect(userMessage: string): CorrectionSignal | null {
    return detectCorrection(userMessage, {
      minConfidence: this.detectorMinConfidence
    });
  }

  // ---------------------------------------------------------------------
  // Dedupe — in-memory; cheap; persists only for the process lifetime.
  // ---------------------------------------------------------------------

  private hashKey(request: CaptureRequest): string {
    return `${request.sessionId}::${request.userMessage.trim().slice(0, 200)}`;
  }

  private isDuplicate(request: CaptureRequest): boolean {
    const key = this.hashKey(request);
    const stamp = this.recentHashes.get(key);
    if (!stamp) return false;
    if (Date.now() - stamp > this.dedupeWindowMs) {
      this.recentHashes.delete(key);
      return false;
    }
    return true;
  }

  private markCaptured(request: CaptureRequest): void {
    this.recentHashes.set(this.hashKey(request), Date.now());
    // Trim if the map grows huge.
    if (this.recentHashes.size > 256) {
      const cutoff = Date.now() - this.dedupeWindowMs;
      for (const [key, stamp] of this.recentHashes) {
        if (stamp < cutoff) this.recentHashes.delete(key);
      }
    }
  }
}
