// SPDX-License-Identifier: Apache-2.0

/**
 * Session-level inference — multi-pass synthesis that reads a session's
 * full observation cluster and infers lessons / decisions / architecture
 * issues. Single-observation detectors miss these because they fire on
 * narrative keywords; cross-observation patterns require LLM reasoning.
 *
 * Output: a list of *new* dev_workflow payloads that callers can persist
 * as fresh observation rows (synthetic, marked source=session-inference).
 */

import { z } from 'zod';
import {
  ArchitectureIssuePayloadSchema,
  DecisionPayloadSchema,
  LessonPayloadSchema,
  type ArchitectureIssuePayload,
  type DecisionPayload,
  type DevWorkflowKind,
  type LessonPayload
} from '../../core/schemas/dev-workflow-kind.js';
import { TOPICS } from '../../core/schemas/topics.js';
import type {
  LlmCallRequest,
  LlmCallResponse,
  LlmCaller,
  ModelTier
} from '../../server/generation/dev-workflow-prompts/enrichment-service.js';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface InferenceObservation {
  id: number | string;
  kind: string;
  title?: string | null;
  narrative?: string | null;
  facts?: readonly string[];
  files_modified?: readonly string[];
  promoted_kind?: string | null;
}

export interface InferenceInputs {
  sessionId: string;
  projectName?: string;
  observations: readonly InferenceObservation[];
  /** Optional excerpt from git log for the session window. */
  gitContext?: string;
  /** Spec paths referenced via Read tool calls during the session. */
  specPaths?: readonly string[];
}

export interface InferredItem {
  kind: 'lesson' | 'decision' | 'architecture_issue';
  payload: LessonPayload | DecisionPayload | ArchitectureIssuePayload;
  /** Observation IDs from the source cluster this item is derived from. */
  evidence_observation_ids: Array<number | string>;
}

export interface InferenceResult {
  items: InferredItem[];
  /**
   * Raw items that failed Zod validation — useful when debugging schema
   * mismatch between sonnet's natural output and our strict types.
   */
  rejectedItems: Array<{ kind?: string; raw_payload: unknown; reason: string }>;
  llm: LlmCallResponse;
  durationMs: number;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are claude-mem's session-level inference engine.

You are given a CLUSTER of observations from a single development session. Your task is to INFER lessons, decisions, and architecture issues that emerge from PATTERNS across the cluster — things the single-observation detector cannot see because they are not stated in any one observation but emerge from the trajectory.

Output a JSON object: { "items": [...] }. Each item MUST use these EXACT field names — no other shapes will be accepted.

LESSON payload — emit when a confirmed pattern, rule, or insight applies to FUTURE work:
{
  "kind": "lesson",
  "payload": {
    "topics": ["topic1", ...],          // ≥1, from closed vocabulary
    "applies_to": ["app1", "app2"],     // app or SDK names, can be []
    "confidence": "confirmed",          // confirmed | hypothesis
    "evidence": "commit abc1234",       // commit hash, file:line, or short note
    "lesson": "Specific actionable rule, not generic advice"
  },
  "evidence_observation_ids": [123, 456]
}

DECISION payload — emit when a deliberate architectural / technical choice was made between alternatives:
{
  "kind": "decision",
  "payload": {
    "topics": ["topic1", ...],
    "applies_to": ["app1"],
    "options_considered": [
      { "name": "Option A", "trade_offs": "one-line summary" },
      { "name": "Option B", "trade_offs": "one-line summary" }
      // ≥2 required
    ],
    "chosen": "Option B",                // must match one of the option names
    "why": "specific reason that tipped the decision"
  },
  "evidence_observation_ids": [123]
}

ARCHITECTURE_ISSUE payload — emit when a CROSS-CUTTING concern affects more than this single change (inconsistency, bypass, leak risk):
{
  "kind": "architecture_issue",
  "payload": {
    "status": "resolved",                // resolved | workaround-applied | known-limitation | unresolved | investigating
    "topics": ["topic1", ...],            // ≥1
    "applies_to": ["app1"],
    "issue": "what is broken / risky in technical terms",
    "impact": "what breaks, leaks, or is at risk",
    "correct_pattern": "what should be done instead"  // optional, omit if unknown
  },
  "evidence_observation_ids": [123]
}

CRITICAL RULES:
  - Use EXACTLY the field names shown above. No "title", no "body", no "option" (use "name"), no "trade_off" (use "trade_offs").
  - Topics must come from the closed vocabulary (provided in the user prompt).
  - evidence_observation_ids must reference IDs that appear in the input cluster.
  - DO NOT invent claims not supported by the observations.
  - Quality bar: 0-6 items per session. Each SPECIFIC and ACTIONABLE.`;

const RESPONSE_SCHEMA: object = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        required: ['kind', 'payload', 'evidence_observation_ids'],
        properties: {
          kind: { type: 'string', enum: ['lesson', 'decision', 'architecture_issue'] },
          payload: { type: 'object' },
          evidence_observation_ids: {
            type: 'array',
            items: { type: ['integer', 'string'] }
          }
        }
      }
    }
  }
};

function renderCluster(observations: readonly InferenceObservation[]): string {
  return observations
    .map((o, i) => {
      const title = o.title ?? '(no title)';
      const narrative = (o.narrative ?? '').slice(0, 300).replace(/\s+/g, ' ');
      const files = o.files_modified?.length ? ` files=[${o.files_modified.slice(0, 3).join(', ')}]` : '';
      const kind = o.promoted_kind ? `${o.kind}→${o.promoted_kind}` : o.kind;
      return `  ${i + 1}. obs=${o.id} kind=${kind}${files}\n     title: ${title}\n     narrative: ${narrative}`;
    })
    .join('\n');
}

function buildUserPrompt(
  inputs: InferenceInputs,
  topicsList: readonly string[]
): string {
  return [
    `TOPIC VOCABULARY (use ONLY these for any topics field):`,
    topicsList.join(', '),
    '',
    inputs.projectName ? `Project: ${inputs.projectName}` : '',
    `Session: ${inputs.sessionId}`,
    inputs.specPaths?.length ? `Spec docs referenced: ${inputs.specPaths.join(', ')}` : '',
    inputs.gitContext ? `Git context:\n${inputs.gitContext}` : '',
    '',
    `Observation cluster (${inputs.observations.length} entries):`,
    renderCluster(inputs.observations),
    '',
    'Emit 0-6 high-signal lessons / decisions / architecture_issues. Reference observation IDs as evidence. Return JSON.'
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface InferenceOptions {
  model?: ModelTier;
  topicsList?: readonly string[];
  observationCap?: number;
}

export class SessionInferenceEngine {
  private readonly model: ModelTier;
  private readonly topicsList: readonly string[];
  private readonly cap: number;

  constructor(
    private readonly llmCaller: LlmCaller,
    options: InferenceOptions = {}
  ) {
    this.model = options.model ?? 'sonnet';
    this.topicsList = options.topicsList ?? TOPICS;
    this.cap = options.observationCap ?? 100;
  }

  async infer(inputs: InferenceInputs): Promise<InferenceResult> {
    const startedAt = Date.now();
    const truncated: InferenceInputs = {
      ...inputs,
      observations: inputs.observations.slice(0, this.cap)
    };

    const request: LlmCallRequest = {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(truncated, this.topicsList),
      model: this.model,
      responseJsonSchema: RESPONSE_SCHEMA
    };

    const response = await this.llmCaller(request);
    const durationMs = Date.now() - startedAt;
    const notes: string[] = [];

    const raw = response.parsed as { items?: unknown[] } | null;
    if (!raw || !Array.isArray(raw.items)) {
      notes.push('llm returned no items array');
      return { items: [], rejectedItems: [], llm: response, durationMs, notes };
    }

    const items: InferredItem[] = [];
    const rejectedItems: InferenceResult['rejectedItems'] = [];
    const validIds = new Set(truncated.observations.map((o) => String(o.id)));

    for (const entry of raw.items) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const kind = e.kind as DevWorkflowKind | undefined;
      const payload = e.payload as Record<string, unknown> | undefined;
      const evidenceIds = Array.isArray(e.evidence_observation_ids)
        ? (e.evidence_observation_ids as unknown[]).filter((x) => typeof x === 'number' || typeof x === 'string')
        : [];

      if (!payload) {
        notes.push(`skipped: missing payload for kind=${kind}`);
        continue;
      }

      // Filter out invented IDs.
      const filteredEvidence = (evidenceIds as Array<number | string>).filter((id) =>
        validIds.has(String(id))
      );
      if (filteredEvidence.length === 0) {
        notes.push(`skipped kind=${kind}: no valid evidence observation IDs`);
        continue;
      }

      // Validate payload against the kind's schema.
      let parsed:
        | { ok: true; data: LessonPayload | DecisionPayload | ArchitectureIssuePayload }
        | { ok: false; error: z.ZodError };

      // Normalize common LLM field-name drift before validation.
      const normalised = normalisePayload(kind, payload);
      const candidate = { ...normalised, kind };
      switch (kind) {
        case 'lesson': {
          const result = LessonPayloadSchema.safeParse(candidate);
          parsed = result.success ? { ok: true, data: result.data } : { ok: false, error: result.error };
          break;
        }
        case 'decision': {
          const result = DecisionPayloadSchema.safeParse(candidate);
          parsed = result.success ? { ok: true, data: result.data } : { ok: false, error: result.error };
          break;
        }
        case 'architecture_issue': {
          const result = ArchitectureIssuePayloadSchema.safeParse(candidate);
          parsed = result.success ? { ok: true, data: result.data } : { ok: false, error: result.error };
          break;
        }
        default:
          notes.push(`skipped: unsupported kind=${kind ?? 'unknown'}`);
          continue;
      }

      if (!parsed.ok) {
        const reason = `validation failed kind=${kind}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
        notes.push(reason);
        rejectedItems.push({ kind, raw_payload: payload, reason });
        continue;
      }

      items.push({
        kind: kind as 'lesson' | 'decision' | 'architecture_issue',
        payload: parsed.data,
        evidence_observation_ids: filteredEvidence
      });
    }

    return { items, rejectedItems, llm: response, durationMs, notes };
  }
}

/**
 * Coerce common LLM field-name drift into the strict schema shape.
 * Sonnet naturally emits {title, body, option, trade_off} — accept those.
 */
function normalisePayload(
  kind: DevWorkflowKind | undefined,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };

  // Common: title is a natural LLM field — never required by our schemas.
  // Body often carries the substantive prose that maps to lesson/issue/why.

  if (kind === 'lesson') {
    if (!out.lesson && typeof out.body === 'string') out.lesson = out.body;
    if (!out.lesson && typeof out.title === 'string') out.lesson = out.title;
    if (!out.evidence) {
      out.evidence = typeof out.title === 'string'
        ? out.title
        : 'inferred from session observation cluster';
    }
    if (!Array.isArray(out.applies_to)) out.applies_to = [];
  }

  if (kind === 'decision') {
    if (Array.isArray(out.options_considered)) {
      out.options_considered = (out.options_considered as unknown[]).map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        const e = entry as Record<string, unknown>;
        const name = (e.name as string | undefined) ?? (e.option as string | undefined) ?? (e.title as string | undefined);
        const tradeOffs = (e.trade_offs as string | undefined) ?? (e.trade_off as string | undefined) ?? (e.tradeoff as string | undefined);
        return {
          ...e,
          name,
          trade_offs: tradeOffs
        };
      });
    }
    if (!out.chosen && typeof out.body === 'string') {
      // Try to find a (chosen) marker in options
      if (Array.isArray(out.options_considered)) {
        const chosenOpt = (out.options_considered as Array<Record<string, unknown>>).find((o) =>
          typeof o.name === 'string' && /\(chosen\)/i.test(o.name as string)
        );
        if (chosenOpt) out.chosen = chosenOpt.name;
      }
    }
    if (!out.why && typeof out.body === 'string') out.why = out.body;
    if (!Array.isArray(out.applies_to)) out.applies_to = [];
  }

  if (kind === 'architecture_issue') {
    if (!out.issue && typeof out.body === 'string') out.issue = out.body;
    if (!out.issue && typeof out.title === 'string') out.issue = out.title;
    if (!out.impact && typeof out.body === 'string') out.impact = out.body;
    if (!out.impact && typeof out.title === 'string') {
      out.impact = `affects the area described in: ${out.title}`;
    }
    if (!Array.isArray(out.applies_to)) out.applies_to = [];
  }

  return out;
}

export { SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserPrompt };
