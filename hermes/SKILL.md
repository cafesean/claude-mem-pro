# claude-mem-pro — Hermes Plugin Setup

Gives a Hermes agent persistent cross-session memory via the claude-mem-pro
worker: captures durable changes from runs, injects a recent-mutation digest
into new turns, and adds a `mem_recall` search tool.

## Install

```bash
git clone https://github.com/cafesean/claude-mem.git
cd claude-mem && npm run build
bash hermes/install.sh
```

This starts the worker (if needed), copies the plugin to
`~/.hermes/plugins/claude-mem-pro/`, and enables it.

## Config (optional)

`~/.hermes/config.yaml`:

```yaml
claude_mem:
  worker_host: 127.0.0.1
  worker_port: 37750   # default is 37700 + (uid % 100)
  project: hermes
```

`CLAUDE_MEM_WORKER_HOST` / `CLAUDE_MEM_WORKER_PORT` env vars override the config.

## How it works

| Hermes hook | claude-mem-pro action |
|---|---|
| `on_session_start` | reset per-session state |
| `pre_llm_call` | init session (first turn) + inject mutation digest into the user message |
| `post_tool_call` | record the tool call as an observation (mutation classified worker-side) |
| `post_llm_call` | stash the last assistant response |
| `on_session_end` | summarize the session |
| `mem_recall` tool | search past memory |

Memory is best-effort: if the worker is down, the agent runs normally and
context injection is simply skipped.
