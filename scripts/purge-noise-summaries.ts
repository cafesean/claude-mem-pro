#!/usr/bin/env bun
/**
 * purge-noise-summaries.ts
 *
 * One-time cleanup for keep-alive / "noop" loop noise that was captured BEFORE
 * the PrivacyCheckValidator noise gate existed (commit ee1790e6). The gate stops
 * new noise at the source; this script removes what's already in the DB so the
 * injected recent-context block is clean immediately.
 *
 * Two targets:
 *   1. session_summaries — hollow summaries whose request is a noop-paraphrase
 *      AND whose `learned` says nothing ("None", "no technical learning", ...).
 *      These are the S#### lines that pollute the injected context. The
 *      session_summaries_ad AFTER DELETE trigger keeps the FTS index in sync.
 *   2. user_prompts — rows whose text is obvious filler (isObviousFiller).
 *
 * SAFE BY DEFAULT:
 *   - dry-run unless --force is passed (prints exactly what would be deleted)
 *   - backs up the DB to <db>.pre-noise-purge-<unix>.bak before deleting
 *   - request-mentions-noop ALONE is NOT enough (real summaries discuss the
 *     noop bug); a summary is deleted only when it ALSO has empty learnings.
 *
 * Usage:
 *   bun scripts/purge-noise-summaries.ts            # dry-run, shows counts + samples
 *   bun scripts/purge-noise-summaries.ts --force    # actually delete (after backup)
 *
 * Note: vector copies in Chroma are not touched here; the injected context is
 * built from SQLite, so removing these rows fixes the injection. Chroma noise
 * only affects semantic search recall and ages out naturally.
 */

import { Database } from 'bun:sqlite';
import { existsSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { isObviousFiller } from '../src/shared/prompt-noise.js';

interface CountRow { count: number }
interface SummaryRow { id: number; request: string | null; learned: string | null }
interface PromptRow { id: number; prompt_text: string }

function resolveDbPath(): string {
  const dataDir = process.env.CLAUDE_MEM_DATA_DIR || join(homedir(), '.claude-mem');
  return join(dataDir, 'claude-mem.db');
}

// A summary's `request` looks like a noop-loop paraphrase.
const NOOP_REQUEST = `(
  lower(request) LIKE '%noop%'
  OR lower(request) LIKE '%no-op%'
  OR lower(request) LIKE '%no operation%'
)`;

// A summary's `learned` carries no durable signal.
const EMPTY_LEARNED = `(
  lower(trim(coalesce(learned,''))) IN ('none','none.','')
  OR lower(learned) LIKE 'no technical%'
  OR lower(learned) LIKE 'no substantive%'
  OR lower(learned) LIKE 'no learning%'
  OR lower(learned) LIKE 'none -%'
  OR lower(learned) LIKE 'none —%'
  OR lower(learned) LIKE 'none,%'
)`;

// Hollow noise = noop-paraphrase request AND empty learnings. Both required so
// real summaries that merely DISCUSS the noop bug are never deleted.
const NOISE_PREDICATE = `${NOOP_REQUEST} AND ${EMPTY_LEARNED}`;

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: bun scripts/purge-noise-summaries.ts [--force]');
    console.log('  (no flag) dry-run — show what would be deleted');
    console.log('  --force   back up DB, then delete the noise rows');
    return;
  }
  const force = args.includes('--force');

  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) {
    console.error(`claude-mem DB not found at ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  try {
    const totalSummaries = (db.prepare('SELECT count(*) AS count FROM session_summaries').get() as CountRow).count;
    const noiseSummaries = (db.prepare(`SELECT count(*) AS count FROM session_summaries WHERE ${NOISE_PREDICATE}`).get() as CountRow).count;

    // user_prompts: classify in JS via the shared filler util (matches the gate).
    const promptRows = db.prepare('SELECT id, prompt_text FROM user_prompts').all() as PromptRow[];
    const noisePromptIds = promptRows.filter((r) => isObviousFiller(r.prompt_text)).map((r) => r.id);

    console.log('claude-mem noise purge');
    console.log('======================');
    console.log(`DB: ${dbPath}`);
    console.log('');
    console.log(`session_summaries : ${noiseSummaries} hollow noop summaries / ${totalSummaries} total`);
    console.log(`user_prompts      : ${noisePromptIds.length} filler prompts / ${promptRows.length} total`);
    console.log('');

    const samples = db.prepare(
      `SELECT id, request, learned FROM session_summaries WHERE ${NOISE_PREDICATE} ORDER BY created_at_epoch DESC LIMIT 8`
    ).all() as SummaryRow[];
    if (samples.length > 0) {
      console.log('Sample summaries to delete:');
      for (const s of samples) {
        console.log(`  S${s.id} | ${(s.request ?? '').slice(0, 50)} | learned=${(s.learned ?? '').slice(0, 24)}`);
      }
      console.log('');
    }

    if (noiseSummaries === 0 && noisePromptIds.length === 0) {
      console.log('Nothing to purge. ✅');
      return;
    }

    if (!force) {
      console.log('DRY RUN — nothing deleted. Re-run with --force to delete (a backup is made first).');
      return;
    }

    // Backup before any destructive op.
    const backup = `${dbPath}.pre-noise-purge-${Math.floor(db.prepare('SELECT strftime(\'%s\',\'now\') AS count').get() as unknown as number)}.bak`;
    copyFileSync(dbPath, backup);
    console.log(`Backup written: ${backup}`);

    const tx = db.transaction(() => {
      const delSummaries = db.prepare(`DELETE FROM session_summaries WHERE ${NOISE_PREDICATE}`).run();
      let delPrompts = 0;
      if (noisePromptIds.length > 0) {
        const stmt = db.prepare('DELETE FROM user_prompts WHERE id = ?');
        for (const id of noisePromptIds) delPrompts += stmt.run(id).changes;
      }
      return { delSummaries: delSummaries.changes, delPrompts };
    });
    const { delSummaries, delPrompts } = tx();

    console.log('');
    console.log(`Deleted ${delSummaries} session_summaries (FTS kept in sync via AFTER DELETE trigger).`);
    console.log(`Deleted ${delPrompts} user_prompts.`);
    console.log('Done. ✅  New sessions will inject a clean recent-context block.');
  } finally {
    db.close();
  }
}

main();
