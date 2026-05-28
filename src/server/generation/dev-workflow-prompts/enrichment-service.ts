// SPDX-License-Identifier: Apache-2.0

/**
 * DevWorkflowEnrichmentService — Phase 1.6.
 *
 * Orchestrates the new structured observation pipeline:
 *   tool event → kind detector → prompt module(s) → LLM call → Zod parse
 *                                                                    ↓
 *                                                          dev_workflow payload
 *
 * NOT wired into the live ProviderObservationGenerator. This service
 * is an opt-in entry point that a future phase can plug into. Keeping
 * it standalone preserves the existing generation pipeline while the
 * structured-extraction path matures.
 *
 * Consumers inject:
 *   - a LlmCaller (model dispatch) so tests can stub Anthropic
 *   - a topics list (defaults to the locked TOPICS taxonomy)
 *
 * Output is a list of `EnrichedObservation` records — each holds the
 * source signal, raw LLM output, and validated dev_workflow payload.
 */

import { z } from 'zod';
import { TOPICS } from '../../../core/schemas/topics.js';
import {
  DevWorkflowPayloadSchema,
  type DevWorkflowKind,
  type DevWorkflowPayload,
  withDevWorkflowPayload
} from '../../../core/schemas/dev-workflow-kind.js';
import {
  detectKinds,
  type DetectionResult,
  type DetectorEvent
} from './kind-detector.js';
import { getPromptModule, modelForKind } from './index.js';
import type { ModelTier, PromptContext, PromptModule } from './types.js';

export type { ModelTier, PromptContext, PromptModule } from './types.js';

// ---------------------------------------------------------------------------
// Caller contract — kept narrow so any provider can satisfy it.
// ---------------------------------------------------------------------------

export interface LlmCallRequest {
  systemPrompt: string;
  userPrompt: string;
  model: ModelTier;
  responseJsonSchema: object;
}

export interface LlmCallResponse {
  /** Parsed JSON object returned by the model via tool_use. */
  parsed: unknown;
  /** Raw text in case tool_use is unavailable; consumer must parse. */
  rawText?: string;
  /** Provider-tier identifier (e.g. claude-haiku-4-5) — for telemetry. */
  modelId?: string;
  /** Token + cost info for budgeting. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedUsd?: number;
  };
}

export type LlmCaller = (req: LlmCallRequest) => Promise<LlmCallResponse>;

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

export interface EnrichmentOptions {
  /** Topics vocabulary to inject into prompts; defaults to TOPICS. */
  topicsList?: readonly string[];
  /** Minimum kind confidence to dispatch a prompt. Default 0.5. */
  minConfidence?: number;
  /** Cap on how many kinds to enrich per event. Default 4. */
  maxKindsPerEvent?: number;
  /** When true, emit observations even if Zod validation fails (raw only). */
  failOpen?: boolean;
}

export interface EnrichedObservation {
  kind: DevWorkflowKind;
  detection: DetectionResult;
  /** Validated dev_workflow payload — null if validation failed and failOpen=true. */
  payload: DevWorkflowPayload | null;
  /** Metadata object ready to spread into MemoryItem.metadata. */
  metadata: Record<string, unknown> | null;
  /** Raw LLM response — kept for debugging. */
  llm: LlmCallResponse;
  /** Validation error if parse failed. */
  validationError?: z.ZodError;
}

export interface EnrichmentResult {
  observations: EnrichedObservation[];
  skipped: Array<{ kind: DevWorkflowKind; reason: string; detection: DetectionResult }>;
  totalCostUsd: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DevWorkflowEnrichmentService {
  private readonly topicsList: readonly string[];
  private readonly minConfidence: number;
  private readonly maxKinds: number;
  private readonly failOpen: boolean;

  constructor(
    private readonly llmCaller: LlmCaller,
    options: EnrichmentOptions = {}
  ) {
    this.topicsList = options.topicsList ?? TOPICS;
    this.minConfidence = options.minConfidence ?? 0.5;
    this.maxKinds = options.maxKindsPerEvent ?? 4;
    this.failOpen = options.failOpen ?? false;
  }

  /**
   * Enrich a tool event into zero or more dev_workflow payloads.
   * Each detected kind above the confidence threshold dispatches its
   * prompt module via the injected LlmCaller.
   */
  async enrich(event: DetectorEvent): Promise<EnrichmentResult> {
    const startedAt = Date.now();
    const detections = detectKinds(event)
      .filter((d) => d.confidence >= this.minConfidence)
      .slice(0, this.maxKinds);

    const observations: EnrichedObservation[] = [];
    const skipped: EnrichmentResult['skipped'] = [];
    let totalCostUsd = 0;

    for (const detection of detections) {
      const module = getPromptModule(detection.kind);
      if (!module) {
        skipped.push({
          kind: detection.kind,
          reason: 'no prompt module registered for this kind',
          detection
        });
        continue;
      }

      const promptCtx = this.buildPromptContext(event);
      const callRequest: LlmCallRequest = {
        systemPrompt: module.systemPrompt,
        userPrompt: module.buildUserPrompt(promptCtx),
        model: module.model,
        responseJsonSchema: module.responseJsonSchema
      };

      let response: LlmCallResponse;
      try {
        response = await this.llmCaller(callRequest);
      } catch (err) {
        skipped.push({
          kind: detection.kind,
          reason: `llm_call_failed: ${(err as Error).message ?? 'unknown'}`,
          detection
        });
        continue;
      }

      if (response.usage?.estimatedUsd) {
        totalCostUsd += response.usage.estimatedUsd;
      }

      const validated = this.validate(detection.kind, response.parsed, module);
      if (!validated.ok) {
        if (this.failOpen) {
          observations.push({
            kind: detection.kind,
            detection,
            payload: null,
            metadata: null,
            llm: response,
            validationError: validated.error
          });
        } else {
          skipped.push({
            kind: detection.kind,
            reason: `validation_failed: ${validated.error.issues[0]?.message ?? 'invalid'}`,
            detection
          });
        }
        continue;
      }

      observations.push({
        kind: detection.kind,
        detection,
        payload: validated.payload,
        metadata: withDevWorkflowPayload(null, validated.payload),
        llm: response
      });
    }

    return {
      observations,
      skipped,
      totalCostUsd,
      durationMs: Date.now() - startedAt
    };
  }

  /**
   * Convenience: enrich and return only the validated metadata objects
   * ready to attach to MemoryItem.metadata. Discards failures.
   */
  async enrichToMetadata(event: DetectorEvent): Promise<Record<string, unknown>[]> {
    const result = await this.enrich(event);
    return result.observations
      .filter((o) => o.metadata !== null)
      .map((o) => o.metadata as Record<string, unknown>);
  }

  /**
   * Static budget probe — returns the model tier that WOULD be used
   * for each detected kind, without making LLM calls. Useful for cost
   * estimation in dry-run mode.
   */
  estimateModelMix(event: DetectorEvent): Array<{ kind: DevWorkflowKind; model: ModelTier; confidence: number }> {
    return detectKinds(event)
      .filter((d) => d.confidence >= this.minConfidence)
      .slice(0, this.maxKinds)
      .map((d) => ({
        kind: d.kind,
        model: modelForKind(d.kind),
        confidence: d.confidence
      }));
  }

  // -----------------------------------------------------------------------

  private buildPromptContext(event: DetectorEvent): PromptContext {
    return {
      narrative: event.narrative,
      topicsList: this.topicsList,
      filesModified: event.filesModified,
      filesRead: event.filesRead,
      userMessage: event.userMessage,
      recentAgentActions: event.recentAgentActions,
      gitContext: event.gitContext,
      additionalContext: event.agentText
    };
  }

  private validate(
    kind: DevWorkflowKind,
    raw: unknown,
    module: PromptModule
  ): { ok: true; payload: DevWorkflowPayload } | { ok: false; error: z.ZodError } {
    // The per-kind responseZod schema omits the `kind` literal.
    // Reattach the literal before running the discriminated union check.
    const candidate = { ...(raw as Record<string, unknown>), kind };
    const result = DevWorkflowPayloadSchema.safeParse(candidate);
    if (result.success) return { ok: true, payload: result.data };

    // Fall back to per-kind parser for better error messages on the
    // structural sub-fields (e.g. evidence union).
    const kindOnly = module.responseZod.safeParse(raw);
    if (!kindOnly.success) {
      return { ok: false, error: kindOnly.error };
    }
    return { ok: false, error: result.error };
  }
}
