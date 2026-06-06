---
name: session-end
description: End the current development session by appending a comprehensive summary and removing it from the active-session tracker. Use when wrapping up a development session.
model: sonnet
---

# Session End

End the current development session. claude-mem-pro reads the session location from
per-project config.

## Step 0: Resolve artifact locations (REQUIRED)

`$CLAUDE_PLUGIN_ROOT` is not set in this Bash environment, so resolve the plugin root
into `$CMPRO` first, then call the script:

```bash
CMPRO=$(node -e 'const fs=require("fs"),os=require("os"),p=require("path");const cfg=process.env.CLAUDE_CONFIG_DIR||p.join(os.homedir(),".claude");const C=[];if(process.env.CLAUDE_PLUGIN_ROOT)C.push(process.env.CLAUDE_PLUGIN_ROOT);try{for(const k of Object.values(JSON.parse(fs.readFileSync(p.join(cfg,"plugins/known_marketplaces.json"),"utf8")))){const s=(k.source&&k.source.path)||k.installLocation;if(s)C.push(p.join(s,"plugin"),s);}}catch(e){}try{const b=p.join(cfg,"plugins/cache/cafesean/claude-mem-pro");for(const v of fs.readdirSync(b))C.push(p.join(b,v,"plugin"),p.join(b,v));}catch(e){}C.push(p.join(cfg,"plugins/marketplaces/cafesean/plugin"));for(const c of C)if(fs.existsSync(p.join(c,"scripts/artifact-paths.cjs"))){process.stdout.write(c);break;}')
node "$CMPRO/scripts/artifact-paths.cjs" get
```

If `configured: false` → stop and tell the user to run `/init` first. Otherwise use
`sessionsDir` and `currentSessionFile` from the output.

## Step 1: Find the matching session

Read `currentSessionFile` for active sessions.

- It may contain **multiple active session filenames** (one per line).
- Each filename carries a `[tag]` prefix, e.g. `2026-06-03-[web]-description.md`.
- Match the `[tag]` against the current working context. If `$ARGUMENTS` includes a tag
  or project name, use that to match.
- If only one session exists, use it. If multiple are ambiguous, list them and ask which
  to end.
- If no active session exists, tell the user there's nothing to end.

## Step 2: Append a comprehensive summary

Append a closing summary to the matching session file, thorough enough that another
developer (or AI) can understand everything that happened without reading the whole file:

- Session duration
- **Git summary**: total files changed (added/modified/deleted) with change type; number
  of commits made; final git status
- **Todo summary**: tasks completed vs remaining; list completed and incomplete tasks
- Key accomplishments and all features implemented
- Problems encountered and their solutions
- Breaking changes or important findings
- Dependencies added/removed; configuration changes; deployment steps taken
- Lessons learned (use the `## Lessons Learned` format from `/session-update`)
- What wasn't completed
- Tips for future developers

## Step 3: Propagate durable knowledge

- If a `## Lessons Learned` section exists, fold durable lessons and standards into the
  project's `CLAUDE.md` and any standards docs under the configured `specsDirs`.
- Update the `## Context Documents` section with requirements/code referenced during the
  session that would help another agent get up to speed quickly.

## Step 4: Update the tracker

- Set the session's frontmatter `status` to `completed` (or `blocked`/`paused` as
  appropriate) and refresh `last_updated`.
- **Remove only the matching session's line** from `currentSessionFile` (do NOT clear the
  whole file — other sessions may still be active). If it was the last session, the file
  will be empty.

## Step 5: Confirm

Tell the user the session has been documented and closed.
