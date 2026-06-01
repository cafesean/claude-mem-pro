
/**
 * Mutation filter — decides whether a tool call is a durable MUTATION worth
 * capturing, or an OBSERVATION / admin action to skip.
 *
 * Principle (see _context/.../knowledge-capture-redesign/mutation-capture.md):
 * capture when the agent changed the world (local file write to a real path,
 * or an external system mutation like a Notion/Jira/Shopify tool call); skip
 * reads, searches, scratch writes, build output, and claude-mem-pro's own footprint.
 *
 * Pure + zero-dependency: deterministic classification from tool name + input.
 * No LLM. Defaults are tuned for "real work vs admin"; callers may pass
 * include/exclude overrides sourced from settings.
 */

export type MutationDecision = 'capture' | 'skip';

export interface ToolCall {
  /** Tool name, e.g. "Write", "Read", "mcp__notion__update-page", "Bash". */
  toolName: string;
  /** Tool input object (paths, command, args). Best-effort, may be partial. */
  input?: Record<string, unknown> | null;
}

export interface MutationFilterConfig {
  /** Extra glob/substring patterns to force-capture (override defaults). */
  include?: string[];
  /** Extra glob/substring patterns to force-skip (override defaults). */
  exclude?: string[];
}

/** Read-only / observe tools — never a mutation regardless of args. */
const READ_ONLY_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'LS', 'NotebookRead',
  'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'AskUserQuestion',
  'ToolSearch', 'BashOutput',
]);

/** Local file-mutating tools — capture if the target path is a real artifact. */
const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);

/** MCP verb fragments that indicate an external-system mutation. */
const MUTATE_VERBS = /(update|create|write|push|set|add|delete|remove|insert|patch|put|post|send|publish|upsert|move|rename|edit|append|merge)/i;

/** MCP verb fragments that indicate a read — wins over MUTATE_VERBS if matched alone. */
const READ_VERBS = /(get|fetch|list|search|read|query|find|view|show|describe|status|context|outline|count|check)/i;

/**
 * Scratch / build / admin paths — a write here is NOT a durable artifact.
 * Substring match against the resolved path.
 */
const SCRATCH_PATH_PATTERNS = [
  '/tmp/', '/private/tmp/', '/var/folders/',
  '.bak', '.tmp', '.swp', '.lock', 'lock.json',
  '/node_modules/', '/dist/', '/build/', '/.next/', '/out/',
  '.cjs',                       // built worker bundles
  '/.git/',
  '/.claude-mem/',             // claude-mem-pro's own data dir
  '/_ai/sessions/',            // session files = librarian's job, not mutation log
  '/memory/',                  // memory files = librarian's job
  '.DS_Store',
];

function matchesAny(haystack: string, patterns: string[]): boolean {
  const h = haystack.toLowerCase();
  return patterns.some((p) => h.includes(p.toLowerCase()));
}

/** Extract a best-effort target path from common file-tool input shapes. */
function extractPath(input?: Record<string, unknown> | null): string | null {
  if (!input) return null;
  const candidate =
    input.file_path ?? input.path ?? input.notebook_path ?? input.filePath;
  return typeof candidate === 'string' ? candidate : null;
}

/** True when a Bash command is a durable mutation (git commit, etc.). */
function isMutatingBash(input?: Record<string, unknown> | null): boolean {
  const cmd = input && typeof input.command === 'string' ? input.command : '';
  if (!cmd) return false;
  // Require the git mutation to LEAD a command segment — not merely appear
  // somewhere (e.g. inside a heredoc body, an echo'd string, or a comment).
  // Split on statement separators; allow leading env-assignments / sudo.
  // git commit / git push / git tag / git merge = durable; status/log/diff = read.
  return cmd
    .split(/&&|\|\||[;\n|]/)
    .some((seg) => /^\s*(?:sudo\s+|\w+=\S+\s+)*git\s+(commit|push|tag|merge)\b/.test(seg));
}

/**
 * Classify a tool call as a durable mutation ('capture') or not ('skip').
 * Config include/exclude (substring patterns matched against `toolName::path`)
 * override the built-in defaults — exclude wins over include.
 */
export function classifyToolCall(
  call: ToolCall,
  config: MutationFilterConfig = {},
): MutationDecision {
  const { toolName, input } = call;
  const path = extractPath(input);
  const matchTarget = `${toolName}::${path ?? (typeof input?.command === 'string' ? input.command : '')}`;

  // Explicit config overrides first. Exclude beats include.
  if (config.exclude && matchesAny(matchTarget, config.exclude)) return 'skip';
  if (config.include && matchesAny(matchTarget, config.include)) return 'capture';

  // Read-only tools never mutate.
  if (READ_ONLY_TOOLS.has(toolName)) return 'skip';

  // Local file writes: capture unless the path is scratch/build/admin.
  if (FILE_WRITE_TOOLS.has(toolName)) {
    if (!path) return 'skip';                       // no path → can't classify → skip
    if (matchesAny(path, SCRATCH_PATH_PATTERNS)) return 'skip';
    return 'capture';
  }

  // Bash: only durable git operations count.
  if (toolName === 'Bash') {
    return isMutatingBash(input) ? 'capture' : 'skip';
  }

  // MCP / external tools: classify by verb in the tool name.
  if (toolName.startsWith('mcp__')) {
    // A mutate verb present AND not purely a read → capture.
    const hasMutate = MUTATE_VERBS.test(toolName);
    const hasRead = READ_VERBS.test(toolName);
    if (hasMutate && !hasRead) return 'capture';
    if (hasMutate && hasRead) return 'capture';     // e.g. "create-from-search" → favor mutation
    return 'skip';                                   // pure read or unknown verb
  }

  // Unknown tool → skip (conservative; avoids re-noising on novel tools).
  return 'skip';
}
