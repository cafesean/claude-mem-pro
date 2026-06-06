
import path from 'path';
import { homedir } from 'os';
import { unlinkSync } from 'fs';
import { SessionStore } from '../sqlite/SessionStore.js';
import { logger } from '../../utils/logger.js';
import { getProjectContext } from '../../utils/project-name.js';

import type { ContextInput, ContextConfig, Observation, SessionSummary } from './types.js';
import { loadContextConfig } from './ContextConfigLoader.js';
import { calculateTokenEconomics } from './TokenCalculator.js';
import {
  queryObservations,
  queryObservationsMulti,
  queryCriticalObservations,
  querySummaries,
  querySummariesMulti,
  getPriorSessionMessages,
  prepareSummariesForTimeline,
  buildTimeline,
  getFullObservationIds,
} from './ObservationCompiler.js';
import { renderMutationDigest } from './MutationDigest.js';
import { renderHeader } from './sections/HeaderRenderer.js';
import { renderTimeline } from './sections/TimelineRenderer.js';
import { shouldShowSummary, renderSummaryFields } from './sections/SummaryRenderer.js';
import { renderPreviouslySection, renderFooter } from './sections/FooterRenderer.js';
import { renderAgentEmptyState } from './formatters/AgentFormatter.js';
import { renderHumanEmptyState } from './formatters/HumanFormatter.js';
import { resolveArtifactPaths, listRecentSessionFiles } from './ArtifactPathsResolver.js';
import { renderArtifactPointers } from './sections/ArtifactPointersRenderer.js';

const VERSION_MARKER_PATH = path.join(
  homedir(),
  '.claude',
  'plugins',
  'marketplaces',
  'cafesean',
  'plugin',
  '.install-version'
);

function initializeDatabase(): SessionStore | null {
  try {
    return new SessionStore();
  } catch (error: unknown) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ERR_DLOPEN_FAILED') {
      try {
        unlinkSync(VERSION_MARKER_PATH);
      } catch (unlinkError) {
        if (unlinkError instanceof Error) {
          logger.debug('WORKER', 'Marker file cleanup failed (may not exist)', {}, unlinkError);
        } else {
          logger.debug('WORKER', 'Marker file cleanup failed (may not exist)', { error: String(unlinkError) });
        }
      }
      logger.error('WORKER', 'Native module rebuild needed - restart Claude Code to auto-fix');
      return null;
    }
    throw error;
  }
}

function renderEmptyState(project: string, forHuman: boolean): string {
  return forHuman ? renderHumanEmptyState(project) : renderAgentEmptyState(project);
}

/** Injection mode: 'mutations' (new default — clean digest) | 'legacy' (old obs/summary index). */
function injectMode(): 'mutations' | 'legacy' {
  return process.env.CLAUDE_MEM_INJECT_MODE === 'legacy' ? 'legacy' : 'mutations';
}

/** Guard against NaN from a malformed setting — fall back to a sane default. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function buildContextOutput(
  project: string,
  observations: Observation[],
  summaries: SessionSummary[],
  config: ContextConfig,
  cwd: string,
  sessionId: string | undefined,
  forHuman: boolean,
  db: SessionStore,
  projects: string[]
): string {
  const output: string[] = [];

  // Routing precedence:
  //   granularity = 'pointers'      → always artifact-pointers
  //   granularity = 'auto'          → pointers if /init-configured, else fall through
  //   granularity = 'mutations'     → force mutations digest
  //   granularity = 'observations'  → force legacy observation timeline
  // Unconfigured projects keep their existing CLAUDE_MEM_INJECT_MODE behavior
  // so pre-existing installs don't see a behavior change without /init.
  const granularity = config.granularity ?? 'auto';
  if (granularity === 'pointers' || granularity === 'auto') {
    const artifacts = resolveArtifactPaths(cwd);
    if (artifacts.configured || granularity === 'pointers') {
      const recent = listRecentSessionFiles(artifacts.sessionsDir, config.recentSessionCount);
      // Critical observations are pulled from a separate, broader pool so
      // older decisions/security/deploy entries aren't pushed off by fresh
      // change/discovery rows in the main observation list.
      let critical: Observation[] = [];
      try {
        critical = queryCriticalObservations(db, projects);
      } catch (err) {
        logger.warn('CONTEXT', 'critical observation query failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return renderArtifactPointers(project, cwd, artifacts, recent, critical);
    }
  }

  const useMutations = granularity === 'mutations'
    || (granularity !== 'observations' && injectMode() === 'mutations');
  if (useMutations) {
    output.push(`# [${project}] recent context, ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '');
    let digest: string[] = [];
    try {
      digest = renderMutationDigest(db.db as never, projects, {
        group: config.digestGroup,
        windowDays: finiteOr(config.digestWindowDays, 7),
        maxBlocks: finiteOr(config.digestMaxBlocks, 10),
        filesPerBlock: finiteOr(config.digestFilesPerBlock, 4),
        describe: config.digestDescribe,
      });
    } catch (err) {
      // Older DBs predate the mutations table — fall through to legacy
      // observation rendering instead of failing the whole hook.
      logger.warn('CONTEXT', 'mutation digest failed, falling back to legacy', {
        error: err instanceof Error ? err.message : String(err),
      });
      digest = [];
    }
    if (digest.length > 0) {
      output.push(...digest);
      output.push(
        'For deeper recall (past decisions, lessons, specs, session history), use the `recall` skill or `mem-search`.',
      );
      return output.join('\n').trimEnd();
    }
    // Reset output so legacy renderer starts fresh.
    output.length = 0;
  }

  // Legacy injection (CLAUDE_MEM_INJECT_MODE=legacy).
  const economics = calculateTokenEconomics(observations);
  output.push(...renderHeader(project, economics, config, forHuman));
  const displaySummaries = summaries.slice(0, config.sessionCount);
  const summariesForTimeline = prepareSummariesForTimeline(displaySummaries, summaries);
  const timeline = buildTimeline(observations, summariesForTimeline);
  const fullObservationIds = getFullObservationIds(observations, config.fullObservationCount);

  output.push(...renderTimeline(timeline, fullObservationIds, config, cwd, forHuman));

  const mostRecentSummary = summaries[0];
  const mostRecentObservation = observations[0];

  if (shouldShowSummary(config, mostRecentSummary, mostRecentObservation)) {
    output.push(...renderSummaryFields(mostRecentSummary, forHuman));
  }

  const priorMessages = getPriorSessionMessages(observations, config, sessionId, cwd);
  output.push(...renderPreviouslySection(priorMessages, forHuman));

  output.push(...renderFooter(economics, config, forHuman));

  return output.join('\n').trimEnd();
}

export async function generateContext(
  input?: ContextInput,
  forHuman: boolean = false
): Promise<string> {
  const config = loadContextConfig();
  const cwd = input?.cwd ?? process.cwd();
  const context = getProjectContext(cwd);

  const projects = input?.projects?.length ? input.projects : context.allProjects;
  const project = projects[projects.length - 1] ?? context.primary;

  if (input?.full) {
    config.totalObservationCount = 999999;
    config.sessionCount = 999999;
  }

  const db = initializeDatabase();
  if (!db) {
    return '';
  }

  try {
    const observations = projects.length > 1
      ? queryObservationsMulti(db, projects, config)
      : queryObservations(db, project, config);
    const summaries = projects.length > 1
      ? querySummariesMulti(db, projects, config)
      : querySummaries(db, project, config);

    // In mutations mode the digest comes from the mutations table, so don't
    // short-circuit on empty observations/summaries — there may still be
    // mutations to show. Only empty-state when legacy mode has nothing.
    if (injectMode() === 'legacy' && observations.length === 0 && summaries.length === 0) {
      return renderEmptyState(project, forHuman);
    }

    const output = buildContextOutput(
      project,
      observations,
      summaries,
      config,
      cwd,
      input?.session_id,
      forHuman,
      db,
      projects
    );

    return output;
  } finally {
    db.close();
  }
}
