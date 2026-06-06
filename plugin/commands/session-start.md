---
name: session-start
description: Start a new development session with YAML frontmatter and RAG-optimized structure. Creates a session file in the project's configured sessions directory, with semantic tags, SDK tracking, commit logging, and structured sections for architecture issues and lessons learned.
model: sonnet
---

# Session Start

Start a new development session by creating a session file in the project's **configured
sessions directory**. claude-mem-pro does not assume where sessions live — it reads the
location from per-project config.

## Step 0: Resolve artifact locations (REQUIRED)

`$CLAUDE_PLUGIN_ROOT` is not set in this Bash environment, so resolve the plugin root
into `$CMPRO` first, then call the script:

```bash
CMPRO=$(node -e 'const fs=require("fs"),os=require("os"),p=require("path");const cfg=process.env.CLAUDE_CONFIG_DIR||p.join(os.homedir(),".claude");const C=[];if(process.env.CLAUDE_PLUGIN_ROOT)C.push(process.env.CLAUDE_PLUGIN_ROOT);try{for(const k of Object.values(JSON.parse(fs.readFileSync(p.join(cfg,"plugins/known_marketplaces.json"),"utf8")))){const s=(k.source&&k.source.path)||k.installLocation;if(s)C.push(p.join(s,"plugin"),s);}}catch(e){}try{const b=p.join(cfg,"plugins/cache/cafesean/claude-mem-pro");for(const v of fs.readdirSync(b))C.push(p.join(b,v,"plugin"),p.join(b,v));}catch(e){}C.push(p.join(cfg,"plugins/marketplaces/cafesean/plugin"));for(const c of C)if(fs.existsSync(p.join(c,"scripts/artifact-paths.cjs"))){process.stdout.write(c);break;}')
node "$CMPRO/scripts/artifact-paths.cjs" get
```

- If `configured: false` → **stop and configure first.** Tell the user this project
  isn't set up yet and run `/init` (offer to walk them through it), then re-run this
  command. Do NOT write a session file to an assumed location.
- If `configured: true` → use `sessionsDir` for the file, `projectTags` for the `[tag]`
  in the filename, and `currentSessionFile` for the active-session tracker. All paths in
  the output are already absolute.

## Session Naming Convention

**The filename MUST include a project tag wrapped in literal square brackets.**

Pattern: `YYYY-MM-DD-[TAG]-description.md` (saved inside `sessionsDir`).

The square brackets `[` and `]` are **literal characters in the filename** — they enable
grep/filtering by tag.

### How to construct the filename

1. Start with today's date: `2026-06-03`
2. Add a hyphen, then the tag **inside literal square brackets**: `2026-06-03-[web]`
3. Add a hyphen and kebab-case description: `2026-06-03-[web]-user-auth.md`

### Choosing the tag

- If `projectTags` from config is non-empty, pick the tag that matches the work (must be
  one of the listed tags).
- If `projectTags` is empty, use a short kebab-case tag describing the sub-area or repo
  you're working in.

### Correct vs wrong

```
2026-06-03-[web]-user-auth.md       ✓ brackets in filename
2026-06-03-[api]-rate-limiting.md   ✓ brackets in filename
2026-06-03-web-user-auth.md         ✗ missing brackets
session-2026-06-03-web.md           ✗ wrong format entirely
```

## Multiple Concurrent Sessions

The `currentSessionFile` supports **multiple active sessions** (one per line). Different
Claude Code instances can work on different projects simultaneously.

## Initial Session File Structure

Create the session file with YAML frontmatter and skeleton sections. The frontmatter
**must match the format used by `/session-update`** — they share the same schema. Ask
the user for goals if not clear from `$ARGUMENTS`.

```markdown
---
title: "Descriptive title of what this session will accomplish"
date: YYYY-MM-DD
projects: [project-name]
branch: branch-name
status: in-progress
type: feature  # feature | bugfix | refactor | investigation | qa | migration | infrastructure
topics: []  # from TOPIC TAXONOMY below
tags: []  # additional semantic tags for RAG retrieval
last_updated: ISO-8601-timestamp
sdk_touched: []
apps_touched: [project-name]
commits: []
related_sessions: []
specs: []
---

# Session: Title

## Objective

(What this session will accomplish and why. Be specific — this is the primary search
target for RAG retrieval.)

---

## SDK Notes

(SDK-specific findings will be logged here during updates)

## Architecture Issues

(Cross-cutting concerns, inconsistencies, or misunderstandings discovered)

## Context Documents

| Document | Path | Why It Matters |
|----------|------|----------------|

## Lessons Learned

(Categorized, specific, actionable lessons — see session-update for full format)

## Next Steps

(What to do next)
```

### Topic Taxonomy

Use standardized topics in the `topics` frontmatter field so learnings can be grouped
across sessions. These are starting points — add project-specific topics when none fit:

**Architecture & Patterns**: `rls`, `permissions`, `rbac`, `multi-tenancy`,
`org-isolation`, `extension-pattern`, `router-pattern`, `repository-pattern`,
`actor-pattern`, `schema-design`, `migration`

**SDK / Libraries**: `sdk-api-design`, `sdk-exports`, `sdk-build`

**Infrastructure**: `caching`, `cdn`, `serverless`, `docker`, `redis`,
`database`, `object-storage`, `deployment`

**Frontend**: `data-table`, `inline-editing`, `forms`, `modals`, `streaming`, `sse`

**Auth & Security**: `auth`, `jwt`, `session-management`, `api-keys`, `oauth`, `cors`

**Integration**: `trpc`, `rest-api`, `webhooks`, `messaging-channels`

**Testing**: `e2e-testing`, `integration-testing`, `smoke-testing`, `regression-testing`

**Plugins & Agents**: `plugins`, `skills`, `agents`, `hooks`

## After Creating the File

1. **Append** the new session filename as a new line to `currentSessionFile` (do NOT
   overwrite existing lines — other sessions may be active). Create the file if absent.
2. Confirm the session has started and remind the user they can update it with
   `/session-update` or end it with `/session-end`.

## Reading project context at session start

Read the project's `CLAUDE.md` (if present) at session start for standing rules. Read
the configured `specsDirs` for designs relevant to the work. The recall skill can locate
task-specific docs on demand.
