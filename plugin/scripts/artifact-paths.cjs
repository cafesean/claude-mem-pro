#!/usr/bin/env node
'use strict';

/**
 * artifact-paths.cjs — the single source of truth for WHERE a project's
 * artifacts live (session files, specs, memory notes, wiki).
 *
 * claude-mem-pro does not assume everyone stores artifacts in the same place.
 * Each project declares its locations once (via the /init command), keyed by
 * the SAME project identity claude-mem uses everywhere — basename(cwd), with
 * worktrees collapsed to a "parent/worktree" composite (see project-name.ts).
 *
 * The config lives as a top-level `projects` map in claude-mem's settings.json
 * (DATA_DIR/settings.json). Everything that reads artifacts — recall,
 * timeline-report, training, weekly-digests, and the session-* commands — calls
 * this script instead of hardcoding `_ai/sessions`, `_context`, etc.
 *
 * Usage:
 *   node artifact-paths.cjs check            -> { configured, projectKey }
 *   node artifact-paths.cjs get              -> full resolved JSON
 *   node artifact-paths.cjs set < entry.json -> merge entry into projects[key]
 *
 * Optional: pass a project root as argv[3], else uses CLAUDE_PROJECT_DIR or cwd.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---- project identity (mirrors src/utils/project-name.ts) ------------------

function expandTilde(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/')) return p.replace(/^~/, os.homedir());
  return p;
}

function detectWorktreeParent(cwd) {
  // Returns the parent project name if cwd is a git worktree, else null.
  const gitPath = path.join(cwd, '.git');
  let stat;
  try {
    stat = fs.statSync(gitPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  let content;
  try {
    content = fs.readFileSync(gitPath, 'utf-8').trim();
  } catch {
    return null;
  }
  const m = content.match(/^gitdir:\s*(.+)$/);
  if (!m) return null;
  const wm = m[1].match(/^(.+)[/\\]\.git[/\\]worktrees[/\\][^/\\]+$/);
  if (!wm) return null;
  return path.basename(wm[1]);
}

function getProjectKey(cwd) {
  const expanded = expandTilde(cwd);
  const base = path.basename(expanded);
  if (base === '') return 'unknown-project';
  const parent = detectWorktreeParent(expanded);
  return parent ? `${parent}/${base}` : base;
}

// ---- settings.json resolution (mirrors resolveDataDir in paths.ts) ---------

function resolveDataDir() {
  if (process.env.CLAUDE_MEM_DATA_DIR) return process.env.CLAUDE_MEM_DATA_DIR;
  const home = path.join(os.homedir(), '.claude-mem');
  const settingsPath = path.join(home, 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const s = raw.env ?? raw;
      if (s.CLAUDE_MEM_DATA_DIR) return s.CLAUDE_MEM_DATA_DIR;
    }
  } catch {
    /* fall through */
  }
  return home;
}

function settingsPath() {
  return path.join(resolveDataDir(), 'settings.json');
}

function readSettings() {
  const p = settingsPath();
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    /* corrupt or missing — treat as empty */
  }
  return {};
}

function writeSettings(settings) {
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

// ---- path resolution -------------------------------------------------------

function resolveOne(value, projectRoot) {
  if (!value) return value;
  const expanded = expandTilde(value);
  return path.isAbsolute(expanded) ? expanded : path.resolve(projectRoot, expanded);
}

function resolveEntry(entry, projectRoot) {
  const out = {
    sessionsDir: resolveOne(entry.sessionsDir, projectRoot),
    specsDirs: Array.isArray(entry.specsDirs)
      ? entry.specsDirs.map((d) => resolveOne(d, projectRoot))
      : [],
    memoryDir: resolveOne(entry.memoryDir, projectRoot),
    wikiDir: resolveOne(entry.wikiDir, projectRoot),
    currentSessionFile: resolveOne(entry.currentSessionFile, projectRoot),
    projectTags: Array.isArray(entry.projectTags) ? entry.projectTags : [],
  };
  // Drop undefined keys so callers can tell what was actually configured.
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

// ---- main ------------------------------------------------------------------

function main() {
  const cmd = process.argv[2];
  const projectRoot = process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectKey = getProjectKey(projectRoot);
  const settings = readSettings();
  const projects = settings.projects || {};
  const entry = projects[projectKey];
  const configured = !!entry && Object.keys(entry).length > 0;

  if (cmd === 'check') {
    process.stdout.write(JSON.stringify({ configured, projectKey }) + '\n');
    process.exit(configured ? 0 : 1);
  }

  if (cmd === 'get') {
    const result = { configured, projectKey, projectRoot };
    if (configured) Object.assign(result, resolveEntry(entry, projectRoot), { raw: entry });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  }

  if (cmd === 'set') {
    let stdin = '';
    try {
      stdin = fs.readFileSync(0, 'utf-8');
    } catch {
      stdin = '';
    }
    let incoming;
    try {
      incoming = JSON.parse(stdin || '{}');
    } catch (e) {
      process.stderr.write('artifact-paths set: invalid JSON on stdin\n');
      process.exit(2);
    }
    const merged = Object.assign({}, entry || {}, incoming);
    settings.projects = Object.assign({}, projects, { [projectKey]: merged });
    writeSettings(settings);
    process.stdout.write(
      JSON.stringify({ ok: true, projectKey, entry: merged, settingsPath: settingsPath() }, null, 2) + '\n'
    );
    process.exit(0);
  }

  process.stderr.write('Usage: artifact-paths.cjs <check|get|set> [projectRoot]\n');
  process.exit(2);
}

main();
