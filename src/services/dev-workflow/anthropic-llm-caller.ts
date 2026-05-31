// SPDX-License-Identifier: Apache-2.0

/**
 * Anthropic LlmCaller implementation — bridges the Phase 1+ services
 * to the live Anthropic API. Uses tool_use for structured-output
 * enforcement: the model is invoked with a single tool whose
 * input_schema matches each prompt module's responseJsonSchema, so
 * we get parsed JSON back without prose contamination.
 *
 * Lives outside the BullMQ worker — invocable from any process, e.g.
 * the dev-workflow CLI.
 */

import type {
  LlmCallRequest,
  LlmCallResponse,
  ModelTier
} from '../../server/generation/dev-workflow-prompts/enrichment-service.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Pricing per million tokens, as of late 2025. Used only for cost
// estimation in CLI output; not authoritative.
const PRICING_PER_MTOKEN_USD: Record<ModelTier, { input: number; output: number }> = {
  haiku: { input: 0.8, output: 4 },
  sonnet: { input: 3, output: 15 }
};

const DEFAULT_MODEL_ID: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-7'
};

export interface AnthropicLlmCallerOptions {
  apiKey: string;
  haikuModelId?: string;
  sonnetModelId?: string;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

interface AnthropicMessagesResponse {
  content?: Array<
    | { type?: 'text'; text?: string }
    | { type?: 'tool_use'; input?: Record<string, unknown>; name?: string }
  >;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
  model?: string;
}

export function buildAnthropicLlmCaller(options: AnthropicLlmCallerOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxOutputTokens = options.maxOutputTokens ?? 4096;
  const modelIds: Record<ModelTier, string> = {
    haiku: options.haikuModelId ?? DEFAULT_MODEL_ID.haiku,
    sonnet: options.sonnetModelId ?? DEFAULT_MODEL_ID.sonnet
  };

  return async function call(request: LlmCallRequest): Promise<LlmCallResponse> {
    if (!options.apiKey) {
      throw new Error('ANTHROPIC_API_KEY missing');
    }

    const modelId = modelIds[request.model];

    // Wrap responseJsonSchema in a single tool so Anthropic enforces shape.
    const tool = {
      name: 'submit_observation',
      description:
        'Return the structured dev-workflow observation payload. Call this exactly once.',
      input_schema: request.responseJsonSchema as object
    };

    const body = {
      model: modelId,
      max_tokens: maxOutputTokens,
      temperature: 0,
      system: request.systemPrompt,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'submit_observation' },
      messages: [{ role: 'user', content: request.userPrompt }]
    };

    const res = await fetchImpl(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let detail = '';
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
      throw new Error(`anthropic_error_${res.status}: ${detail.slice(0, 200)}`);
    }

    const payload = (await res.json()) as AnthropicMessagesResponse;
    if (payload.error) {
      throw new Error(
        `anthropic_error: ${payload.error.type ?? 'unknown'} :: ${payload.error.message ?? ''}`
      );
    }

    const toolBlock = payload.content?.find((b) => b?.type === 'tool_use') as
      | { type: 'tool_use'; input?: Record<string, unknown> }
      | undefined;
    const textBlock = payload.content?.find((b) => b?.type === 'text') as
      | { type: 'text'; text?: string }
      | undefined;

    const parsed = toolBlock?.input ?? null;
    const rawText = textBlock?.text;

    const inputTokens = payload.usage?.input_tokens;
    const outputTokens = payload.usage?.output_tokens;
    const pricing = PRICING_PER_MTOKEN_USD[request.model];
    const estimatedUsd =
      inputTokens !== undefined && outputTokens !== undefined
        ? (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
        : undefined;

    return {
      parsed,
      rawText,
      modelId: payload.model ?? modelId,
      usage: { inputTokens, outputTokens, estimatedUsd }
    };
  };
}
