---
name: init
description: Configure where this project's artifacts live (session files, specs, memory, wiki) so claude-mem-pro's recall, timeline, and session commands know where to read and write. Run once per project. Re-run to reconfigure.
---

# claude-mem-pro init

claude-mem-pro works by reading and writing a project's **artifacts** — session
files, specs, memory notes, wiki docs. It does **not** assume everyone stores these in
the same place. This command records where they live for the current project, keyed by
the project identity claude-mem already uses (`basename(cwd)`, worktree-aware).

The config is stored as a top-level `projects` map in claude-mem's `settings.json`
(nothing is written into your repo).

## Step 1 — Detect the project

Run the resolver to see the project key and whether it's already configured.

> **Note:** `$CLAUDE_PLUGIN_ROOT` is only set inside hook subprocesses — it is **not**
> populated in the Bash environment that runs command bodies. So every block below
> resolves the plugin root itself into `$CMPRO` (checks `$CLAUDE_PLUGIN_ROOT`, then the
> directory/cache/marketplace install locations) before calling the script. `check`
> exits `1` when the project isn't configured yet — that's an expected signal, not a
> crash.

```bash
CMPRO=$(node -e 'const fs=require("fs"),os=require("os"),p=require("path");const cfg=process.env.CLAUDE_CONFIG_DIR||p.join(os.homedir(),".claude");const C=[];if(process.env.CLAUDE_PLUGIN_ROOT)C.push(process.env.CLAUDE_PLUGIN_ROOT);try{for(const k of Object.values(JSON.parse(fs.readFileSync(p.join(cfg,"plugins/known_marketplaces.json"),"utf8")))){const s=(k.source&&k.source.path)||k.installLocation;if(s)C.push(p.join(s,"plugin"),s);}}catch(e){}try{const b=p.join(cfg,"plugins/cache/cafesean/claude-mem-pro");for(const v of fs.readdirSync(b))C.push(p.join(b,v,"plugin"),p.join(b,v));}catch(e){}C.push(p.join(cfg,"plugins/marketplaces/cafesean/plugin"));for(const c of C)if(fs.existsSync(p.join(c,"scripts/artifact-paths.cjs"))){process.stdout.write(c);break;}')
node "$CMPRO/scripts/artifact-paths.cjs" check
```

- Show the user the `projectKey` and the project root (current working directory).
- If `configured: true`, also run `... get` and show the existing locations, then ask
  whether they want to **reconfigure** or keep the current setup. If they keep it, skip
  to Step 4.

## Step 2 — Ask where each artifact lives

Ask the user for each location. **Offer the common conventions as suggestions they can
accept or override — never silently assume them.** Paths may be relative to the project
root, absolute, or `~`-prefixed.

| Field | What it is | Common convention (suggest, don't assume) |
|-------|-----------|--------------------------------------------|
| `sessionsDir` | Where session files are written/read | `_ai/sessions` |
| `specsDirs` | One or more dirs holding specs/designs (array) | `_context` |
| `memoryDir` | Durable memory notes + `MEMORY.md` index | `~/.claude/projects/<slug>/memory` |
| `wikiDir` | Generated wiki docs (optional) | `docs/wiki` |
| `currentSessionFile` | Tracks active session filenames (one per line) | `_ai/sessions/.current-session` |
| `projectTags` | Optional list of `[tag]` values used in session filenames (array). Leave empty to allow free-form tags. | (project-specific) |

Notes:
- `memoryDir` usually can't be derived automatically (it's Claude Code's slugified
  project path, e.g. `~/.claude/projects/<your-project-slug>/memory`). Ask for it
  explicitly; if the user doesn't use memory notes, they can skip it.
- For a polyrepo where artifacts live at a shared parent dir, the user should run
  Claude (and this command) from that parent dir so the project key matches.

## Step 3 — Persist

Pipe the collected values as JSON into the resolver's `set`. Only include fields the
user provided:

```bash
CMPRO=$(node -e 'const fs=require("fs"),os=require("os"),p=require("path");const cfg=process.env.CLAUDE_CONFIG_DIR||p.join(os.homedir(),".claude");const C=[];if(process.env.CLAUDE_PLUGIN_ROOT)C.push(process.env.CLAUDE_PLUGIN_ROOT);try{for(const k of Object.values(JSON.parse(fs.readFileSync(p.join(cfg,"plugins/known_marketplaces.json"),"utf8")))){const s=(k.source&&k.source.path)||k.installLocation;if(s)C.push(p.join(s,"plugin"),s);}}catch(e){}try{const b=p.join(cfg,"plugins/cache/cafesean/claude-mem-pro");for(const v of fs.readdirSync(b))C.push(p.join(b,v,"plugin"),p.join(b,v));}catch(e){}C.push(p.join(cfg,"plugins/marketplaces/cafesean/plugin"));for(const c of C)if(fs.existsSync(p.join(c,"scripts/artifact-paths.cjs"))){process.stdout.write(c);break;}')
echo '{
  "sessionsDir": "_ai/sessions",
  "specsDirs": ["_context"],
  "memoryDir": "~/.claude/projects/<slug>/memory",
  "wikiDir": "docs/wiki",
  "currentSessionFile": "_ai/sessions/.current-session",
  "projectTags": ["web", "api", "docs"]
}' | node "$CMPRO/scripts/artifact-paths.cjs" set
```

Then confirm by running `... get` and showing the resolved (absolute) paths back to the
user.

## Step 4 — Suggest training (follow-up, not automatic)

Tell the user that the project is now configured, and **suggest** seeding must-know
facts as a next step:

> "This project is configured. Optionally run `/training` next to seed the must-know
> facts about this project, so they auto-surface in future sessions."

Do **not** run training automatically — it's a separate, optional follow-up the user
triggers.

## After init

Once configured, `/session-start`, `/session-update`, `/session-end`, and the recall /
timeline / training / weekly-digests skills all read these locations automatically.
