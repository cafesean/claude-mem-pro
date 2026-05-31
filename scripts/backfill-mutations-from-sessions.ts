#!/usr/bin/env bun
/**
 * backfill-mutations-from-sessions.ts
 *
 * Seed the mutation log from historical work recorded in session files. The
 * mutation log is forward-only by design, but the `## Commit Log` tables in
 * _ai/sessions/*.md are a durable record of past commits (durable mutations).
 * This replays them into the `mutations` table so cross-session recall has
 * history from day one.
 *
 * Source per file: the `| hash | message | files |` rows under "Commit Log".
 * Project: parsed from the `[project]` tag in the filename, else "monorepo".
 * Timestamp: the file's `date:` frontmatter (midday), else file mtime.
 *
 * Idempotent: skips a (project, target=hash) already present. Dry-run default.
 *
 *   bun scripts/backfill-mutations-from-sessions.ts --sessions=/path/_ai/sessions          # dry-run
 *   bun scripts/backfill-mutations-from-sessions.ts --sessions=/path/_ai/sessions --force  # write
 */
import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, readFileSync, statSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { MutationStore } from '../src/services/sqlite/MutationStore.js';

function dbPath(): string {
  return join(process.env.CLAUDE_MEM_DATA_DIR || join(homedir(), '.claude-mem'), 'claude-mem.db');
}
function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : undefined;
}

interface Parsed { hash: string; message: string; project: string; epoch: number; sessionFile: string; }

function projectFromName(fname: string): string {
  const m = fname.match(/\[([^\]]+)\]/);
  return m ? m[1].split(',')[0].trim() : 'monorepo';
}
function epochFromFrontmatter(text: string, fallback: number): number {
  const m = text.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
  if (!m) return fallback;
  const t = Date.parse(`${m[1]}T12:00:00`);
  return Number.isNaN(t) ? fallback : t;
}

/** Parse `| `hash` | message | files |` rows under a Commit Log heading. */
function parseCommits(text: string, project: string, epoch: number, fname: string): Parsed[] {
  const out: Parsed[] = [];
  const lines = text.split('\n');
  let inTable = false;
  for (const line of lines) {
    if (/^#+\s*Commit Log/i.test(line)) { inTable = true; continue; }
    if (inTable && /^#+\s/.test(line)) { inTable = false; }   // next heading ends it
    if (!inTable) continue;
    // a data row has a backticked hash in the first cell
    const m = line.match(/^\|\s*`?([0-9a-f]{7,40})`?\s*\|\s*([^|]+?)\s*\|/i);
    if (m) {
      out.push({ hash: m[1], message: m[2].replace(/`/g, '').trim(), project, epoch, sessionFile: fname });
    }
  }
  return out;
}

function main(): void {
  const force = process.argv.includes('--force');
  const sessionsDir = arg('sessions');
  if (!sessionsDir || !existsSync(sessionsDir)) {
    console.error('usage: --sessions=/abs/path/_ai/sessions [--force]');
    process.exit(1);
  }
  const p = dbPath();
  if (!existsSync(p)) { console.error(`DB not found: ${p}`); process.exit(1); }

  const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.md'));
  const all: Parsed[] = [];
  for (const f of files) {
    const full = join(sessionsDir, f);
    const text = readFileSync(full, 'utf-8');
    const epoch = epochFromFrontmatter(text, statSync(full).mtimeMs);
    all.push(...parseCommits(text, projectFromName(f), epoch, f));
  }

  console.log('backfill-mutations-from-sessions');
  console.log('================================');
  console.log(`session files: ${files.length}`);
  console.log(`commit rows parsed: ${all.length}`);
  console.log('Sample:');
  for (const c of all.slice(0, 6)) {
    console.log(`  ${c.project} | ${c.hash.slice(0, 8)} | ${c.message.slice(0, 50)}`);
  }
  console.log('');

  if (all.length === 0) { console.log('Nothing to backfill.'); return; }
  if (!force) { console.log('DRY RUN — re-run with --force to write (backup made first).'); return; }

  const db = new Database(p);
  try {
    const ts = (db.prepare("SELECT strftime('%s','now') AS ts").get() as { ts: string }).ts;
    const backup = `${p}.pre-mutation-backfill-${ts}.bak`;
    copyFileSync(p, backup);
    console.log(`Backup: ${backup}`);

    const store = new MutationStore(db as never);
    // Idempotency: existing (project,target) commit messages already logged.
    const seen = new Set(
      (db.prepare(`SELECT project || '::' || coalesce(target,'') AS k FROM mutations WHERE verb='commit'`).all() as Array<{ k: string }>).map((r) => r.k),
    );
    let inserted = 0;
    for (const c of all) {
      const key = `${c.project}::${c.message}`;
      if (seen.has(key)) continue;
      store.insert({
        toolName: 'git',
        target: c.message,
        verb: 'commit',
        project: c.project,
        contentSessionId: `backfill:${c.sessionFile}`,
        detail: `${c.hash} — ${c.message}`,
        createdAtEpoch: c.epoch,
      });
      seen.add(key);
      inserted++;
    }
    console.log(`Inserted ${inserted} commit mutations (skipped ${all.length - inserted} dup/seen).`);
  } finally {
    db.close();
  }
}
main();
