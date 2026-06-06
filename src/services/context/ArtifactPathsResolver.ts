
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, basename, resolve, isAbsolute } from 'path';
import { homedir } from 'os';
import { getProjectName } from '../../utils/project-name.js';
import { detectWorktree } from '../../utils/worktree.js';

export interface ArtifactPaths {
  configured: boolean;
  projectKey: string;
  projectRoot: string;
  sessionsDir?: string;
  specsDirs?: string[];
  memoryDir?: string;
  wikiDir?: string;
  currentSessionFile?: string;
  projectTags?: string[];
}

function expandTilde(p: string): string {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/')) return p.replace(/^~/, homedir());
  return p;
}

function resolveDataDir(): string {
  if (process.env.CLAUDE_MEM_DATA_DIR) return process.env.CLAUDE_MEM_DATA_DIR;
  const home = join(homedir(), '.claude-mem');
  const settingsPath = join(home, 'settings.json');
  try {
    if (existsSync(settingsPath)) {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const s = raw.env ?? raw;
      if (s.CLAUDE_MEM_DATA_DIR) return s.CLAUDE_MEM_DATA_DIR;
    }
  } catch {
    /* fall through */
  }
  return home;
}

function getProjectKey(cwd: string): string {
  const name = getProjectName(cwd);
  const wt = detectWorktree(cwd);
  return wt.isWorktree && wt.parentProjectName ? `${wt.parentProjectName}/${name}` : name;
}

function resolveOne(value: string | undefined, projectRoot: string): string | undefined {
  if (!value) return undefined;
  const expanded = expandTilde(value);
  return isAbsolute(expanded) ? expanded : resolve(projectRoot, expanded);
}

export function resolveArtifactPaths(cwd: string): ArtifactPaths {
  const projectRoot = cwd;
  const projectKey = getProjectKey(projectRoot);
  const settingsPath = join(resolveDataDir(), 'settings.json');

  let settings: any = {};
  try {
    if (existsSync(settingsPath)) settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    /* corrupt or missing */
  }

  const entry = settings?.projects?.[projectKey];
  const configured = !!entry && Object.keys(entry).length > 0;

  const out: ArtifactPaths = { configured, projectKey, projectRoot };
  if (!configured) return out;

  out.sessionsDir = resolveOne(entry.sessionsDir, projectRoot);
  out.specsDirs = Array.isArray(entry.specsDirs)
    ? entry.specsDirs.map((d: string) => resolveOne(d, projectRoot)!).filter(Boolean)
    : [];
  out.memoryDir = resolveOne(entry.memoryDir, projectRoot);
  out.wikiDir = resolveOne(entry.wikiDir, projectRoot);
  out.currentSessionFile = resolveOne(entry.currentSessionFile, projectRoot);
  out.projectTags = Array.isArray(entry.projectTags) ? entry.projectTags : [];
  return out;
}

export interface RecentSessionFile {
  path: string;
  basename: string;
  mtimeMs: number;
}

export function listRecentSessionFiles(sessionsDir: string | undefined, limit: number): RecentSessionFile[] {
  if (!sessionsDir || !existsSync(sessionsDir)) return [];
  try {
    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    const files: RecentSessionFile[] = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.endsWith('.md')) continue;
      const p = join(sessionsDir, e.name);
      try {
        const st = statSync(p);
        files.push({ path: p, basename: e.name, mtimeMs: st.mtimeMs });
      } catch {
        /* skip */
      }
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files.slice(0, Math.max(0, limit));
  } catch {
    return [];
  }
}
