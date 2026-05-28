// SPDX-License-Identifier: Apache-2.0

/**
 * `claude-mem dev-workflow <subcommand>` — exercises every Phase 1-6
 * service end-to-end from the command line. Lives PARALLEL to the
 * existing claude-mem observation pipeline; does not touch the
 * worker, the hooks, or the production database.
 *
 * Subcommands:
 *   detect-correction "<message>"     — sync detector, no LLM call
 *   detect-kinds "<narrative>"        — sync kind detector preview
 *   enrich --kind=K --narrative="..." — full enrichment via Anthropic
 *   synthesize-session --inputs=FILE  — read JSON, run sonnet synthesis
 *   render-session --record=FILE      — render markdown from SessionRecord JSON
 *   extract-learning --topic=T --sources=FILE — per-topic synthesis
 *   golden-doc --primary=FILE         — generate golden doc draft
 *
 * Every subcommand prints JSON or markdown to stdout for piping.
 */

import pc from 'picocolors';
import { promises as fs } from 'node:fs';
import { TOPICS } from '../../core/schemas/topics.js';
import {
  DEV_WORKFLOW_KINDS,
  type DevWorkflowKind
} from '../../core/schemas/dev-workflow-kind.js';
import { detectCorrection } from '../../services/dev-workflow/correction-detector.js';
import { detectKinds } from '../../server/generation/dev-workflow-prompts/kind-detector.js';
import { DevWorkflowEnrichmentService } from '../../server/generation/dev-workflow-prompts/enrichment-service.js';
import { SessionSynthesizer } from '../../services/dev-workflow/session-synthesizer.js';
import { renderSessionMarkdown } from '../../services/dev-workflow/session-markdown-renderer.js';
import { LearningExtractor } from '../../services/dev-workflow/learning-extractor.js';
import { GoldenDocGenerator } from '../../services/dev-workflow/golden-doc-generator.js';
import { buildAnthropicLlmCaller } from '../../services/dev-workflow/anthropic-llm-caller.js';
import { buildSubscriptionLlmCaller } from '../../services/dev-workflow/subscription-llm-caller.js';

type ArgMap = Map<string, string>;

function parseArgs(args: readonly string[]): { positional: string[]; flags: ArgMap } {
  const positional: string[] = [];
  const flags: ArgMap = new Map();
  for (const a of args) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
      } else {
        flags.set(a.slice(2), 'true');
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error(pc.red('ANTHROPIC_API_KEY env var is required for this command.'));
    process.exit(1);
  }
  return key;
}

/**
 * Auto-detect best LlmCaller based on environment.
 *   1. CLAUDE_MEM_DW_LLM=subscription|api-key (explicit override)
 *   2. ANTHROPIC_API_KEY present → api-key (fast, cheap, structured tool_use)
 *   3. otherwise → subscription (claude CLI, $0.10/call but no key required)
 */
function pickLlmCaller(): ReturnType<typeof buildAnthropicLlmCaller> | ReturnType<typeof buildSubscriptionLlmCaller> {
  const override = process.env.CLAUDE_MEM_DW_LLM;
  if (override === 'api-key') {
    return buildAnthropicLlmCaller({ apiKey: requireApiKey() });
  }
  if (override === 'subscription') {
    console.error(pc.dim('using subscription auth (claude CLI)'));
    return buildSubscriptionLlmCaller();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return buildAnthropicLlmCaller({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  console.error(pc.dim('no ANTHROPIC_API_KEY found — using subscription auth via claude CLI'));
  return buildSubscriptionLlmCaller();
}

async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw) as T;
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function printHelp(): void {
  console.log(`
${pc.bold('claude-mem dev-workflow')} — parallel CLI surface for the dev-workflow schema absorb pipeline

${pc.bold('No-LLM subcommands')} (instant, free):
  ${pc.cyan('detect-correction "<message>"')}     Run the UserPromptSubmit correction detector
  ${pc.cyan('detect-kinds "<narrative>"')}        Run the kind detector against a narrative
  ${pc.cyan('topics')}                            List the 61-topic taxonomy
  ${pc.cyan('kinds')}                             List the 9 observation kinds + model routing

${pc.bold('LLM-backed subcommands')} (require ANTHROPIC_API_KEY):
  ${pc.cyan('enrich --kind=K --narrative=...')}   Run enrichment service for one kind
  ${pc.cyan('synthesize-session --inputs=FILE')}  Run sonnet session synthesiser; expects JSON file
  ${pc.cyan('extract-learning --topic=T --sources=FILE')}  Per-topic learning record
  ${pc.cyan('golden-doc --primary=FILE')}         Draft a golden doc from a LearningRecord JSON

${pc.bold('Pure render')} (no LLM):
  ${pc.cyan('render-session --record=FILE')}      Render markdown from a SessionRecord JSON

${pc.bold('Examples')}:
  ANTHROPIC_API_KEY=sk-... claude-mem dev-workflow enrich --kind=lesson \\
    --narrative="we learned that scope:user is required for cached org-scoped routes" \\
    --applies-to=cadra-web

  cat session-record.json | claude-mem dev-workflow render-session --record=-
`);
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function cmdDetectCorrection(args: readonly string[]): Promise<void> {
  const message = args.join(' ').trim();
  if (!message) {
    console.error(pc.red('usage: detect-correction "<message>"'));
    process.exit(1);
  }
  const result = detectCorrection(message);
  printJson({ message, result });
}

async function cmdDetectKinds(args: readonly string[]): Promise<void> {
  const narrative = args.join(' ').trim();
  if (!narrative) {
    console.error(pc.red('usage: detect-kinds "<narrative>"'));
    process.exit(1);
  }
  const results = detectKinds({ narrative });
  printJson({ narrative, kinds: results });
}

async function cmdTopics(): Promise<void> {
  printJson({ count: TOPICS.length, topics: TOPICS });
}

async function cmdKinds(): Promise<void> {
  const { KIND_MODEL } = await import('../../server/generation/dev-workflow-prompts/types.js');
  const rows = DEV_WORKFLOW_KINDS.map((k) => ({ kind: k, model: KIND_MODEL[k] }));
  printJson(rows);
}

async function cmdEnrich(flags: ArgMap): Promise<void> {
  const kind = flags.get('kind') as DevWorkflowKind | undefined;
  const narrative = flags.get('narrative');
  if (!kind || !narrative) {
    console.error(pc.red('usage: enrich --kind=K --narrative="..." [--applies-to=A,B]'));
    process.exit(1);
  }
  if (!DEV_WORKFLOW_KINDS.includes(kind as DevWorkflowKind)) {
    console.error(pc.red(`unknown kind "${kind}". One of: ${DEV_WORKFLOW_KINDS.join(', ')}`));
    process.exit(1);
  }

  const llmCaller = pickLlmCaller();
  const enrichment = new DevWorkflowEnrichmentService(llmCaller, { minConfidence: 0 });
  const result = await enrichment.enrich({
    narrative,
    userMessage: flags.get('user-message'),
    filesModified: (flags.get('files-modified') ?? '').split(',').filter(Boolean),
    agentText: flags.get('agent-text')
  });
  printJson(result);
}

async function cmdRenderSession(flags: ArgMap): Promise<void> {
  const recordPath = flags.get('record');
  if (!recordPath) {
    console.error(pc.red('usage: render-session --record=FILE (or - for stdin)'));
    process.exit(1);
  }

  let recordJson: string;
  if (recordPath === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    recordJson = Buffer.concat(chunks).toString('utf8');
  } else {
    recordJson = await fs.readFile(recordPath, 'utf8');
  }
  const record = JSON.parse(recordJson);
  const md = await renderSessionMarkdown(record);
  process.stdout.write(md);
}

async function cmdSynthesizeSession(flags: ArgMap): Promise<void> {
  const inputsPath = flags.get('inputs');
  if (!inputsPath) {
    console.error(pc.red('usage: synthesize-session --inputs=FILE.json'));
    process.exit(1);
  }
  const inputs = await readJsonFile(inputsPath);
  const recordMeta = {
    id: (flags.get('id') ?? `rec-${Date.now()}`) as string,
    title: (flags.get('title') ?? 'Untitled session') as string,
    date: (flags.get('date') ?? new Date().toISOString().slice(0, 10)) as string
  };

  const llmCaller = pickLlmCaller();
  const synth = new SessionSynthesizer(llmCaller);
  const result = await synth.synthesise(inputs as never, recordMeta);
  printJson(result);
}

async function cmdExtractLearning(flags: ArgMap): Promise<void> {
  const topic = flags.get('topic');
  const sourcesPath = flags.get('sources');
  if (!topic || !sourcesPath) {
    console.error(pc.red('usage: extract-learning --topic=T --sources=FILE.json'));
    process.exit(1);
  }
  const sources = await readJsonFile(sourcesPath);
  const llmCaller = pickLlmCaller();
  const extractor = new LearningExtractor(llmCaller, {
    minLessons: Number(flags.get('min-lessons') ?? 3)
  });
  const result = await extractor.extract(topic as never, sources as never, {
    id: (flags.get('id') ?? `learn-${Date.now()}`) as string
  });
  printJson(result);
}

async function cmdGoldenDoc(flags: ArgMap): Promise<void> {
  const primaryPath = flags.get('primary');
  if (!primaryPath) {
    console.error(pc.red('usage: golden-doc --primary=FILE.json [--related=FILE,FILE] [--out=PATH]'));
    process.exit(1);
  }
  const primary = await readJsonFile<Record<string, unknown>>(primaryPath);
  const relatedPaths = (flags.get('related') ?? '').split(',').filter(Boolean);
  const related = await Promise.all(relatedPaths.map((p) => readJsonFile<Record<string, unknown>>(p)));

  const outputPath = flags.get('out') ?? `_context/_arch/${primary.topic}.draft.md`;
  const llmCaller = pickLlmCaller();
  const generator = new GoldenDocGenerator(llmCaller);
  const result = await generator.generate({
    primary: primary as never,
    related: related as never,
    outputPath,
    sourceId: `gold-${Date.now()}`
  });

  if (flags.get('write') === 'true') {
    await fs.writeFile(outputPath, result.markdown, 'utf8');
    console.error(pc.green(`wrote ${outputPath}`));
  }
  printJson({ markdown: result.markdown, source: result.source });
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export async function runDevWorkflowCommand(args: readonly string[]): Promise<void> {
  const subcommand = (args[0] ?? '').toLowerCase();
  const rest = args.slice(1);
  const { positional, flags } = parseArgs(rest);

  switch (subcommand) {
    case '':
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    case 'topics':
      await cmdTopics();
      return;
    case 'kinds':
      await cmdKinds();
      return;
    case 'detect-correction':
      await cmdDetectCorrection(positional);
      return;
    case 'detect-kinds':
      await cmdDetectKinds(positional);
      return;
    case 'enrich':
      await cmdEnrich(flags);
      return;
    case 'render-session':
      await cmdRenderSession(flags);
      return;
    case 'synthesize-session':
      await cmdSynthesizeSession(flags);
      return;
    case 'extract-learning':
      await cmdExtractLearning(flags);
      return;
    case 'golden-doc':
      await cmdGoldenDoc(flags);
      return;
    default:
      console.error(pc.red(`unknown dev-workflow subcommand: ${subcommand}`));
      printHelp();
      process.exit(1);
  }
}
