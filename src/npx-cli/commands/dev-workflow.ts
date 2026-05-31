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
import {
  SqliteObservationAdapter,
  buildDetectorEvent,
  summariseObservationForContext,
  type ParsedObservation
} from '../../services/dev-workflow/sqlite-observation-adapter.js';
import { detectKinds } from '../../server/generation/dev-workflow-prompts/kind-detector.js';
import { getPromptModule } from '../../server/generation/dev-workflow-prompts/index.js';
import { SessionInferenceEngine, type InferenceObservation } from '../../services/dev-workflow/session-inference.js';
import {
  DevWorkflowPayloadSchema
} from '../../core/schemas/dev-workflow-kind.js';

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
    console.error(pc.red('usage: synthesize-session --inputs=FILE.json [--persist=true]'));
    process.exit(1);
  }
  const inputs = await readJsonFile(inputsPath);
  const recordMeta = {
    id: (flags.get('id') ?? `rec-${Date.now()}`) as string,
    title: (flags.get('title') ?? 'Untitled session') as string,
    date: (flags.get('date') ?? new Date().toISOString().slice(0, 10)) as string
  };

  const llmCaller = pickLlmCaller();
  const failOpen = flags.get('fail-open') === 'true';
  const synth = new SessionSynthesizer(llmCaller, { failOpen });
  const result = await synth.synthesise(inputs as never, recordMeta);

  // Phase 4 — persist into session_records when --persist=true.
  if (flags.get('persist') === 'true' && result.record) {
    const adapter = openAdapter(flags, { readonly: false });
    try {
      const rec = result.record;
      // Cast to the SessionStore shape via raw SQLite write.
      const Database = (await import('node:sqlite')).DatabaseSync as new (path: string) => {
        prepare(sql: string): { run(...p: unknown[]): unknown };
      };
      const db = new Database(adapter.dbPath);
      db.prepare(
        `INSERT INTO session_records (
          id, memory_session_id, title, date, projects, branch, status, type,
          topics, tags, last_updated, sdk_touched, apps_touched, commits,
          related_sessions, specs, content, observation_refs, generation_metadata,
          created_at, created_at_epoch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title=excluded.title, status=excluded.status, last_updated=excluded.last_updated,
          topics=excluded.topics, tags=excluded.tags, commits=excluded.commits,
          content=excluded.content, observation_refs=excluded.observation_refs,
          generation_metadata=excluded.generation_metadata`
      ).run(
        rec.id,
        rec.session_id,
        rec.title,
        rec.date,
        JSON.stringify(rec.projects),
        rec.branch ?? null,
        rec.status,
        rec.type,
        JSON.stringify(rec.topics),
        JSON.stringify(rec.tags),
        rec.last_updated,
        JSON.stringify(rec.sdk_touched),
        JSON.stringify(rec.apps_touched),
        JSON.stringify(rec.commits),
        JSON.stringify(rec.related_sessions),
        JSON.stringify(rec.specs),
        JSON.stringify(rec.content),
        JSON.stringify(rec.observation_refs),
        rec.generation_metadata ? JSON.stringify(rec.generation_metadata) : null,
        new Date().toISOString(),
        Date.now()
      );
    } finally {
      adapter.close();
    }
  }

  printJson(result);
}

async function cmdExtractLearning(flags: ArgMap): Promise<void> {
  const topic = flags.get('topic');
  let sources: unknown;

  if (flags.get('from-db') === 'true') {
    // Phase 5 — pull lessons + arch_issue observations from SQLite directly.
    const adapter = openAdapter(flags, { readonly: true });
    try {
      const obs = adapter.fetchObservations({ limit: 5000 });
      sources = obs
        .filter((o) => {
          const dw = (o.metadata?.dev_workflow as Record<string, unknown> | undefined) ?? null;
          if (!dw) return false;
          const kind = dw.kind as string | undefined;
          if (kind !== 'lesson' && kind !== 'architecture_issue') return false;
          const topics = (dw.topics as string[] | undefined) ?? [];
          return topic ? topics.includes(topic) : true;
        })
        .map((o) => {
          const dw = (o.metadata?.dev_workflow as Record<string, unknown>) ?? {};
          return {
            id: String(o.id),
            kind: dw.kind as 'lesson' | 'architecture_issue',
            topic: topic as never,
            appliesTo: (dw.applies_to as string[] | undefined) ?? [],
            confidence: dw.confidence as 'confirmed' | 'hypothesis' | undefined,
            archStatus: dw.status as never,
            content:
              (dw.lesson as string) ??
              (dw.issue as string) ??
              o.narrative ??
              '(no content)',
            evidence: (dw.evidence as string) ?? `obs ${o.id}`,
            sessionId: o.memory_session_id
          };
        });
    } finally {
      adapter.close();
    }
  } else {
    const sourcesPath = flags.get('sources');
    if (!topic || !sourcesPath) {
      console.error(pc.red('usage: extract-learning --topic=T (--sources=FILE.json | --from-db=true) [--persist=true]'));
      process.exit(1);
    }
    sources = await readJsonFile(sourcesPath);
  }

  if (!topic) {
    console.error(pc.red('--topic is required'));
    process.exit(1);
  }

  const llmCaller = pickLlmCaller();
  const extractor = new LearningExtractor(llmCaller, {
    minLessons: Number(flags.get('min-lessons') ?? 3)
  });
  const result = await extractor.extract(topic as never, sources as never, {
    id: (flags.get('id') ?? `learn-${Date.now()}`) as string
  });

  // Phase 5 — persist into learning_records when --persist=true.
  const shouldPersist = flags.get('persist') === 'true';
  if (shouldPersist && result.record) {
    const adapter = openAdapter(flags, { readonly: false });
    try {
      const rec = result.record;
      const NodeSqlite = await import('node:sqlite');
      const db = new (NodeSqlite as unknown as { DatabaseSync: new (p: string) => { prepare(sql: string): { run(...p: unknown[]): unknown } } }).DatabaseSync(adapter.dbPath);
      const epoch = Date.now();
      const createdAt = new Date(epoch).toISOString();
      db.prepare(
        `INSERT INTO learning_records (
          id, topic, last_synthesized, applies_to, summary, content,
          source_session_ids, source_lesson_ids, source_issue_ids,
          confidence_distribution, generation_cost_usd, generation_input_tokens,
          needs_review, created_at, created_at_epoch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(topic) DO UPDATE SET
          last_synthesized=excluded.last_synthesized,
          applies_to=excluded.applies_to,
          summary=excluded.summary,
          content=excluded.content,
          source_session_ids=excluded.source_session_ids,
          source_lesson_ids=excluded.source_lesson_ids,
          source_issue_ids=excluded.source_issue_ids,
          confidence_distribution=excluded.confidence_distribution,
          generation_cost_usd=excluded.generation_cost_usd,
          needs_review=excluded.needs_review`
      ).run(
        rec.id,
        rec.topic,
        rec.last_synthesized,
        JSON.stringify(rec.applies_to),
        rec.summary,
        JSON.stringify(rec.content),
        JSON.stringify(rec.source_session_ids),
        JSON.stringify(rec.source_lesson_ids),
        JSON.stringify(rec.source_issue_ids),
        JSON.stringify(rec.confidence_distribution),
        rec.generation_cost_usd ?? null,
        rec.generation_input_tokens ?? null,
        rec.needs_review ? 1 : 0,
        createdAt,
        epoch
      );
    } finally {
      adapter.close();
    }
  }

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

  // Phase 6 — persist into golden_doc_sources when --persist=true.
  if (flags.get('persist') === 'true') {
    const adapter = openAdapter(flags, { readonly: false });
    try {
      const NodeSqlite = await import('node:sqlite');
      const db = new (NodeSqlite as unknown as { DatabaseSync: new (p: string) => { prepare(sql: string): { run(...p: unknown[]): unknown } } }).DatabaseSync(adapter.dbPath);
      db.prepare(
        `INSERT INTO golden_doc_sources (
          id, golden_doc_path, generated_at, source_learning_ids,
          generation_prompt_hash, generation_cost_usd, human_reviewed,
          reviewer, needs_review, last_review_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(golden_doc_path) DO UPDATE SET
          generated_at=excluded.generated_at,
          source_learning_ids=excluded.source_learning_ids,
          generation_prompt_hash=excluded.generation_prompt_hash,
          generation_cost_usd=excluded.generation_cost_usd,
          needs_review=excluded.needs_review`
      ).run(
        result.source.id,
        result.source.golden_doc_path,
        result.source.generated_at,
        JSON.stringify(result.source.source_learning_ids),
        result.source.generation_prompt_hash,
        result.source.generation_cost_usd ?? null,
        result.source.human_reviewed ? 1 : 0,
        result.source.reviewer ?? null,
        result.source.needs_review ? 1 : 0,
        result.source.last_review_at ?? null
      );
    } finally {
      adapter.close();
    }
  }

  printJson({ markdown: result.markdown, source: result.source });
}

// ---------------------------------------------------------------------------
// SQLite-backed subcommands (sessions, build-inputs, backfill)
// ---------------------------------------------------------------------------

function openAdapter(flags: ArgMap, options: { readonly?: boolean } = {}): SqliteObservationAdapter {
  const dbPath = flags.get('db') ?? `${process.env.HOME}/.claude-mem/claude-mem.db`;
  return new SqliteObservationAdapter(dbPath, options);
}

async function cmdSessions(flags: ArgMap): Promise<void> {
  const adapter = openAdapter(flags, { readonly: true });
  try {
    const limit = Number(flags.get('limit') ?? '20');
    const rows = adapter.listSessions(limit);
    printJson(rows);
  } finally {
    adapter.close();
  }
}

async function cmdBuildInputs(flags: ArgMap): Promise<void> {
  const sessionId = flags.get('session-id');
  if (!sessionId) {
    console.error(pc.red('usage: build-inputs --session-id=UUID [--project=X] [--limit=N]'));
    process.exit(1);
  }
  const adapter = openAdapter(flags, { readonly: true });
  try {
    const obs = adapter.fetchObservations({
      sessionId,
      project: flags.get('project'),
      limit: Number(flags.get('limit') ?? '500')
    });

    const filesModified = uniq(obs.flatMap((o) => o.files_modified));
    const filesRead = uniq(obs.flatMap((o) => o.files_read));

    const inputs = {
      sessionId,
      projectName: obs[0]?.project ?? flags.get('project'),
      observations: obs.map((o) => {
        // Promote dev_workflow.kind to the top-level kind so the synthesizer
        // sees enriched observations as architecture_issue / lesson / etc.,
        // falling back to the legacy claude-mem `type` for raw observations.
        const devWf = (o.metadata?.dev_workflow as Record<string, unknown> | undefined) ?? null;
        const promotedKind = devWf && typeof devWf.kind === 'string' ? devWf.kind : o.type;
        return {
          id: String(o.id),
          kind: promotedKind,
          content: summariseObservationForContext(o),
          metadata: o.metadata ?? {},
          createdAt: o.created_at
        };
      }),
      transcriptExcerpt: filesModified.length
        ? `Files modified across session: ${filesModified.slice(0, 30).join(', ')}`
        : undefined,
      git: {
        commits: [] as string[]
      },
      specPaths: filesRead.filter((f) => f.includes('_specs') || f.endsWith('.spec.md'))
    };

    printJson(inputs);
  } finally {
    adapter.close();
  }
}

interface BackfillReport {
  scanned: number;
  detector_skipped_legacy: number;
  detector_no_match: number;
  attempted: number;
  enriched: number;
  failed: number;
  cost_usd: number;
  per_kind: Record<string, number>;
  notes: string[];
}

async function cmdBackfill(flags: ArgMap): Promise<void> {
  const dryRun = flags.get('dry-run') === 'true';
  const writeBack = !dryRun;
  const maxCostUsd = Number(flags.get('max-cost') ?? '2');
  const maxObservations = Number(flags.get('max') ?? '50');
  const minConfidence = Number(flags.get('min-confidence') ?? '0.6');
  const sessionId = flags.get('session-id');
  const project = flags.get('project');
  const watch = flags.get('watch') === 'true';
  const watchIntervalSec = Number(flags.get('watch-interval') ?? '60');
  let sinceEpoch = flags.get('since-epoch') ? Number(flags.get('since-epoch')) : undefined;

  if (watch) {
    // Live-tail mode: poll for new observations, run enrichment forever.
    const adapter = openAdapter(flags, { readonly: false });
    try {
      if (sinceEpoch === undefined) {
        sinceEpoch = adapter.latestEpoch() ?? 0;
        console.error(pc.dim(`watch mode: starting from epoch ${sinceEpoch} (now)`));
      }
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const report = await runBackfillScan(adapter, pickLlmCaller(), {
          dryRun,
          maxCostUsd,
          maxObservations,
          minConfidence,
          sessionId,
          project,
          sinceEpoch
        });
        if (report.scanned > 0) {
          process.stderr.write(`[watch] scanned=${report.scanned} enriched=${report.enriched} cost=$${report.cost_usd.toFixed(3)}\n`);
        }
        sinceEpoch = adapter.latestEpoch() ?? sinceEpoch;
        await new Promise((r) => setTimeout(r, watchIntervalSec * 1000));
      }
    } finally {
      adapter.close();
    }
  }

  const adapter = openAdapter(flags, { readonly: false });
  try {
    const report = await runBackfillScan(adapter, pickLlmCaller(), {
      dryRun,
      maxCostUsd,
      maxObservations,
      minConfidence,
      sessionId,
      project,
      sinceEpoch
    });
    printJson(report);
  } finally {
    adapter.close();
  }
}

interface BackfillScanOptions {
  dryRun: boolean;
  maxCostUsd: number;
  maxObservations: number;
  minConfidence: number;
  sessionId?: string;
  project?: string;
  sinceEpoch?: number;
}

async function runBackfillScan(
  adapter: SqliteObservationAdapter,
  enrichLlm: ReturnType<typeof pickLlmCaller>,
  options: BackfillScanOptions
): Promise<BackfillReport> {
  const { dryRun, maxCostUsd, maxObservations, minConfidence, sessionId, project, sinceEpoch } = options;
  const writeBack = !dryRun;
  const report: BackfillReport = {
    scanned: 0,
    detector_skipped_legacy: 0,
    detector_no_match: 0,
    attempted: 0,
    enriched: 0,
    failed: 0,
    cost_usd: 0,
    per_kind: {},
    notes: [
      dryRun ? 'dry-run mode: no writes' : 'live mode: writes dev_workflow into metadata',
      `cost cap: $${maxCostUsd.toFixed(2)}`,
      `max observations: ${maxObservations}`
    ]
  };

  const legacyKinds = new Set(['change', 'feature', 'discovery']);

  try {
    await adapter.forEachObservation(
      {
        sessionId,
        project,
        sinceEpoch,
        withoutDevWorkflow: true,
        limit: maxObservations
      },
      async (obs) => {
        report.scanned++;

        const event = buildDetectorEvent(obs);
        const detections = detectKinds(event).filter((d) => d.confidence >= minConfidence);

        // Drop legacy kinds — claude-mem already handles them
        const promotable = detections.filter((d) => !legacyKinds.has(d.kind));
        if (promotable.length === 0) {
          if (detections.length > 0) report.detector_skipped_legacy++;
          else report.detector_no_match++;
          return;
        }

        // Prefer the highest-confidence non-legacy kind
        const target = promotable[0];
        const promptModule = getPromptModule(target.kind);
        if (!promptModule) {
          report.detector_no_match++;
          return;
        }

        if (report.cost_usd >= maxCostUsd) {
          report.notes.push(`cost cap reached at scan #${report.scanned}; stopping early`);
          return;
        }

        report.attempted++;
        if (!report.per_kind[target.kind]) report.per_kind[target.kind] = 0;

        try {
          const llmRequest = {
            systemPrompt: promptModule.systemPrompt,
            userPrompt: promptModule.buildUserPrompt({
              narrative: event.narrative,
              topicsList: TOPICS,
              filesModified: event.filesModified,
              filesRead: event.filesRead,
              additionalContext: event.agentText
            }),
            model: promptModule.model,
            responseJsonSchema: promptModule.responseJsonSchema
          };

          const response = await enrichLlm(llmRequest);
          report.cost_usd += response.usage?.estimatedUsd ?? 0;

          const parsed = DevWorkflowPayloadSchema.safeParse({
            ...(response.parsed as Record<string, unknown>),
            kind: target.kind
          });

          if (!parsed.success) {
            report.failed++;
            report.notes.push(
              `validation failed at obs ${obs.id} (kind=${target.kind}): ${parsed.error.issues[0]?.message ?? 'invalid'}`
            );
            return;
          }

          report.per_kind[target.kind]++;
          report.enriched++;

          if (writeBack) {
            adapter.writeDevWorkflowMetadata(obs.id, parsed.data as Record<string, unknown>);
          }
        } catch (err) {
          report.failed++;
          report.notes.push(`llm call failed at obs ${obs.id}: ${(err as Error).message?.slice(0, 200)}`);
        }
      }
    );
  } catch (err) {
    report.notes.push(`scan loop error: ${(err as Error).message?.slice(0, 200)}`);
  }

  return report;
}

function uniq<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Phase 4 migration importer — read existing _ai/sessions/*.md files,
 * parse YAML frontmatter + sections, write into session_records table.
 * Idempotent via INSERT ... ON CONFLICT(id).
 */
async function cmdMigrateSessions(flags: ArgMap): Promise<void> {
  const fromDir = flags.get('from-dir');
  if (!fromDir) {
    console.error(pc.red('usage: migrate-sessions --from-dir=PATH [--limit=N] [--dry-run=true]'));
    process.exit(1);
  }
  const dryRun = flags.get('dry-run') === 'true';
  const limit = Number(flags.get('limit') ?? '500');

  const files = (await fs.readdir(fromDir))
    .filter((f) => f.endsWith('.md') && /^\d{4}-\d{2}-\d{2}/.test(f))
    .slice(0, limit);

  const report = { scanned: files.length, imported: 0, skipped: 0, errors: 0, files: [] as Array<{ name: string; status: string }> };
  const adapter = openAdapter(flags, { readonly: dryRun });
  let db: { prepare(sql: string): { run(...p: unknown[]): unknown } } | null = null;
  if (!dryRun) {
    const NodeSqlite = await import('node:sqlite');
    db = new (NodeSqlite as unknown as { DatabaseSync: new (p: string) => typeof db }).DatabaseSync(adapter.dbPath) as never;
  }

  try {
    for (const file of files) {
      try {
        const raw = await fs.readFile(`${fromDir}/${file}`, 'utf8');
        const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match) {
          report.skipped++;
          report.files.push({ name: file, status: 'no_frontmatter' });
          continue;
        }
        const frontmatter = parseYamlLite(match[1]);
        const body = match[2];
        const id = `imported-${file.replace(/\.md$/, '')}`;
        const date = (frontmatter.date as string) ?? file.slice(0, 10);
        const memorySessionId = `imported-${id}`;
        const projects = arrayOrEmpty(frontmatter.projects);
        const topics = arrayOrEmpty(frontmatter.topics);
        const tags = arrayOrEmpty(frontmatter.tags);
        const status = (frontmatter.status as string) ?? 'completed';
        const type = (frontmatter.type as string) ?? 'feature';
        const title = (frontmatter.title as string) ?? file;

        const content = {
          objective: extractSection(body, 'Objective'),
          sdk_notes: {},
          architecture_issues: [],
          context_documents: [],
          lessons_learned: [],
          user_steering: [],
          next_steps: extractListSection(body, 'Next Steps'),
          updates: [],
          imported_raw_markdown: body.slice(0, 8000)
        };

        if (!dryRun && db) {
          db.prepare(
            `INSERT INTO session_records (
              id, memory_session_id, title, date, projects, branch, status, type,
              topics, tags, last_updated, sdk_touched, apps_touched, commits,
              related_sessions, specs, content, observation_refs, generation_metadata,
              created_at, created_at_epoch
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`
          ).run(
            id,
            memorySessionId,
            title,
            date,
            JSON.stringify(projects),
            (frontmatter.branch as string) ?? null,
            status,
            type,
            JSON.stringify(topics),
            JSON.stringify(tags),
            (frontmatter.last_updated as string) ?? new Date().toISOString(),
            JSON.stringify(arrayOrEmpty(frontmatter.sdk_touched)),
            JSON.stringify(arrayOrEmpty(frontmatter.apps_touched)),
            JSON.stringify(arrayOrEmpty(frontmatter.commits)),
            JSON.stringify(arrayOrEmpty(frontmatter.related_sessions)),
            JSON.stringify(arrayOrEmpty(frontmatter.specs)),
            JSON.stringify(content),
            JSON.stringify([]),
            JSON.stringify({ source: 'session-md-importer', original_file: file }),
            new Date().toISOString(),
            Date.now()
          );
        }
        report.imported++;
        report.files.push({ name: file, status: dryRun ? 'preview' : 'imported' });
      } catch (err) {
        report.errors++;
        report.files.push({ name: file, status: `error: ${(err as Error).message?.slice(0, 100)}` });
      }
    }
  } finally {
    adapter.close();
  }

  printJson(report);
}

function parseYamlLite(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let key: string | null = null;
  for (const line of lines) {
    if (line.match(/^\s*-\s/) && key) {
      const arr = (out[key] as unknown[]) ?? [];
      arr.push(line.replace(/^\s*-\s*/, '').trim());
      out[key] = arr;
      continue;
    }
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) continue;
    key = m[1];
    let val: string = m[2].trim();
    if (val === '') {
      out[key] = [];
      continue;
    }
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }
    out[key] = val;
  }
  return out;
}

function arrayOrEmpty(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.length) return [v];
  return [];
}

function extractSection(body: string, header: string): string {
  const re = new RegExp(`^##\\s+${header}\\s*$([\\s\\S]*?)(?=^##\\s)`, 'm');
  const m = body.match(re);
  return m ? m[1].trim().slice(0, 4000) : '';
}

function extractListSection(body: string, header: string): string[] {
  const section = extractSection(body, header);
  if (!section) return [];
  return section
    .split('\n')
    .filter((l) => /^\s*[-*0-9.]\s/.test(l))
    .map((l) => l.replace(/^\s*[-*0-9.]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 30);
}

/**
 * Phase 5 — list topics with enough lessons in DB to be candidates for
 * learning extraction. Used by the pilot script + drift detection.
 */
async function cmdTopicsReady(flags: ArgMap): Promise<void> {
  const minLessons = Number(flags.get('min-lessons') ?? '3');
  const adapter = openAdapter(flags, { readonly: true });
  try {
    const obs = adapter.fetchObservations({ limit: 10000 });
    const counts: Record<string, { lesson: number; arch: number; sessions: Set<string> }> = {};
    for (const o of obs) {
      const dw = (o.metadata?.dev_workflow as Record<string, unknown> | undefined) ?? null;
      if (!dw) continue;
      const kind = dw.kind as string | undefined;
      if (kind !== 'lesson' && kind !== 'architecture_issue') continue;
      const topics = (dw.topics as string[] | undefined) ?? [];
      for (const t of topics) {
        if (!counts[t]) counts[t] = { lesson: 0, arch: 0, sessions: new Set() };
        if (kind === 'lesson') counts[t].lesson++;
        else counts[t].arch++;
        counts[t].sessions.add(o.memory_session_id);
      }
    }
    const ready = Object.entries(counts)
      .filter(([, c]) => c.lesson >= minLessons)
      .map(([topic, c]) => ({
        topic,
        lessons: c.lesson,
        architecture_issues: c.arch,
        sessions: c.sessions.size
      }))
      .sort((a, b) => b.lessons - a.lessons);
    printJson({ ready, min_lessons: minLessons });
  } finally {
    adapter.close();
  }
}

/**
 * Phase 6 helper — write golden doc draft to disk + provenance row.
 * Builds on cmdGoldenDoc but also persists golden_doc_sources.
 */

async function cmdInferSession(flags: ArgMap): Promise<void> {
  const sessionId = flags.get('session-id');
  if (!sessionId) {
    console.error(pc.red('usage: infer-session --session-id=UUID [--dry-run=true] [--project=X]'));
    process.exit(1);
  }
  const dryRun = flags.get('dry-run') === 'true';
  const project = flags.get('project');
  const adapter = openAdapter(flags, { readonly: dryRun });

  try {
    const obs = adapter.fetchObservations({ sessionId, project, limit: 200 });
    if (obs.length === 0) {
      printJson({ session_id: sessionId, items: [], notes: ['no observations for this session'] });
      return;
    }

    const cluster: InferenceObservation[] = obs.map((o) => {
      const devWf = (o.metadata?.dev_workflow as Record<string, unknown> | undefined) ?? null;
      return {
        id: o.id,
        kind: o.type,
        title: o.title,
        narrative: o.narrative,
        facts: o.facts,
        files_modified: o.files_modified,
        promoted_kind: devWf && typeof devWf.kind === 'string' ? (devWf.kind as string) : null
      };
    });

    const projectName = obs[0]?.project ?? project ?? 'unknown';
    const llmCaller = pickLlmCaller();
    const engine = new SessionInferenceEngine(llmCaller);
    const result = await engine.infer({
      sessionId,
      projectName,
      observations: cluster
    });

    const persisted: Array<{ id: number; kind: string; title?: string }> = [];
    if (!dryRun) {
      for (const item of result.items) {
        const payload = item.payload as Record<string, unknown>;
        const titleHint =
          (payload.lesson as string) ??
          (payload.issue as string) ??
          (payload.chosen as string) ??
          `inferred ${item.kind}`;
        const id = adapter.insertInferredObservation({
          memorySessionId: sessionId,
          project: projectName,
          devWorkflowPayload: payload,
          evidenceObservationIds: item.evidence_observation_ids,
          title: titleHint.slice(0, 200),
          narrative: JSON.stringify(payload)
        });
        persisted.push({ id, kind: item.kind, title: titleHint.slice(0, 80) });
      }
    }

    printJson({
      session_id: sessionId,
      cluster_size: cluster.length,
      inferred_count: result.items.length,
      rejected_count: result.rejectedItems.length,
      persisted_count: persisted.length,
      persisted,
      items: result.items,
      rejected_items: result.rejectedItems,
      notes: result.notes,
      duration_ms: result.durationMs,
      dry_run: dryRun
    });
  } finally {
    adapter.close();
  }
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
    case 'sessions':
      await cmdSessions(flags);
      return;
    case 'build-inputs':
      await cmdBuildInputs(flags);
      return;
    case 'backfill':
      await cmdBackfill(flags);
      return;
    case 'infer-session':
      await cmdInferSession(flags);
      return;
    case 'migrate-sessions':
      await cmdMigrateSessions(flags);
      return;
    case 'topics-ready':
      await cmdTopicsReady(flags);
      return;
    default:
      console.error(pc.red(`unknown dev-workflow subcommand: ${subcommand}`));
      printHelp();
      process.exit(1);
  }
}
