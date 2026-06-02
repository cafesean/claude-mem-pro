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

1. Ask ONE universal opening question: **"What is this for — what are you working on here?"**
2. From their answer, generate domain-appropriate follow-ups (one at a time). Examples of
   *how* to probe (generate the actual questions yourself; do not read from a fixed list):
   - a code repo → stack, deploy flow, gotchas, who owns what, conventions, what must never break
   - a legal matter → the client, the protective stance, deadlines, what must never be missed
   - a finance task → entities, accounts, period, reconciliation rules, sign-off
   - research → the question, the sources that matter, what conclusions are settled vs open
3. **Brain-dump escape hatch:** if the user says "just always remember X", capture it verbatim.
4. For each fact, settle:
   - **scope**: `project` (specific to this work) or `global` (true everywhere — who they are,
     preferences, how they like work done). Infer from the content; only ask if ambiguous.
   - a short **title** (≤ 8 words).

Keep facts atomic — one fact per write. Confirm the batch with the user before writing.

## Writing a fact (worker HTTP)

claude-mem's MCP write tools require the server-beta runtime; locally we use the worker, so
write via its HTTP API. Resolve the worker URL from settings, then POST per fact:

```bash
DATA_DIR="${CLAUDE_MEM_DATA_DIR:-$HOME/.claude-mem}"
HOST=$(node -e "try{console.log(require('$DATA_DIR/settings.json').CLAUDE_MEM_WORKER_HOST||'127.0.0.1')}catch(e){console.log('127.0.0.1')}")
PORT=$(node -e "console.log(require('$DATA_DIR/settings.json').CLAUDE_MEM_WORKER_PORT)")
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
- Retire: `curl -s -X POST "http://$HOST:$PORT/api/training/facts/<id>/retire"`.
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
