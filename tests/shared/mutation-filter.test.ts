import { describe, it, expect } from 'bun:test';
import { classifyToolCall } from '../../src/shared/mutation-filter.js';

describe('classifyToolCall — local file writes', () => {
  it('captures a write to a repo source file', () => {
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/Volumes/HD/code/monorepo/cadra-web/src/feature.ts' } })).toBe('capture');
    expect(classifyToolCall({ toolName: 'Edit', input: { file_path: '/repo/src/x.ts' } })).toBe('capture');
  });

  it('skips writes to scratch/tmp', () => {
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/tmp/which.txt' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/private/tmp/x.txt' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Edit', input: { file_path: '/repo/foo.bak' } })).toBe('skip');
  });

  it('skips build output + node_modules + .cjs bundles', () => {
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/repo/plugin/scripts/worker-service.cjs' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/repo/dist/index.js' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/repo/node_modules/x/y.js' } })).toBe('skip');
  });

  it("skips claude-mem-pro's own footprint (session files, memory, data dir)", () => {
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/repo/_ai/sessions/2026-05-30-foo.md' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/Users/x/.claude/projects/p/memory/foo.md' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Write', input: { file_path: '/Users/x/.claude-mem/claude-mem.db' } })).toBe('skip');
  });

  it('skips a file write with no path', () => {
    expect(classifyToolCall({ toolName: 'Write', input: {} })).toBe('skip');
  });
});

describe('classifyToolCall — read-only tools', () => {
  it('skips Read/Grep/Glob/LS/WebFetch', () => {
    for (const t of ['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite']) {
      expect(classifyToolCall({ toolName: t, input: { file_path: '/repo/src/x.ts' } })).toBe('skip');
    }
  });
});

describe('classifyToolCall — Bash', () => {
  it('captures git commit/push/tag/merge', () => {
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'git commit -m "x"' } })).toBe('capture');
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'git push origin develop' } })).toBe('capture');
  });
  it('skips read-only git + other commands', () => {
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'git status' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'git log --oneline' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'ls -la' } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'cat /tmp/x.txt' } })).toBe('skip');
  });
  it('requires the git verb to LEAD a segment (no heredoc/echo false positives)', () => {
    // "git commit" only inside a heredoc body / echoed string → not a mutation
    expect(classifyToolCall({ toolName: 'Bash', input: { command: `cat <<'EOF'\nhow to git commit\nEOF` } })).toBe('skip');
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'echo "remember to git push"' } })).toBe('skip');
    // but a real leading commit, even chained or with env prefix, still captures
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'cd repo && git commit -m "x"' } })).toBe('capture');
    expect(classifyToolCall({ toolName: 'Bash', input: { command: 'GIT_AUTHOR_NAME=x git push' } })).toBe('capture');
  });
});

describe('classifyToolCall — external MCP mutations', () => {
  it('captures mutating MCP verbs (Notion/Jira/Shopify)', () => {
    expect(classifyToolCall({ toolName: 'mcp__notion__notion-update-page' })).toBe('capture');
    expect(classifyToolCall({ toolName: 'mcp__notion__notion-create-pages' })).toBe('capture');
    expect(classifyToolCall({ toolName: 'mcp__jira__create_issue' })).toBe('capture');
    expect(classifyToolCall({ toolName: 'mcp__shopify__update_product' })).toBe('capture');
  });

  it('skips read MCP verbs', () => {
    expect(classifyToolCall({ toolName: 'mcp__notion__notion-fetch' })).toBe('skip');
    expect(classifyToolCall({ toolName: 'mcp__notion__notion-search' })).toBe('skip');
    expect(classifyToolCall({ toolName: 'mcp__plugin_claude-mem-pro_mcp-search__get_observations' })).toBe('skip');
    expect(classifyToolCall({ toolName: 'mcp__jira__list_issues' })).toBe('skip');
  });

  it('skips unknown / verbless MCP tools (conservative)', () => {
    expect(classifyToolCall({ toolName: 'mcp__foo__bar' })).toBe('skip');
  });
});

describe('classifyToolCall — config overrides', () => {
  it('exclude beats include and defaults', () => {
    const cfg = { exclude: ['mcp__shopify__'] };
    expect(classifyToolCall({ toolName: 'mcp__shopify__update_product' }, cfg)).toBe('skip');
  });
  it('include forces capture of a normally-skipped tool', () => {
    const cfg = { include: ['mcp__custom__sync'] };
    expect(classifyToolCall({ toolName: 'mcp__custom__sync' }, cfg)).toBe('capture');
  });
  it('exclude wins when both match', () => {
    const cfg = { include: ['mcp__x__do'], exclude: ['mcp__x__do'] };
    expect(classifyToolCall({ toolName: 'mcp__x__do' }, cfg)).toBe('skip');
  });
});

describe('classifyToolCall — unknown tools', () => {
  it('skips unknown non-mcp tools', () => {
    expect(classifyToolCall({ toolName: 'SomeFutureTool', input: {} })).toBe('skip');
  });
});
