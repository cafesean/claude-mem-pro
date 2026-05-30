---
name: recall
description: Find what was done, decided, or learned in past work by searching the project's durable artifacts — session files, specs, CLAUDE.md, and memory notes. Use when the user asks "how did we do X", "what did we decide about Y", "where's the spec for Z", "have we hit this before", "what changed last time", or any cross-session recall. mem-pro acts as a librarian pointing you to the source artifact + exact section, not a separate memory store.
---

# Recall — librarian over project artifacts

mem-pro does not hold the knowledge; the **artifacts** do. Your job is to find the
right artifact and the right section inside it, then read only that section.

## Where knowledge lives (search these, in authority order)

1. **CLAUDE.md** (per repo) — authoritative standing rules / architecture. Highest trust.
2. **Memory notes** — `~/.claude/projects/<project>/memory/*.md` + `MEMORY.md` index. Durable facts, gotchas, user feedback.
3. **Specs** — `_context/**/specs.md`, `_context/**/_specs/**/*.md`. Designs, decisions. Check for `SUPERSEDED`/`PARKED` status — demote those.
4. **Session files** — `_ai/sessions/*.md`. Richest detail. Sections are self-contained: `## Architecture Issues`, `## Lessons Learned`, `## User Steering & Corrections`, `## SDK Notes`, `## Next Steps`, `## Commit Log`.

Do NOT search source code or git for "what we decided/learned" — that's what these
artifacts are for. Use code search only to confirm a pointer the artifacts gave you.

## Procedure

1. **Identify intent + topic.** Map the question to keywords AND, if known, a topic
   tag (rls, caching, oauth, org-isolation, schema-design, deployment, plugins, …).

2. **Scan, ranked by authority + recency.** Grep the corpus for the keywords:
   - `rg -l "<keywords>" _ai/sessions/ _context/ CLAUDE.md` (+ the memory dir)
   - Session files are date-prefixed (`YYYY-MM-DD-[project]-desc.md`) — prefer recent.
   - Frontmatter `topics:` / `tags:` in session files = strong topic signal.

3. **Open the matching SECTION, not the whole file.** Session/spec files are large;
   jump to the `##` heading that matches (e.g. for a past bug → `## Architecture Issues`
   or `## Lessons Learned`; for a decision → `## User Steering & Corrections`).

4. **Check freshness.** Skip specs marked `SUPERSEDED`/`PARKED`. Prefer a `resolved`
   Architecture Issue's resolution over an older `investigating` note. Newer session
   wins on conflict.

5. **Report as pointers, not a dump.** Give: the answer + `file:section` citation +
   a short snippet. Let the user drill in. Never paste whole files.

## Complement: the mutation log

For "what was actually changed/produced last sessions" (file edits, Notion/Jira/
Shopify mutations, commits), the mem-pro worker keeps a mutation log
(`mutations` table). Query via the worker if a tool is available; otherwise the
session files' `## Commit Log` / `## Files Changed` sections cover the same ground.

## What this is NOT
- Not semantic vector search (that's the `mem-search` skill over the observation
  corpus). This is deterministic, always-fresh artifact search — no index, no staleness.
- Not a writer. Capture stays manual (`/session-update`, specs). Recall only reads.
