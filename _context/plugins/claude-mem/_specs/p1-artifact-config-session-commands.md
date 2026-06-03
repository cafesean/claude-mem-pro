# Design: Configurable Artifact Locations + Relocated Session Commands

**Date:** 2026-06-03
**Repo:** claude-mem fork (`/Volumes/HD/code/ai/claude-mem`), plugin `claude-mem-pro`
**Branch:** `feature/artifact-config-session-commands`
**Status:** Approved (brainstorming) — pending implementation plan

## Problem

claude-mem-pro works well *because* it reads project artifacts — session files, specs,
memory notes. But the paths to those artifacts are **hardcoded** across the plugin:

- Session-writing commands (`session-start`, `session-update`, `session-end`) live in a
  *different* plugin (`dev-workflow`, jetdevs marketplace) and bake in monorepo-specific
  assumptions: the absolute path `/Volumes/HD/code/monorepo/_ai/` and a fixed project-tag
  list (`[cadra-web]`, `[yobo]`, …).
- The `recall`, `timeline-report`, `training`, and `weekly-digests` skills hardcode
  `_ai/sessions`, `_context`, `docs/superpowers/specs`, and
  `~/.claude/projects/<proj>/memory/`.

This makes claude-mem-pro unusable for anyone who stores artifacts elsewhere. Two
coupled fixes:

1. **Relocate** the session commands into claude-mem-pro (true move out of dev-workflow)
   and genericize them.
2. **Add a config layer** so artifact locations are declared per project, never assumed.

## Decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| Where per-project artifact locations are stored | **Global keyed map** in `~/.claude-mem/settings.json` (`projects` map keyed by project). Nothing added to consumer repos. |
| How a project gets configured | **Dedicated `/init` command.** Captures artifact locations, then **suggests** running `/training` as a follow-up (does NOT run training inline). |
| How markdown skills/commands read the config | **Resolver script** (`scripts/artifact-paths.cjs`) — single source of truth; markdown files contain zero paths. |
| Fate of the dev-workflow originals | **Delete them** (true move). Edit the jetdevs plugins repo; bump dev-workflow version. |
| Behavior in an unconfigured project | **Require config first.** No silent convention defaults — direct the user into `/init`. |

## Architecture

```
~/.claude-mem/settings.json
  └─ projects: { "<project-key>": { sessionsDir, specsDirs, memoryDir, wikiDir,
                                     projectTags, currentSessionFile } }
        ▲ written by /init                    │ read by everything
        │                                      ▼
   commands/init.md ───► scripts/artifact-paths.cjs ◄─── commands/session-{start,update,end}.md
   (suggests /training)   (check | get | set)            skills/{recall,timeline-report,
                                                                  training,weekly-digests}
```

A single **artifact-path resolver** is the only code that knows where things live.
Everything else asks the resolver.

## Config schema

Per-project entry under `projects` in `~/.claude-mem/settings.json`:

```jsonc
"projects": {
  "<project-key>": {
    "sessionsDir": "_ai/sessions",                 // rel to project root, or absolute, or ~-prefixed
    "specsDirs": ["_context"],
    "memoryDir": "~/.claude/projects/<proj>/memory",
    "wikiDir": "docs/wiki",
    "projectTags": ["cadra-web", "yobo", "crm"],    // optional; used for [tag] in session filenames
    "currentSessionFile": "_ai/.current-session"
  }
}
```

- **Project key**: `getProjectName(cwd)` from `src/utils/project-name.ts` — i.e.
  `path.basename(cwd)`, with worktrees collapsed to a `parent/worktree` composite via
  `getProjectContext`. This is the identity claude-mem already uses everywhere, so the
  worker, recall, and the session commands all agree on "which project" with **no new
  resolution logic and no git-root detection.** The resolver script imports/reuses this
  function rather than reimplementing it.
- **No special monorepo casing.** recall already references artifact dirs *relative to
  the launch cwd*; the config's only job is to record where those dirs are for the
  project key. Whatever cwd Claude launched in (for the polyrepo, the monorepo root) is
  the key — same as today.
- **Path resolution**: relative paths resolve against the project root (the cwd that
  produced the key); `~` expands to home; absolute paths used as-is.
- Settings file already supports a `{ env: {...} }` envelope (see `resolveDataDir` in
  `src/shared/paths.ts`); the `projects` map is a new **top-level** sibling key, not
  under `env`.

## Components

### 1. `scripts/artifact-paths.cjs` (new)

The only code touching the `projects` map. Subcommands:

- `check` → exits 0 if the current project is configured, non-zero otherwise; prints
  `{ "configured": true|false, "projectKey": "..." }`.
- `get` → prints resolved JSON for the current project:
  `{ configured, projectKey, projectRoot, sessionsDir, specsDirs, memoryDir, wikiDir, projectTags, currentSessionFile }`
  with all paths fully resolved (absolute). If unconfigured, `configured:false` and no
  resolved paths.
- `set` → writes/updates the current project's entry. Accepts the fields as flags or
  a JSON blob on stdin. Creates `~/.claude-mem/settings.json` if absent; preserves
  existing `env`/other keys.

CommonJS `.cjs` (matches the other plugin scripts: `mcp-server.cjs`,
`context-generator.cjs`). No external deps.

### 2. `commands/init.md` (new)

1. Resolve the project key + project root via the resolver.
2. If already configured, show the current entry and offer to reconfigure.
3. Ask/confirm each artifact location (sessions, specs, memory, wiki, project tags,
   current-session file). Offer the current conventions as *suggested* values the user
   can accept or override — suggestions only, not silent defaults.
4. `artifact-paths.cjs set` to persist.
5. Print a confirmation + **suggest** running `/training` next to seed must-know facts.

### 3. `commands/session-start.md`, `session-update.md`, `session-end.md` (moved + genericized)

- Ported from `dev-workflow/commands/`, preserving the RAG structure, YAML frontmatter,
  and section conventions (the valuable part).
- Remove the hardcoded `/Volumes/HD/code/monorepo/_ai/` path and the fixed project-tag
  list.
- At the top, run `artifact-paths.cjs get`. **If `configured == false` → stop and route
  the user into `/init`** (offer to run it), then re-read once configured. No file is
  written to an assumed location.
- Use `sessionsDir` for the file, `projectTags` for the `[tag]` in the filename
  (free-form tag allowed if the list is empty/optional), and `currentSessionFile` for
  the multi-session tracker.

### 4. Skill updates (`recall`, `timeline-report`, `training`, `weekly-digests`)

Replace hardcoded `_ai/sessions` / `_context` / `docs/superpowers/specs` /
`~/.claude/projects/<proj>/memory` with values from `artifact-paths.cjs get`. The
authority order in `recall` (CLAUDE.md → memory → specs → sessions) is unchanged; only
the *paths* become resolver-driven. If unconfigured, these skills tell the user to run
`/init` rather than scanning assumed locations.

### 5. dev-workflow deletion (jetdevs plugins repo)

- Delete `commands/session-start.md`, `session-update.md`, `session-end.md` from
  `/Volumes/HD/code/monorepo/plugins/dev-workflow/`.
- Grep the jetdevs plugins repo for references to these commands (agents, other skills,
  feature-lifecycle) and repoint them to the claude-mem-pro equivalents.
- Bump `dev-workflow` plugin version + marketplace version.

## Data flow — `/session-start` in an unconfigured project

```
/session-start
  → artifact-paths.cjs check  →  configured:false
  → "This project isn't set up for claude-mem-pro. Let's run /init."
  → /init: ask paths → set → suggest /training
  → artifact-paths.cjs get   →  configured:true, sessionsDir=…
  → create <sessionsDir>/YYYY-MM-DD-[tag]-desc.md
```

## Error handling

- Missing/corrupt `settings.json` → resolver treats project as unconfigured (never
  crashes); `set` recreates the file preserving recoverable keys.
- `projectTags` empty/absent → session filename accepts a free-form tag (no enum
  enforcement).
- Path points outside an existing dir → resolver still returns it; the command creates
  the dir on write (matching today's behavior).

## Testing

- **Unit** (`artifact-paths.cjs`): `check`/`get`/`set` against a temp `settings.json` —
  configured, unconfigured, relative vs absolute vs `~` paths, missing optional keys,
  corrupt file, `env`-envelope preservation.
- **Integration**: `session-start` in an unconfigured temp project routes into `/init`;
  configured project writes to the declared `sessionsDir`.
- **Regression**: `recall` / `timeline-report` still locate files for the already-
  configured monorepo project after migration.

## Repos & workflow

- **claude-mem fork** (`/Volumes/HD/code/ai/claude-mem`): branch
  `feature/artifact-config-session-commands` off `develop`; bump
  `plugin/.claude-plugin/plugin.json`. Flow feature → develop → main. **Never push
  upstream (thedotmack).**
- **jetdevs plugins** (`/Volumes/HD/code/monorepo/plugins`): the deletion + dev-workflow
  version bump.
- Commit locally only; **no push / no merge unless explicitly asked.**

## Out of scope (YAGNI)

- Migrating the global keyed map into per-repo files (rejected in favor of the global
  map; can be added later as a hybrid if needed).
- Auto-detecting artifact locations by scanning the repo (init asks; suggestions are
  offered but not auto-applied).
- Changing the session-file RAG schema itself.
