// SPDX-License-Identifier: Apache-2.0

/**
 * Live worker-side dev_workflow enrichment — Phase 1.6 production wiring.
 *
 * Hooks into ResponseProcessor immediately after observations land in
 * SQLite. Runs the same enrichment pipeline that backfill + watch mode
 * use, so newly-captured observations carry metadata.dev_workflow at
 * capture time (or shortly after, via fire-and-forget mode).
 *
 * Gated behind env flags so the default behaviour is unchanged:
 *   CLAUDE_MEM_DW_LIVE_ENRICH       — enable post-insert enrichment
 *   CLAUDE_MEM_DW_LIVE_ENRICH_SYNC  — block until enrichment finishes
 *   CLAUDE_MEM_DW_MIN_CONFIDENCE    — detector threshold (default 0.6)
 *
 * Without either flag, this module is a no-op pass-through so existing
 * worker behaviour is identical to upstream claude-mem.
 */

import { logger } from '../../utils/logger.js';
import { TOPICS } from '../../core/schemas/topics.js';
import { DevWorkflowPayloadSchema } from '../../core/schemas/dev-workflow-kind.js';
import { detectKinds } from '../../server/generation/dev-workflow-prompts/kind-detector.js';
import { getPromptModule } from '../../server/generation/dev-workflow-prompts/index.js';
import type { SessionStore } from '../sqlite/SessionStore.js';

const LEGACY_KINDS = new Set(['change', 'feature', 'discovery']);

interface JustStoredObservation {
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  facts: string[];
  files_read: string[];
  files_modified: string[];
  agent_type?: string | null;
}

export interface EnricherOptions {
  /** Skip-LLM mode for tests: only runs detector, never calls Anthropic. */
  detectOnly?: boolean;
}

function readSettingsFlag(name: string): string | undefined {
  try {
    // Lazy load so test environments without a real settings.json keep working.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { SettingsDefaultsManager } = require('../../shared/SettingsDefaultsManager.js');
    return SettingsDefaultsManager.get?.(name);
  } catch {
    return undefined;
  }
}

function flagOn(name: string): boolean {
  const fromEnv = process.env[name];
  if (fromEnv !== undefined) return fromEnv === '1' || fromEnv === 'true';
  const fromSettings = readSettingsFlag(name);
  return fromSettings === '1' || fromSettings === 'true';
}

/**
 * Decide whether live enrichment is enabled.
 *
 * Reads `CLAUDE_MEM_DW_LIVE_ENRICH` from `process.env` first, then falls
 * back to settings.json via SettingsDefaultsManager so users can
 * configure it via either path.
 */
export function isLiveEnrichEnabled(): boolean {
  return flagOn('CLAUDE_MEM_DW_LIVE_ENRICH');
}

/**
 * Decide whether live enrichment runs synchronously (await) or
 * fire-and-forget (default).
 */
export function isSyncEnrichEnabled(): boolean {
  return flagOn('CLAUDE_MEM_DW_LIVE_ENRICH_SYNC');
}

function minConfidence(): number {
  const raw = process.env.CLAUDE_MEM_DW_MIN_CONFIDENCE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0.6;
}

/**
 * Lazy import of the subscription LlmCaller. The worker runs under bun;
 * the subscription caller spawns the `claude` CLI as a child process,
 * which uses OAuth without needing ANTHROPIC_API_KEY.
 */
async function buildWorkerLlmCaller() {
  if (process.env.ANTHROPIC_API_KEY) {
    const { buildAnthropicLlmCaller } = await import('../dev-workflow/anthropic-llm-caller.js');
    return buildAnthropicLlmCaller({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  const { buildSubscriptionLlmCaller } = await import('../dev-workflow/subscription-llm-caller.js');
  return buildSubscriptionLlmCaller();
}

/**
 * Public entry point: enrich a batch of observation IDs that were just
 * stored. Reads each row, runs the detector, dispatches the prompt
 * module via LLM if a non-legacy kind matched, and writes
 * metadata.dev_workflow back via SessionStore.
 *
 * Caller decides sync vs fire-and-forget; this function always awaits
 * its work. For fire-and-forget, the caller wraps the invocation in
 * `void setImmediate(() => enrichJustStoredObservations(...))`.
 */
export async function enrichJustStoredObservations(
  store: SessionStore,
  observationIds: readonly number[],
  options: EnricherOptions = {}
): Promise<{ scanned: number; attempted: number; enriched: number; failed: number; cost_usd: number }> {
  if (!isLiveEnrichEnabled()) {
    return { scanned: 0, attempted: 0, enriched: 0, failed: 0, cost_usd: 0 };
  }

  const threshold = minConfidence();
  const llmCaller = options.detectOnly ? null : await buildWorkerLlmCaller();

  let attempted = 0;
  let enriched = 0;
  let failed = 0;
  let costUsd = 0;

  for (const id of observationIds) {
    try {
      // The SessionStore is the canonical SQLite owner inside the worker.
      const row = (store as unknown as { fetchObservationForEnrichment?: (id: number) => JustStoredObservation | null }).fetchObservationForEnrichment?.(id) ?? null;
      if (!row) continue;

      const detections = detectKinds({
        narrative: row.narrative ?? row.title ?? '',
        toolName: row.agent_type ?? undefined,
        filesModified: row.files_modified,
        filesRead: row.files_read,
        agentText: row.facts.join('\n')
      }).filter((d) => d.confidence >= threshold);

      const promotable = detections.find((d) => !LEGACY_KINDS.has(d.kind));
      if (!promotable) continue;

      const promptModule = getPromptModule(promotable.kind);
      if (!promptModule) continue;

      if (options.detectOnly || !llmCaller) {
        // Detect-only mode: write the detected kind as a stub payload so
        // queries can find it. Useful for tests that don't have an API key.
        const stub = {
          kind: promotable.kind,
          topics: [] as string[],
          applies_to: [] as string[],
          narrative: row.narrative ?? row.title ?? ''
        };
        (store as unknown as { updateObservationDevWorkflowMetadata?: (id: number, payload: unknown) => void }).updateObservationDevWorkflowMetadata?.(id, stub);
        enriched++;
        continue;
      }

      attempted++;
      const userPrompt = promptModule.buildUserPrompt({
        narrative: row.narrative ?? row.title ?? '',
        topicsList: TOPICS,
        filesModified: row.files_modified,
        filesRead: row.files_read,
        additionalContext: row.facts.join('\n')
      });

      const response = await llmCaller({
        systemPrompt: promptModule.systemPrompt,
        userPrompt,
        model: promptModule.model,
        responseJsonSchema: promptModule.responseJsonSchema
      });

      costUsd += response.usage?.estimatedUsd ?? 0;

      const parsed = DevWorkflowPayloadSchema.safeParse({
        ...(response.parsed as Record<string, unknown>),
        kind: promotable.kind
      });
      if (!parsed.success) {
        failed++;
        logger.warn('DW', `enrichment validation failed for obs=${id} kind=${promotable.kind}: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
        continue;
      }

      (store as unknown as { updateObservationDevWorkflowMetadata?: (id: number, payload: unknown) => void }).updateObservationDevWorkflowMetadata?.(id, parsed.data);
      enriched++;
    } catch (err) {
      failed++;
      logger.warn('DW', `enrichment failed for obs=${id}: ${(err as Error).message?.slice(0, 200)}`);
    }
  }

  logger.info(
    'DW',
    `live-enrich complete: scanned=${observationIds.length} attempted=${attempted} enriched=${enriched} failed=${failed} cost=$${costUsd.toFixed(4)}`
  );

  return { scanned: observationIds.length, attempted, enriched, failed, cost_usd: costUsd };
}
