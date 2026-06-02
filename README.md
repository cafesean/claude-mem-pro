# claude-mem-pro

**Durable, low-noise memory for Claude Code — capture what *changed*, recall it from your own artifacts.**

claude-mem-pro is a Claude Code plugin that gives your agent continuity across sessions
without drowning it in noise. Instead of recording every action the agent takes
and asking an LLM to compress the pile, claude-mem-pro records the **durable changes** a
session actually produced — file edits, external-system mutations (Notion / Jira /
Shopify / …), and git commits — and hands each new session a compact digest of
them. When you need deeper history, claude-mem-pro acts as a **librarian** over the
artifacts your project already keeps (CLAUDE.md, memory notes, specs, session
files) rather than a separate, ever-staling index.

> **Fork notice.** claude-mem-pro is a fork of [`thedotmack/claude-mem`](https://github.com/thedotmack/claude-mem)
> by Alex Newman, re-architected around a deterministic mutation log and an
> artifact-first recall model. It keeps claude-mem's worker/hook/SQLite foundation
> and the optional semantic search, and adds the three tracks described below.
> Huge credit to the upstream project — see [What's different](#whats-different-from-claude-mem).

---

## Contents

- [Quick Start](#quick-start)
- [Why claude-mem-pro](#why-claude-mem-pro)
- [What's different from claude-mem](#whats-different-from-claude-mem)
- [How it works](#how-it-works)
- [Recall: the librarian](#recall-the-librarian)
- [Search: semantic memory (optional)](#search-semantic-memory-optional)
- [Training: seed must-know facts](#training-seed-must-know-facts)
- [Integrations](#integrations)
- [Configuration](#configuration)
- [Privacy](#privacy)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Development](#development)
- [License & credit](#license--credit)

---

## Quick Start

claude-mem-pro installs as a Claude Code plugin from the `cafesean` marketplace:

```text
/plugin marketplace add cafesean/claude-mem-pro
/plugin install claude-mem-pro@cafesean
```

Restart Claude Code. That's it — durable changes are now captured automatically, and
every new session opens with a [mutation digest](#track-a4--inject-a-mutation-digest)
of what recently changed. Ask things like *"how did we do X last time?"* and the
[recall librarian](#recall-the-librarian) finds it in your project's artifacts.

> **Running it alongside upstream claude-mem?** Give claude-mem-pro its own data dir
> and worker port so the two don't share a database:
>
> ```bash
> export CLAUDE_MEM_DATA_DIR="$HOME/.claude-mem-pro"
> export CLAUDE_MEM_WORKER_PORT=37800
> ```
>
> Every path and port derives from those two variables. See [Configuration](#configuration).

Beyond Claude Code, claude-mem-pro also runs on **OpenClaw gateways** and **Hermes** —
see [Integrations](#integrations).

---

## Why claude-mem-pro

A memory system that captures *everything an agent does* fills up with noise: file
reads, scratch commands, dead-end exploration, build output. Compressing that noise with an
LLM produces plausible-sounding summaries of work that didn't matter, and injecting
those summaries back into new sessions wastes tokens and attention.

claude-mem-pro starts from a different premise: **the signal is the mutation.** What a
session is actually worth is the set of durable changes it left behind. Those are
cheap to capture deterministically (no LLM in the hot path), cheap to inject as a
digest, and they point straight at the real artifacts — your specs, your session
notes, your commits — where the *reasoning* already lives.

---

## What's different from claude-mem

| | claude-mem (upstream) | claude-mem-pro |
|---|---|---|
| **Capture** | Every tool call → LLM-compressed "observations" | Durable **mutations** only — repo writes, external-system MCP mutations, git commits. Deterministic classifier, **no LLM in the capture path** |
| **Inject** | A large observation + session-summary index dumped into each new session | A compact **mutation digest** — recent durable changes grouped by day, deduped, repo-relative paths — plus a pointer to recall |
| **Recall** | Semantic vector search over the observation corpus | A **librarian** that searches your project's own artifacts (CLAUDE.md → memory → specs → sessions) by authority + recency. Semantic search remains available as a complement |
| **Noise** | Reads/scratch recorded then filtered downstream | Reads/scratch/temp/build output never recorded |

The old behavior is still one env var away (`CLAUDE_MEM_INJECT_MODE=legacy`,
`CLAUDE_MEM_CAPTURE_OBSERVATIONS=true`) — see [Configuration](#configuration).

---

## How it works

claude-mem-pro runs as a set of Claude Code lifecycle hooks that talk to a small local
worker service (Bun-managed HTTP API) backed by SQLite. Three tracks define the
memory model:

### Track A — Capture: a mutation log, not an action log

On every `PostToolUse`, a pure classifier (`src/shared/mutation-filter.ts`,
`classifyToolCall()`) decides whether the call was a **durable mutation**:

1. **Deny first** — reads, `/tmp`, build output, and claude-mem-pro's own files (sessions,
   memory, `.cjs`) are dropped.
2. **Then allow** — writes to real repo paths, verb-matched mutating MCP tools
   (e.g. Notion/Jira/Shopify create/update/delete), and `git commit`.
3. **Config overrides** — explicit include/exclude lists win.

Matches are written to a lightweight, self-creating `mutations` table
(`MutationStore.ts`). There is **no LLM** in this path — it's a fast, deterministic
filter. External-system mutations are the key differentiator: a plain file watcher
can't see a Notion page update, but `PostToolUse` sees the tool call.

### Track A4 — Inject: a mutation digest

At `SessionStart`, claude-mem-pro renders a compact digest of recent mutations
(`src/services/context/MutationDigest.ts`): grouped by day, deduplicated, paths
stripped to repo-relative, git commits shown by their subject line. New sessions
open with a short, honest summary of *what recently changed* and a pointer to the
recall skill for anything deeper — not a wall of summarized activity.

### Track B — Recall: a librarian over your artifacts

claude-mem-pro doesn't hold your project's knowledge — your **artifacts** do. The `recall`
skill guides the agent to find past work where it actually lives, in authority
order:

1. **CLAUDE.md** (per repo) — standing rules / architecture
2. **Memory notes** — `~/.claude/projects/<project>/memory/*.md`
3. **Specs** — `_context/**/specs.md` (skipping `SUPERSEDED` / `PARKED`)
4. **Session files** — `_ai/sessions/*.md` (richest detail; self-contained `##` sections)

It opens the *exact section*, ranks by authority + recency, and reports **pointers,
not dumps**. Because it reads live files, it is never stale and needs no index.

---

## Recall: the librarian

Ask naturally and the `recall` skill fires:

- "How did we do X last time?"
- "What did we decide about Y?"
- "Where's the spec for Z?"
- "Have we hit this bug before?"
- "What changed last session?"

claude-mem-pro searches your durable artifacts, finds the matching `##` section, and
answers with a citation (`file:section`) and a short snippet — so you can drill in
at the source instead of trusting a lossy summary.

---

## Search: semantic memory (optional)

The upstream semantic-search path is preserved as a **complement** to recall. The
`mem-search` skill performs vector + full-text search over the observation corpus
via the worker's HTTP API, using a token-efficient 3-layer workflow:

1. **search** — compact index of hits with IDs
2. **timeline** — chronological context around a hit
3. **get_observations** — full detail for only the filtered IDs

Use **recall** for "what did we decide / change / learn" (deterministic, always
fresh). Use **mem-search** for fuzzy semantic lookups across a large corpus.
Semantic search requires Chroma (`uv`-provided Python); it can be disabled.

---

## Training: seed must-know facts

Capture and recall are both *passive* — they wait for work to happen. Sometimes you
already know the things an agent should never get wrong, and you want them on hand
*before* the system has observed anything. The `training` skill seeds them up front.

Run `/training` (or say "train the plugin", "teach you about this project"). It's
**not code-only** — the work might be a repo, a legal matter, a finance close, or a
research project. The skill runs a short interview built from selectable options
(with a custom "Other" fallback at every step):

1. **Pick the domain** — what this is for.
2. **Multi-select the areas** worth capturing (stack, deploy flow, conventions, what
   must never break, who owns what, …) — generated to fit the domain.
3. **Drill into each area**, one focused question at a time.
4. **Scope each fact** — `project` (specific to this work) or `global` (true
   everywhere — who you are, how you like work done).

Facts are stored as `must_know` observations in the same corpus. **Global** facts
live under a reserved `__global__` project and are made eligible in *every* project's
lookup, then surface by **relevance** (not pinned to every prompt). Re-run `/training`
any time to **review, add, or retire** facts.

Seeded facts **auto-surface** through the semantic-injection rail — which is gated by
`CLAUDE_MEM_SEMANTIC_INJECT` (see [Configuration](#configuration)). With it off, facts
are still stored and retrievable via recall / `mem-search`; with it on, the relevant
ones are injected into context as you work. Retiring a fact removes it from listings,
deletes its vector, and excludes it from search.

---

## Integrations

claude-mem-pro runs beyond a single Claude Code install. The worker, database, and
capture model are shared; each host wires into them differently.

### OpenClaw gateways ✅

claude-mem-pro ships a first-class [OpenClaw](https://openclaw.ai) gateway plugin
(`openclaw/`). It records observations from the gateway's embedded runner sessions,
injects cross-session context into each agent's system prompt via the
`before_prompt_build` hook (without overwriting `MEMORY.md`), and can stream a
real-time observation feed to Telegram, Discord, or Slack.

Install on a gateway by cloning the fork and running its installer:

```bash
git clone https://github.com/cafesean/claude-mem-pro.git
bash claude-mem-pro/openclaw/install.sh
```

The installer handles dependency checks (Bun, uv), plugin setup, AI-provider
configuration, worker startup, and optional feed wiring — interactively. See
`openclaw/SKILL.md` for the full setup guide and config schema.

> The upstream one-liner `curl -fsSL https://install.cmem.ai/openclaw.sh | bash`
> installs **upstream claude-mem**, not this fork. Use the fork's `openclaw/install.sh`
> above to deploy claude-mem-pro.

### Hermes ✅

claude-mem-pro ships a bundled [Hermes](https://github.com/NousResearch/hermes)
plugin (`hermes/`). It captures tool calls from Hermes runs, injects a recent-
mutation digest into each new turn (via the `pre_llm_call` hook, preserving the
prompt cache), and adds a `mem_recall` search tool — all talking to the same
worker, best-effort so it never blocks the agent.

```bash
git clone https://github.com/cafesean/claude-mem-pro.git
cd claude-mem-pro && npm run build
bash hermes/install.sh
```

See `hermes/SKILL.md` for config and the full hook map.

---

## Configuration

Settings live in `~/.claude-mem/settings.json` (auto-created with defaults) and can
be overridden by `CLAUDE_MEM_*` environment variables. The flags that define
claude-mem-pro's behavior:

| Variable | Default | Effect |
|---|---|---|
| `CLAUDE_MEM_CAPTURE_MUTATIONS` | `true` | Record durable mutations to the `mutations` table |
| `CLAUDE_MEM_CAPTURE_OBSERVATIONS` | `false` | Re-enable the legacy per-tool observation track (the old noise source) |
| `CLAUDE_MEM_INJECT_MODE` | `mutations` | `mutations` injects the digest; `legacy` injects the old observation/summary index |
| `CLAUDE_MEM_SEMANTIC_INJECT` | `false` | Inject the most relevant observations (incl. `/training` must-know facts) into each prompt by similarity |
| `CLAUDE_MEM_DATA_DIR` | `~/.claude-mem` | Root for db / chroma / logs / settings — set per profile to isolate accounts |
| `CLAUDE_MEM_WORKER_PORT` | `37700 + (uid % 100)` | Worker HTTP port (per-user by default; set explicitly for fixed ports) |
| `CLAUDE_MEM_MODEL` | `claude-haiku-4-5` | Model used for any LLM-assisted processing (not the capture path) |

To run claude-mem-pro and upstream claude-mem side by side, give each its own
`CLAUDE_MEM_DATA_DIR` and `CLAUDE_MEM_WORKER_PORT`. Every path and port derives from
those two variables.

---

## Privacy

Wrap anything sensitive in `<private>…</private>`. Tag stripping happens at the
**hook layer** (edge), before data ever reaches the worker or database — private
content is never stored. The deny-first mutation filter also means reads, temp
files, and build output are never captured in the first place.

---

## Architecture

- **Hooks** (`plugin/hooks/hooks.json`) — `Setup → SessionStart → UserPromptSubmit →
  PostToolUse` dispatch to the worker via `bun-runner.js`, invoking subcommands
  (`context`, `session-init`, `observation`, …).
- **Worker service** (`src/services/worker-service.ts`) — Bun-managed HTTP API on
  the per-user port; handles capture, digest rendering, and search.
- **Database** — SQLite at `~/.claude-mem/claude-mem.db`. Mutations live in the
  `mutations` table; the legacy observation corpus remains for `mem-search`.
- **Mutation classifier** — `src/shared/mutation-filter.ts` (`classifyToolCall()`).
- **Mutation digest** — `src/services/context/MutationDigest.ts`.
- **Skills** — `recall` (librarian), `mem-search` (semantic), `training` (seed
  must-know facts via `TrainingRoutes` → `src/services/training/`), plus workflow
  skills (`make-plan`, `do`, `learn-codebase`, `timeline-report`, …) under
  `plugin/skills/`.
- **Viewer UI** (`src/ui/viewer/`) — React interface served by the worker for
  browsing stored memory.

---

## Requirements

- **Node.js** 18+
- **Bun** — runtime and worker process manager (auto-installed if missing)
- **uv** — provides Python for Chroma vector search (auto-installed; only needed for `mem-search`)
- **Claude Code** with plugin support

---

## Development

```bash
npm run build-and-sync   # build, sync to the local marketplace, restart the worker
```

Source lives in `src/`; the built plugin lives in `plugin/`. The changelog is
generated automatically — no need to edit it.

---

## License & credit

claude-mem-pro is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE).

claude-mem-pro is a fork of **[claude-mem](https://github.com/thedotmack/claude-mem)** by
**Alex Newman** ([@thedotmack](https://github.com/thedotmack)), and inherits its
worker/hook/SQLite/semantic-search foundation. The mutation-log capture, digest
injection, and artifact-first recall model are claude-mem-pro's additions. All credit for
the original architecture goes upstream.

- **claude-mem-pro repository**: [github.com/cafesean/claude-mem-pro](https://github.com/cafesean/claude-mem-pro)
- **Upstream**: [github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)
- **Maintainer**: Sean Liao ([@cafesean](https://github.com/cafesean))
