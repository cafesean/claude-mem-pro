// SPDX-License-Identifier: Apache-2.0

/**
 * Kind detector — Phase 1.5.
 *
 * Maps a tool-event + conversation signal to one or more
 * DevWorkflowKind values. Pure heuristics, no LLM call. The output
 * tells the enrichment service which prompt modules to dispatch.
 *
 * Multi-kind output is intentional: a single agent event can carry
 * BOTH a `change` and a `lesson` for example (when a fix lands and
 * the user calls out a pattern in the same turn).
 */

import type { DevWorkflowKind } from '../../../core/schemas/dev-workflow-kind.js';

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface DetectorEvent {
  /** Free-form narrative summarising what the agent did this turn. */
  narrative: string;
  /** The triggering tool name when known (Edit, Write, Bash, ...). */
  toolName?: string;
  /** Files modified during the event. */
  filesModified?: readonly string[];
  /** Files read during the event. */
  filesRead?: readonly string[];
  /** The latest user message that prompted this work. */
  userMessage?: string;
  /** Concatenated agent reasoning / output text for keyword analysis. */
  agentText?: string;
  /** Recent agent tool actions, oldest first. */
  recentAgentActions?: readonly string[];
  /** Git context if available. */
  gitContext?: {
    branch?: string;
    commits?: readonly string[];
  };
}

export interface DetectionResult {
  kind: DevWorkflowKind;
  /** 0..1 confidence; higher = more certain. */
  confidence: number;
  /** Short reason — for debugging + telemetry, not stored long-term. */
  signal: string;
}

// ---------------------------------------------------------------------------
// Pattern banks
// ---------------------------------------------------------------------------

const SDK_FILE_PATTERNS = [
  /(^|\/)@jetdevs\//,
  /(^|\/)core-sdk\//,
  /(^|\/)cadra-sdk\//,
  /\/sdk\//
];

const ARCH_ISSUE_KEYWORDS = [
  'cross-cutting',
  'inconsistency',
  'inconsistent',
  'bypass',
  'leaks',
  'leakage',
  'architectural concern',
  'pattern broken',
  'pattern violation',
  'design smell',
  'wrong pattern',
  'org isolation',
  'rls bypass'
];

const LESSON_KEYWORDS = [
  'we learned',
  'lesson',
  'lessons learned',
  "we've learned",
  'turns out',
  'rule of thumb',
  'always',
  'never',
  'confirmed that',
  'verified that',
  'pattern works',
  'pattern confirmed'
];

const PROBLEM_KEYWORDS = [
  'root cause',
  'root-cause',
  'investigation',
  'reproduced',
  'symptom',
  'silent failure',
  'debugging',
  'why this was hard',
  'turns out',
  'not obvious'
];

const DECISION_KEYWORDS = [
  'instead of',
  'rather than',
  'chose',
  'chosen',
  'option a',
  'option b',
  'trade-off',
  'tradeoff',
  'we picked',
  'we are picking',
  'considered',
  'alternatives'
];

const REJECTION_PATTERNS = [
  /\bno\b/i,
  /\bstop\b/i,
  /\bwrong\b/i,
  /\bwonky\b/i,
  /\bbad\b/i,
  /\bbroken\b/i,
  /\bdo ?n[' ]?t\b/i
];

const PAST_REFERENCE_PATTERNS = [
  /\bwe said\b/i,
  /\bi told you\b/i,
  /\balready\b/i,
  /\blast time\b/i,
  /\bearlier\b/i,
  /\byou were supposed to\b/i
];

const DIRECT_CORRECTION_PATTERNS = [
  /\bthat'?s? not\b/i,
  /\bnot what\b/i,
  /\bshould be\b/i,
  /\binstead of\b/i
];

const POSITIVE_PATTERNS = [
  /\bthanks?\b/i,
  /\bgood\b/i,
  /\bnice\b/i,
  /\bperfect\b/i,
  /\bkeep going\b/i,
  /\bcontinue\b/i
];

const FEATURE_KEYWORDS = ['feat(', 'feat:', 'new feature', 'shipped', 'implemented '];

const DISCOVERY_KEYWORDS = ['found that', 'discovered', 'turns out', 'aha', 'realized'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lower(s: string | undefined): string {
  return (s ?? '').toLowerCase();
}

function anyMatch(text: string, keywords: readonly string[]): string | null {
  for (const k of keywords) {
    if (text.includes(k)) return k;
  }
  return null;
}

function anyRegex(text: string, patterns: readonly RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function looksLikeSdkChange(files: readonly string[] | undefined): boolean {
  if (!files?.length) return false;
  for (const f of files) {
    for (const p of SDK_FILE_PATTERNS) {
      if (p.test(f)) return true;
    }
  }
  return false;
}

function isToolWritingCode(name: string | undefined): boolean {
  if (!name) return false;
  return ['Edit', 'Write', 'NotebookEdit'].includes(name);
}

function multiFileFeature(event: DetectorEvent): boolean {
  const n = event.filesModified?.length ?? 0;
  return n >= 3 || anyMatch(lower(event.narrative), FEATURE_KEYWORDS) !== null;
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export function detectKinds(event: DetectorEvent): DetectionResult[] {
  const out: DetectionResult[] = [];
  const narrative = lower(event.narrative);
  const agentText = lower(event.agentText);
  const userText = (event.userMessage ?? '').trim();
  const userLower = userText.toLowerCase();
  const combined = `${narrative}\n${agentText}`;

  // ---- User correction (highest priority — user just spoke up) ----
  if (userText.length > 0) {
    const positive = anyRegex(userLower, POSITIVE_PATTERNS);
    const rejection = anyRegex(userLower, REJECTION_PATTERNS);
    const past = anyRegex(userLower, PAST_REFERENCE_PATTERNS);
    const direct = anyRegex(userLower, DIRECT_CORRECTION_PATTERNS);

    if (!positive && (rejection || past || direct)) {
      const signal = past ? 'past-reference' : direct ? 'direct' : 'rejection';
      out.push({
        kind: 'user_correction',
        confidence: past || direct ? 0.85 : 0.7,
        signal: `user_message matched ${signal} pattern`
      });
    }
  }

  // ---- Architecture issue ----
  const archHit = anyMatch(combined, ARCH_ISSUE_KEYWORDS);
  if (archHit) {
    out.push({
      kind: 'architecture_issue',
      confidence: 0.6,
      signal: `combined text matched "${archHit}"`
    });
  }

  // ---- Lesson ----
  const lessonHit = anyMatch(combined, LESSON_KEYWORDS);
  if (lessonHit) {
    out.push({
      kind: 'lesson',
      confidence: 0.55,
      signal: `combined text matched "${lessonHit}"`
    });
  }

  // ---- Problem analysis ----
  const problemHit = anyMatch(combined, PROBLEM_KEYWORDS);
  if (problemHit) {
    out.push({
      kind: 'problem_analysis',
      confidence: 0.6,
      signal: `combined text matched "${problemHit}"`
    });
  }

  // ---- Decision ----
  const decisionHit = anyMatch(combined, DECISION_KEYWORDS);
  if (decisionHit) {
    out.push({
      kind: 'decision',
      confidence: 0.5,
      signal: `combined text matched "${decisionHit}"`
    });
  }

  // ---- SDK note ----
  if (looksLikeSdkChange(event.filesModified) || looksLikeSdkChange(event.filesRead)) {
    out.push({
      kind: 'sdk_note',
      confidence: 0.7,
      signal: 'modified or read an SDK file path'
    });
  }

  // ---- Feature / change baseline ----
  if (isToolWritingCode(event.toolName) || (event.filesModified?.length ?? 0) > 0) {
    if (multiFileFeature(event)) {
      out.push({
        kind: 'feature',
        confidence: 0.5,
        signal: 'multi-file or feature-keyword'
      });
    } else {
      out.push({
        kind: 'change',
        confidence: 0.4,
        signal: 'single-file edit baseline'
      });
    }
  }

  // ---- Discovery ----
  const discoveryHit = anyMatch(combined, DISCOVERY_KEYWORDS);
  if (discoveryHit) {
    out.push({
      kind: 'discovery',
      confidence: 0.5,
      signal: `combined text matched "${discoveryHit}"`
    });
  }

  // De-dupe — if multiple signals fire for the same kind, keep the highest-confidence
  return dedupe(out);
}

function dedupe(results: DetectionResult[]): DetectionResult[] {
  const best = new Map<DevWorkflowKind, DetectionResult>();
  for (const r of results) {
    const existing = best.get(r.kind);
    if (!existing || r.confidence > existing.confidence) {
      best.set(r.kind, r);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.confidence - a.confidence);
}

// ---------------------------------------------------------------------------
// Convenience filters
// ---------------------------------------------------------------------------

export function topKind(event: DetectorEvent): DetectionResult | null {
  const all = detectKinds(event);
  return all[0] ?? null;
}

export function kindsAbove(event: DetectorEvent, threshold: number): DetectionResult[] {
  return detectKinds(event).filter((r) => r.confidence >= threshold);
}
