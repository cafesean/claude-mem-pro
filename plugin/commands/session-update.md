---
name: session-update
description: Update the current development session with detailed, RAG-optimized content. Use when logging progress, capturing architecture issues, recording SDK/library patterns, or documenting debugging sessions. Generates session files designed for vector embedding and semantic search.
model: sonnet
---

# Session Update

Update the current development session. Session files are designed for RAG ingestion and
vector embedding — every section must be self-contained, detailed, and semantically
searchable. claude-mem-pro reads the session location from per-project config.

## Step 0: Resolve artifact locations (REQUIRED)

`$CLAUDE_PLUGIN_ROOT` is not set in this Bash environment, so resolve the plugin root
into `$CMPRO` first, then call the script:

```bash
CMPRO=$(node -e 'const fs=require("fs"),os=require("os"),p=require("path");const cfg=process.env.CLAUDE_CONFIG_DIR||p.join(os.homedir(),".claude");const C=[];if(process.env.CLAUDE_PLUGIN_ROOT)C.push(process.env.CLAUDE_PLUGIN_ROOT);try{for(const k of Object.values(JSON.parse(fs.readFileSync(p.join(cfg,"plugins/known_marketplaces.json"),"utf8")))){const s=(k.source&&k.source.path)||k.installLocation;if(s)C.push(p.join(s,"plugin"),s);}}catch(e){}try{const b=p.join(cfg,"plugins/cache/cafesean/claude-mem-pro");for(const v of fs.readdirSync(b))C.push(p.join(b,v,"plugin"),p.join(b,v));}catch(e){}C.push(p.join(cfg,"plugins/marketplaces/cafesean/plugin"));for(const c of C)if(fs.existsSync(p.join(c,"scripts/artifact-paths.cjs"))){process.stdout.write(c);break;}')
node "$CMPRO/scripts/artifact-paths.cjs" get
```

If `configured: false` → stop and tell the user to run `/init` first. Otherwise use
`sessionsDir` and `currentSessionFile` from the output.

## Step 1: Find Active Session

Read `currentSessionFile` for active sessions.

**Multiple session support:**
- It may contain multiple active session filenames (one per line).
- Each filename carries a `[tag]` prefix, e.g. `2026-06-03-[web]-description.md`.
- Match the `[tag]` against the current working context. If `$ARGUMENTS` includes a tag
  or project name, use that to match.
- If only one session exists, use it. If multiple are ambiguous, list them and ask.

If no active session exists, tell the user to start one with `/session-start`.

## Step 2: Ensure YAML Frontmatter Exists

Every session file MUST begin with YAML frontmatter. If missing (legacy format), add it
now. Update dynamic fields (`status`, `last_updated`, `commits`, `tags`) on every update.

```yaml
---
title: "Descriptive title of what this session accomplished"
date: 2026-06-03
projects: [project-a, project-b]
branch: feature/my-feature
status: in-progress  # in-progress | completed | blocked | paused
type: feature  # feature | bugfix | refactor | investigation | qa | migration | infrastructure
topics: [rls, caching, org-isolation, permissions]  # from TOPIC TAXONOMY (see session-start)
tags: [caching, cdn, performance]  # additional semantic tags for RAG retrieval
last_updated: 2026-06-03T14:30:00
sdk_touched: []  # which SDKs/libraries were involved, if any
apps_touched: [project-a]  # which apps/repos were modified
commits: ["abc1234", "def5678"]  # all commit hashes from this session
related_sessions: []  # filenames of related sessions
specs: []  # paths to related spec documents
---
```

## Step 3: Append Detailed Update

Append a new update block. **Do NOT summarize — capture granular detail.** Each update
should contain enough context that someone reading it months later (or a RAG system
retrieving it) can understand exactly what happened and why.

### Update Block Format

```markdown
---

### Update — 2026-06-03 14:30

#### What Changed

Describe the specific changes made in this update cycle. Include:
- What code was written or modified and WHY (not just "modified auth.ts")
- What problem was being solved — the specific symptoms, not just "fixed a bug"
- What approach was taken and what alternatives were considered
- What the before/after behavior is

#### Detailed Problem Analysis

(Include when debugging or investigating issues)

- **Symptoms observed**: Exact error messages, unexpected behavior, reproduction steps
- **Investigation path**: What was checked, in what order, and what each check revealed
- **Root cause**: The actual underlying issue with technical explanation
- **Why it wasn't obvious**: What made this hard to find

#### Implementation Details

- Specific code patterns used and why they were chosen
- Edge cases handled or intentionally deferred
- Performance implications of the changes
- Security considerations (especially for auth, permissions, data isolation)

#### Commit Log

| Hash | Message | Files |
|------|---------|-------|
| `abc1234` | fix(auth): refresh token before retrying the request | `src/server/auth.ts` |

#### Files Changed (This Update)

```
M src/server/auth.ts    — Refresh the access token before retry instead of failing
A src/lib/new-helper.ts  — New utility for X because Y
D src/lib/old-helper.ts  — Removed: replaced by new-helper.ts
```

#### Git Status

- Branch: `feature/my-feature`
- Last commit: `def5678 fix(cache): default scope to user`
- Working tree: clean / N uncommitted changes
```

## Step 4: Update Standing Sections

After appending the update block, review and update these standing sections. Each is
designed to be independently retrievable by a RAG system — write each as if it will be
read without the rest of the document.

### SDK / Library Notes Section

Maintain a `## SDK Notes` section for anything specific to the libraries or internal
SDKs the project depends on. Focus on:
- **How APIs were used** — correct patterns discovered, incorrect assumptions corrected
- **Gaps or limitations** encountered — missing features, workarounds needed
- **Cross-app inconsistencies** — where different apps use the same dependency differently
- **Bugs found** — unexpected behavior in dependency code

### Architecture Issues Section

Maintain a `## Architecture Issues` section. Document inconsistencies, confusion,
misunderstandings, or incorrectly implemented patterns. High-value for the knowledge base.

```markdown
## Architecture Issues

### Issue Title
- **Status**: resolved | workaround-applied | known-limitation | unresolved | investigating
- **Topics**: topic1, topic2
- **Issue**: (description)
- **Impact**: (what breaks or is at risk)
- **Applies to**: (which apps/SDKs)
- **Correct pattern**: (what should be done instead)
```

### Context Documents Section

Update `## Context Documents` with files referenced during this session. Include enough
description that a RAG system can match queries to the right documents.

| Document | Path | Why It Matters |
|----------|------|----------------|

### Lessons Learned Section

Maintain `## Lessons Learned`. Each lesson is a candidate for extraction into learning
docs. Write each as a self-contained knowledge unit. Every lesson MUST include:

- **The lesson** — specific and actionable, not generic advice
- **Topics** — which taxonomy topics this maps to (for cross-session grouping)
- **Applies to** — which apps/SDKs this lesson is relevant to
- **Confidence** — `confirmed` (verified by testing/deployment) or `hypothesis`
- **Evidence** — which commit, update block, or investigation step proved this

```markdown
## Lessons Learned

### Architecture

- **Lesson**: When one module works but another doesn't with identical code, check
  infrastructure-level differences (HTTP cache headers, middleware order) before code logic.
  - Topics: `caching`, `cdn`, `debugging`
  - Applies to: all apps using cached routes
  - Confidence: confirmed
  - Evidence: commit `abc1234`
```

### User Steering & Corrections Section

Maintain a `## User Steering & Corrections` section. This captures every instance where
the user had to redirect, correct, clarify, or mentor the agent. **This is training
data** — it reveals where agents need improvement. Record the user's **exact words** (or
close paraphrase), what the agent did wrong or would have done, the root cause of the
misunderstanding, and the lesson.

```markdown
## User Steering & Corrections

### Corrections (agent was wrong or heading wrong direction)
- **User said**: "(exact words)"
  - What agent did wrong, root cause, lesson

### Clarifications (agent needed more context)
- **User said**: "(exact words)"
  - What was unclear, resolution

### Steering (user redirected approach or priorities)
- **User said**: "(exact words)"
  - What agent was doing, better approach

### Requirements additions (user added scope mid-session)
- **User said**: "(exact words)"
  - Impact on design/implementation
```

### Next Steps Section

Maintain `## Next Steps` with specific, actionable items. Include enough context that
another developer (or AI agent) can pick up where this session left off.

## Step 5: Update Frontmatter

After appending all content, update the dynamic fields: `last_updated`, `commits`
(append new hashes), `tags`, `status`, `sdk_touched` / `apps_touched`.

## Writing Guidelines for RAG Optimization

1. **Be specific, not generic** — "token refresh races the retry on cold start" not "auth bug"
2. **Include technical terms** — exact function names, file paths, error messages
3. **Self-contained sections** — each `##` section should make sense if retrieved alone
4. **Explain WHY, not just WHAT**
5. **Include the investigation path** — what was checked and eliminated matters
6. **Name specific files and functions**
7. **Capture cross-app patterns** explicitly
8. **Record what DIDN'T work** — failed approaches are valuable
9. **Use exact error messages** — high-value search targets

## Knowledge Pipeline Context

Session files are the **first stage** of a knowledge pipeline:

1. **Sessions** (this output) — raw, detailed records of development work
2. **Learnings** — distilled, cross-session knowledge grouped by topic
3. **Golden Docs** — authoritative guidelines (live under the configured `specsDirs`)

To support the pipeline, every session uses standardized **topics**, tags lessons with
**applies to**, includes **confidence**, provides **evidence**, captures **architecture
issues** with status, records **SDK notes**, and captures **user steering & corrections**.

When the project has a `CLAUDE.md`, update it with durable learnings and standards
discovered during the session.
