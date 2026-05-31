#!/usr/bin/env bun
/**
 * purge-noise-observations.ts
 *
 * One-time cleanup of the OLD per-tool observation noise track. Deletes
 * process-narrative observations (type discovery|change — "tests pass",
 * "committed X", "verified Y") that polluted the injected context, while
 * SPARING the enriched/inferred high-value kinds (decision, lesson,
 * architecture_issue) and real-work kinds (bugfix, feature, refactor, security)
 * and ANY discovery/change row that was later enriched (metadata carries
 * dev_workflow / session-inference).
 *
 * Safe: dry-run unless --force; backs up the DB first; keeps FTS in sync if a
 * trigger exists. Mutation log + session files are the go-forward memory.
 *
 *   bun scripts/purge-noise-observations.ts          # dry-run
 *   bun scripts/purge-noise-observations.ts --force  # delete (after backup)
 */
import { Database } from 'bun:sqlite';
import { existsSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function dbPath(): string {
  return join(process.env.CLAUDE_MEM_DATA_DIR || join(homedir(), '.claude-mem'), 'claude-mem.db');
}

// Noise = process narratives. Spare enriched rows (metadata mentions the
// dev_workflow layer or session inference) even if their type is discovery/change.
const NOISE_PREDICATE = `
  type IN ('discovery','change')
  AND (metadata IS NULL
       OR (metadata NOT LIKE '%dev_workflow%' AND metadata NOT LIKE '%inference%'))
`;

function main(): void {
  const force = process.argv.includes('--force');
  const p = dbPath();
  if (!existsSync(p)) { console.error(`DB not found: ${p}`); process.exit(1); }
  const db = new Database(p);
  try {
    const total = (db.prepare('SELECT count(*) AS c FROM observations').get() as { c: number }).c;
    const toDelete = (db.prepare(`SELECT count(*) AS c FROM observations WHERE ${NOISE_PREDICATE}`).get() as { c: number }).c;
    const spared = (db.prepare(`SELECT count(*) AS c FROM observations WHERE type IN ('discovery','change') AND NOT (${NOISE_PREDICATE})`).get() as { c: number }).c;

    console.log('purge-noise-observations');
    console.log('========================');
    console.log(`DB: ${p}`);
    console.log(`total observations:        ${total}`);
    console.log(`noise to delete:           ${toDelete} (discovery|change, un-enriched)`);
    console.log(`enriched discovery/change spared: ${spared}`);
    console.log(`kept (all other types + enriched): ${total - toDelete}`);
    console.log('');
    console.log('Sample to delete:');
    for (const r of db.prepare(`SELECT type, substr(title,1,55) AS t FROM observations WHERE ${NOISE_PREDICATE} ORDER BY created_at_epoch DESC LIMIT 6`).all() as Array<{ type: string; t: string }>) {
      console.log(`  ${r.type} | ${r.t}`);
    }
    console.log('');

    if (toDelete === 0) { console.log('Nothing to purge.'); return; }
    if (!force) { console.log('DRY RUN — re-run with --force to delete (backup made first).'); return; }

    const ts = (db.prepare("SELECT strftime('%s','now') AS ts").get() as { ts: string }).ts;
    const backup = `${p}.pre-obs-purge-${ts}.bak`;
    copyFileSync(p, backup);
    console.log(`Backup: ${backup}`);

    // Capture ids first (FTS trigger, if any, fires per-row on DELETE).
    const ids = (db.prepare(`SELECT id FROM observations WHERE ${NOISE_PREDICATE}`).all() as Array<{ id: number }>).map((r) => r.id);
    const del = db.prepare('DELETE FROM observations WHERE id = ?');
    const tx = db.transaction(() => { for (const id of ids) del.run(id); });
    tx();
    console.log(`Deleted ${ids.length} noise observations. Kept ${total - ids.length}.`);
  } finally {
    db.close();
  }
}
main();
