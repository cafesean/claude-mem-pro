// SPDX-License-Identifier: Apache-2.0

/**
 * Subscription LlmCaller — invokes the `claude` Code CLI in print mode
 * (`-p`) so the prompt runs under the user's Claude subscription
 * (OAuth) without requiring an ANTHROPIC_API_KEY.
 *
 * Trade-off: claude CLI loads the full Claude Code context per call
 * (~76k cache-creation tokens, ~$0.10-0.15 per invocation as of late
 * 2025). Acceptable for one-shot CLI tests; not ideal for high-volume
 * backfill. For volume work, prefer the API-key path.
 *
 * Strategy:
 *   - Wrap the user prompt to enforce strict JSON output
 *   - Run `claude -p --output-format json --max-turns 1 --model <m>`
 *   - Parse the outer envelope, extract `result` text, parse as JSON
 *   - Return as LlmCallResponse.parsed
 */

import { spawn } from 'node:child_process';
import type {
  LlmCallRequest,
  LlmCallResponse,
  ModelTier
} from '../../server/generation/dev-workflow-prompts/enrichment-service.js';

const MODEL_ALIAS: Record<ModelTier, string> = {
  haiku: 'haiku',
  sonnet: 'sonnet'
};

export interface SubscriptionLlmCallerOptions {
  /** Override the claude executable path. Defaults to "claude" on PATH. */
  claudePath?: string;
  /** Override max-turns. Default 1 (one-shot, no tool calls). */
  maxTurns?: number;
  /** Capture stderr for debugging. Default false. */
  captureStderr?: boolean;
}

interface ClaudeEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; costUSD?: number }>;
}

export function buildSubscriptionLlmCaller(options: SubscriptionLlmCallerOptions = {}) {
  const claudePath = options.claudePath ?? 'claude';
  const maxTurns = options.maxTurns ?? 1;
  const captureStderr = options.captureStderr ?? false;

  return async function call(request: LlmCallRequest): Promise<LlmCallResponse> {
    const wrappedSystem = `${request.systemPrompt}\n\nIMPORTANT: Respond with ONLY a valid JSON object that matches the required schema. No markdown fences. No commentary. No explanation. JSON only.`;

    const wrappedUser = `${request.userPrompt}\n\nResponse schema:\n${JSON.stringify(request.responseJsonSchema, null, 2)}\n\nReturn the JSON object now.`;

    const fullPrompt = `${wrappedSystem}\n\n---\n\n${wrappedUser}`;

    const args = [
      '-p',
      fullPrompt,
      '--output-format',
      'json',
      '--max-turns',
      String(maxTurns),
      '--model',
      MODEL_ALIAS[request.model]
    ];

    const child = spawn(claudePath, args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', captureStderr ? 'pipe' : 'ignore']
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer) => stdoutChunks.push(c));
    if (captureStderr) {
      child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));
    }

    const exitCode: number = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    });

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');

    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      throw new Error(
        `claude_subscription_call_failed exit=${exitCode}: ${stderr.slice(0, 400) || stdout.slice(0, 400)}`
      );
    }

    let envelope: ClaudeEnvelope;
    try {
      envelope = JSON.parse(stdout) as ClaudeEnvelope;
    } catch (err) {
      throw new Error(
        `claude_envelope_parse_failed: ${(err as Error).message}; raw=${stdout.slice(0, 200)}`
      );
    }

    if (envelope.is_error) {
      throw new Error(`claude_envelope_error: ${envelope.subtype ?? 'unknown'}`);
    }

    const resultText = envelope.result ?? '';
    const parsed = tryParseJsonFromText(resultText);

    const modelEntry = envelope.modelUsage ? Object.values(envelope.modelUsage)[0] : undefined;
    const inputTokens = envelope.usage?.input_tokens ?? modelEntry?.inputTokens;
    const outputTokens = envelope.usage?.output_tokens ?? modelEntry?.outputTokens;
    const estimatedUsd = envelope.total_cost_usd ?? modelEntry?.costUSD;

    return {
      parsed,
      rawText: resultText,
      modelId: Object.keys(envelope.modelUsage ?? {})[0] ?? MODEL_ALIAS[request.model],
      usage: { inputTokens, outputTokens, estimatedUsd }
    };
  };
}

/**
 * Try to extract a JSON object from raw model output. Handles a couple
 * of common cases: bare JSON, JSON inside ```json fences, JSON with
 * leading commentary. Returns null if no valid JSON found.
 */
export function tryParseJsonFromText(text: string): unknown | null {
  if (!text) return null;

  // Bare object: starts with '{', ends with '}'
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }

  // Fenced JSON block
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // fall through
    }
  }

  // First {...} substring
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // fall through
    }
  }

  return null;
}
