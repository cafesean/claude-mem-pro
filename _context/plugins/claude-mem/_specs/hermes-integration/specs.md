# Hermes Integration for claude-mem-pro — Design Spec

- **Date:** 2026-05-31
- **Status:** APPROVED (design)
- **Author:** Sean Liao + Claude
- **Scope (approved):** Full parity minus the real-time observation feed. Bundled `hermes/` directory + `install.sh` packaging.
- **Related:** mirrors the existing `openclaw/` integration; session `sessions/2026-05-31-2140-mem-pro-readme-redo.md`.

## 1. Problem & Goal

claude-mem-pro currently gives persistent memory to Claude Code (plugin hooks) and
OpenClaw gateways (the `openclaw/` plugin). [Hermes](https://github.com/NousResearch/hermes)
— a separate Python agent — has no integration. The README lists it as "planned."

**Goal:** Give Hermes agents the same memory loop claude-mem-pro gives every other
host: capture durable changes from Hermes runs, inject a cross-session mutation
digest into new turns, and expose recall/search as a tool — without modifying the
Node worker and without replacing Hermes's own memory.

## 2. Key Findings (grounding)

### 2.1 The worker is host-agnostic (unchanged)
The OpenClaw plugin talks to the claude-mem-pro worker purely over HTTP. The Hermes
plugin reuses the **same endpoints**; all mutation classification stays worker-side.

| Purpose | Endpoint | Payload |
|---|---|---|
| Session init | `POST /api/sessions/init` | `{contentSessionId, project, prompt}` |
| Observation (capture) | `POST /api/sessions/observations` | `{contentSessionId, tool_name, tool_input, tool_response, cwd}` |
| Summarize | `POST /api/sessions/summarize` | `{contentSessionId, last_assistant_message}` |
| Context inject | `GET /api/context/inject?projects=<csv>` | → text (mutation digest) |
| Search | `GET /api/search/observations?query=&limit=` | → results |
| Timeline | `GET /api/timeline/by-query?query=&mode=auto&depth_before=&depth_after=` | → results |
| Health/readiness | `GET /api/health`, `GET /api/readiness` | → status |

Worker default port: `37700 + (uid % 100)` (per-user), overridable via
`CLAUDE_MEM_WORKER_PORT`. (Note: the OpenClaw plugin hardcodes legacy `37777`; the
Hermes plugin uses the per-user default and honors the env var.)

### 2.2 Hermes has a first-class plugin system
`hermes_cli/plugins.py`. Plugins are discovered from 4 sources: bundled
(`<repo>/plugins/<name>/`), user (`~/.hermes/plugins/<name>/`), project
(`./.hermes/plugins/<name>/`), and pip entry-points (`hermes_agent.plugins`).

A plugin is a directory with:
- `plugin.yaml` — `PluginManifest` (fields: `name`, `version`, `description`,
  `author`, `requires_env`, `provides_tools`, `provides_hooks`, `kind`). For an
  opt-in standalone plugin, `kind: standalone` (gated by `plugins.enabled`).
- `__init__.py` exposing `register(ctx: PluginContext)`.

`PluginContext` API (verified, `hermes_cli/plugins.py`):
- `register_hook(hook_name: str, callback: Callable)`
- `register_tool(name, toolset, schema, handler, check_fn=None, requires_env=None, is_async=False, description="", emoji="")`
- `register_command(name, handler, description="", args_hint="")` — slash command, `fn(raw_args: str) -> str | None`

### 2.3 Relevant hooks (`VALID_HOOKS`)
- `on_session_start` — session init.
- `post_tool_call` — fired after a tool result is available → **capture chokepoint**.
- `pre_llm_call` — fired once per turn before the tool loop. Returning a dict with a
  `"context"` key (or a plain string) injects into the **current turn's user
  message** (NOT the system prompt — preserves prompt cache). → **inject path**.
- `on_session_end` — session teardown → summarize.

Exact callback kwargs are confirmed during implementation by reading the
`invoke_hook(...)` call sites in `run_agent.py` (e.g. `pre_llm_call` at ~10655 passes
`session_id, user_message, conversation_history, is_first_turn, model, platform,
sender_id`). Handlers accept `**kwargs` defensively so signature drift never breaks.

### 2.4 Why hooks, not the MemoryProvider ABC
Hermes's `memory` plugin category is `kind: exclusive` (one active provider, selected
via `memory.provider`). Implementing claude-mem-pro as a `MemoryProvider` would make
it compete with Hermes's own memory and inject via the system prompt. The hook path
(`pre_llm_call`/`post_tool_call`) is non-invasive and lets claude-mem-pro **coexist**
with whatever memory provider Hermes already uses. → standalone plugin via hooks.

## 3. Architecture

The Node worker is unchanged. The Hermes plugin is pure Python that talks to the
worker over HTTP — same strategy as the OpenClaw plugin.

```
Hermes run loop                      claude-mem-pro worker (Node, HTTP, SQLite)
───────────────                      ──────────────────────────────────────────
on_session_start  ──init──────────►  /api/sessions/init
(each tool result)
post_tool_call    ──observe (F&F)─►  /api/sessions/observations  ─► mutation classifier
pre_llm_call      ──context(60s$)─►  /api/context/inject         ◄─ mutation digest
   └─ returns {"context": digest} → injected into the turn's user message
on_session_end    ──summarize─────►  /api/sessions/summarize
mem_recall tool   ──search/timeline► /api/search/observations, /api/timeline/by-query
```

## 4. Components

### `hermes/plugin/plugin.yaml`
Manifest. `name: claude-mem-pro`, `kind: standalone`,
`provides_hooks: [on_session_start, post_tool_call, pre_llm_call, on_session_end]`,
`provides_tools: [mem_recall]`, `version` synced to package.json.

### `hermes/plugin/__init__.py` — `register(ctx)`
Thin wiring only. Instantiates a `WorkerClient` from resolved config, then:
- `ctx.register_hook("on_session_start", on_session_start)`
- `ctx.register_hook("post_tool_call", on_post_tool_call)`
- `ctx.register_hook("pre_llm_call", on_pre_llm_call)`
- `ctx.register_hook("on_session_end", on_session_end)`
- `ctx.register_tool("mem_recall", toolset="memory", schema=…, handler=…, description=…)`

All handlers take `**kwargs`, do minimal shaping, delegate to `WorkerClient`, and
**never raise** into the agent.

Behavior details:
- **on_session_start**: derive `contentSessionId` + `project`, call `client.init(...)`.
- **on_post_tool_call**: skip our own tools (name starts with `mem_`); truncate
  `tool_response` to ~1000 chars; fire-and-forget `client.observe(...)`.
- **on_pre_llm_call**: `client.context(projects)`; return `{"context": digest}` when
  non-empty, else `None`. 60s in-process cache keyed by project set.
- **on_session_end**: extract last assistant message; `client.summarize(...)`.
- **mem_recall(query, limit=10)**: `client.search(...)` (+ optional timeline);
  returns a compact text/JSON result for the model.

### `hermes/plugin/worker_client.py`
HTTP client + resilience. Mirrors OpenClaw's `workerPost`/`workerGetText` + circuit
breaker:
- `init`, `observe` (fire-and-forget, non-blocking), `summarize`, `context`,
  `search`, `timeline`, `health`.
- Short timeout (~1.5s). 3-strike circuit breaker → 30s cooldown → half-open probe.
- Every method wrapped: failures are logged at debug and swallowed. `context()`
  returns `""` on any failure; capture calls return silently.
- Uses stdlib `urllib`/`http.client` or `httpx` if already a Hermes dep — chosen at
  implementation time to avoid adding a dependency.

### `hermes/plugin/config.py`
- Resolve `worker_host` (default `127.0.0.1`), `worker_port`
  (`CLAUDE_MEM_WORKER_PORT` env → else `37700 + uid%100`), `project` (default
  `hermes`). Precedence: `CLAUDE_MEM_*` env → `claude_mem:` block in Hermes config →
  defaults.
- `content_session_id(session_id) -> "hermes-<session_id>"` (stable mapping).

### `hermes/install.sh` (mirrors `openclaw/install.sh`)
1. Verify/install Bun + uv.
2. Locate an existing claude-mem-pro install or `git clone https://github.com/cafesean/claude-mem.git`.
3. Start/verify the worker (`plugin/scripts/worker-service.cjs`), poll
   `/api/health` then `/api/readiness`.
4. Copy `hermes/plugin/` → `~/.hermes/plugins/claude-mem-pro/`.
5. `hermes plugins enable claude-mem-pro` (and add to `plugins.enabled`).
6. Write a `claude_mem:` config block (host/port/project) into Hermes config.
7. Print next steps. `--non-interactive` and `--upgrade` flags like the OpenClaw one.

### `hermes/SKILL.md` / `hermes/README.md`
Setup guide + config schema, mirroring `openclaw/SKILL.md`.

## 5. Error Handling

Memory is **best-effort and never fatal**. If the worker is down, unreachable, or
slow: capture is dropped (fire-and-forget), inject returns `""` (no context added),
the recall tool returns a friendly "memory unavailable" message, and the circuit
breaker prevents repeated slow calls from degrading turn latency. The Hermes agent
runs identically with or without the worker.

## 6. Testing

- **pytest unit tests** (`hermes/tests/`), mocked HTTP — no live worker:
  - `worker_client`: each endpoint's request shape; circuit-breaker open/half/close;
    timeout → swallow; `context()` returns `""` on error.
  - `config`: env vs config-block vs default precedence; per-uid port; session-id map.
  - hooks: `on_post_tool_call` skips `mem_*` + truncates; `on_pre_llm_call` returns
    `{"context": …}` only when non-empty + cache TTL; `on_session_start/end` payloads;
    `mem_recall` handler output shape. All with a mocked `WorkerClient`/`ctx`.
- **Install smoke test** (`hermes/test-install.sh`, optional) mirroring
  `openclaw/test-install.sh`: dry-run the installer steps where feasible.
- **Manual e2e** (documented, not CI): start worker, run a Hermes turn, confirm an
  observation row + a non-empty digest on the next turn.

## 7. Documentation

Flip the README `## Integrations` → Hermes entry from "planned 🛣️" to supported ✅
with the install one-liner and a pointer to `hermes/SKILL.md`. Add Hermes to
`CLAUDE.md`'s integration list.

## 8. Out of Scope (YAGNI for v1)

- Real-time observation feed to Hermes messaging channels.
- `MemoryProvider` backend path / system-prompt injection.
- Slash commands beyond the single `mem_recall` tool.
- pip entry-point distribution (bundled dir + install.sh chosen instead).
- Changes to the Node worker.

## 9. File Manifest (new)

```
hermes/plugin/plugin.yaml
hermes/plugin/__init__.py
hermes/plugin/worker_client.py
hermes/plugin/config.py
hermes/install.sh
hermes/tests/test_worker_client.py
hermes/tests/test_config.py
hermes/tests/test_hooks.py
hermes/SKILL.md
hermes/README.md
```
Edits: `README.md` (Integrations), `CLAUDE.md` (integration list).
