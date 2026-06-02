---
name: training
description: Seed claude-mem with must-know facts about whatever you're working on — code repo, legal matter, finance close, research, anything. Use when the user says "train the plugin", "/training", "teach you about this project", "what should you always know", "remember these facts about my work", or wants to initialize must-know context up front instead of waiting for it to be learned passively. Captures durable facts that auto-surface by relevance later.
---

# Training — seed must-know facts

You are capturing **must-know facts** the user wants you to reliably have on hand in future
sessions. Facts are written into claude-mem's observation corpus tagged `must_know` and
auto-surface later via the semantic-injection rail. This is **not** code-only — the work may
be a repo, a legal matter, an accounting close, a research project, or anything else.

## Modes

Decide which the user wants (ask if unclear):
- **Add** — interview for new facts.
- **Review/edit** — show existing facts, let the user retire stale ones or add more.

## Add (interview)

**Prefer selectable options over open-ended questions.** At every step where you ask the
user something, use the `AskUserQuestion` tool to present a small set of concrete, tailored
choices. The user can always pick "Other" to type a custom answer, so options never trap
them — they just remove the blank-page friction. Fall back to a plain open question only
when options genuinely don't fit (e.g. "paste anything else I should know").

1. **Opening question (as options).** Ask what this is for via `AskUserQuestion` with a few
   likely domains as choices, e.g. *Code project · Legal matter · Finance/accounting ·
   Research · Personal/preferences* (plus the built-in custom "Other"). Tailor the options
   to any signal you already have (cwd, recent work).
2. **Pick the domain areas to capture (multi-select).** Right after the opening answer,
   call `AskUserQuestion` with **`multiSelect: true`** so the user checks every area worth
   capturing in one go. This MUST be multi-select — set the flag explicitly; do not present a
   single-select numbered list. Generate the areas yourself from the domain. Copy this shape
   and replace the options with domain-appropriate ones:

   ```json
   {
     "questions": [{
       "question": "Which areas should I capture must-know facts about?",
       "header": "Areas",
       "multiSelect": true,
       "options": [
         {"label": "Stack & architecture", "description": "Languages, frameworks, how it's structured"},
         {"label": "Deploy flow", "description": "How it ships, environments, gotchas"},
         {"label": "Conventions", "description": "Patterns and rules to follow"},
         {"label": "What must never break", "description": "Critical invariants"},
         {"label": "Who owns what", "description": "People, responsibilities, contacts"}
       ]
     }]
   }
   ```

   Area ideas per domain (generate, don't read verbatim):
   - a code repo → stack, deploy flow, gotchas, who owns what, conventions, what must never break
   - a legal matter → the client, the protective stance, deadlines, what must never be missed
   - a finance task → entities, accounts, period, reconciliation rules, sign-off
   - research → the question, the sources that matter, what conclusions are settled vs open
   "Other" (built in) carries any area you didn't list.
3. **Drill into each selected area, one at a time (as options).** For each area the user
   checked, ask a focused `AskUserQuestion` with concrete candidate answers drawn from that
   area — don't make the user free-type what you can offer as picks. Use `multiSelect` again
   when several answers apply at once; always let "Other" carry a custom response.
4. **Brain-dump escape hatch:** if the user says "just always remember X", capture it verbatim.
5. For each fact, settle:
   - **scope**: `project` (specific to this work) or `global` (true everywhere — who they are,
     preferences, how they like work done). Infer from the content; if ambiguous, ask via
     `AskUserQuestion` with `Project` / `Global` as the two choices.
   - a short **title** (≤ 8 words) — you write this; don't ask.

Keep facts atomic — one fact per write. Before writing, show the batch you're about to save
(title + scope + content) and confirm with the user — an `AskUserQuestion` with *Save all ·
Edit · Cancel* works well here.

## Writing a fact (worker HTTP)

claude-mem's MCP write tools require the server-beta runtime; locally we use the worker, so
write via its HTTP API. Resolve the worker URL from settings, then POST per fact:

```bash
DATA_DIR="${CLAUDE_MEM_DATA_DIR:-$HOME/.claude-mem}"
HOST=$(node -e "try{console.log(require('$DATA_DIR/settings.json').CLAUDE_MEM_WORKER_HOST||'127.0.0.1')}catch(e){console.log('127.0.0.1')}")
PORT=$(node -e "try{console.log(require('$DATA_DIR/settings.json').CLAUDE_MEM_WORKER_PORT||37701)}catch(e){console.log(37701)}")
curl -s -X POST "http://$HOST:$PORT/api/training/facts" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg cwd "$PWD" --arg scope "project" --arg title "Deploy flow" --arg content "Deploys via Coolify, not Vercel." \
        '{cwd:$cwd,scope:$scope,title:$title,content:$content}')"
```

Set `--arg scope` to `project` or `global`. A successful response is `{"ok":true,"id":N,"project":"..."}`.
Report the ids written.

## Review / edit

- List: `curl -s "http://$HOST:$PORT/api/training/facts?cwd=$PWD&scope=all"` → `{ok:true,facts:[...]}`.
  Each fact has `id`, `title`, `content`, `scope`, `project`. Present them grouped by scope.
- Retire: `curl -s -X POST "http://$HOST:$PORT/api/training/facts/<id>/retire"`. Let the user
  pick which to retire via an `AskUserQuestion` (`multiSelect`) listing the existing facts by
  title, rather than asking them to recall ids.
- To "edit": retire the old fact and add a corrected one (no in-place edit endpoint in v1).
- Dedup: before adding, compare titles against the existing list; skip near-duplicates.

## Make sure facts actually surface

Auto-surfacing requires semantic injection to be ON. Check it once per training session:

```bash
node -e "try{const s=require('${CLAUDE_MEM_DATA_DIR:-$HOME/.claude-mem}/settings.json');console.log('CLAUDE_MEM_SEMANTIC_INJECT='+s.CLAUDE_MEM_SEMANTIC_INJECT)}catch(e){console.log('unknown')}"
```

If it is not `true`, tell the user that must-know facts will be stored but won't auto-surface
until they enable `CLAUDE_MEM_SEMANTIC_INJECT=true` in `${CLAUDE_MEM_DATA_DIR}/settings.json`
(then restart the worker). Do NOT change the setting yourself unless they ask.

## Notes

- Global facts are stored under the reserved `__global__` project and are eligible in every
  project's lookup — but they still surface by **relevance**, not unconditionally.
- One fact per write; keep them short and declarative.
