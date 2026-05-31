# Hermes Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bundled Hermes plugin (`hermes/`) that gives Hermes agents claude-mem-pro memory — capture tool calls, inject a cross-session mutation digest, and expose a recall tool — by talking to the existing Node worker over HTTP.

**Architecture:** Pure-Python Hermes plugin (no new runtime deps — stdlib `urllib`). A `WorkerClient` wraps the worker's HTTP API with short timeouts + a circuit breaker; all calls are best-effort and never raise into the agent. `register(ctx)` wires five Hermes hooks (`on_session_start`, `pre_llm_call`, `post_tool_call`, `post_llm_call`, `on_session_end`) plus one `mem_recall` tool. The Node worker is unchanged; mutation classification stays worker-side.

**Tech Stack:** Python 3 (stdlib only), pytest, Hermes plugin system (`hermes_cli/plugins.py`), bash installer mirroring `openclaw/install.sh`.

---

## Verified host facts (do not re-derive)

Hermes hook kwargs (from `run_agent.py` / `hermes_cli/hooks.py`), handlers MUST accept `**_`:
- `on_session_start(session_id, model, platform)`
- `pre_llm_call(session_id, user_message, conversation_history, is_first_turn, model, platform, sender_id)` → return `{"context": str}` to inject into the turn's user message; `None`/empty = no injection.
- `post_tool_call(tool_name, args, result, task_id, session_id, tool_call_id, duration_ms)` — note keys are `args` and `result`.
- `post_llm_call(session_id, user_message, assistant_response, conversation_history, model, platform)`
- `on_session_end(session_id, completed, interrupted, model, platform)` — **no message kwarg**; capture the last response in `post_llm_call`.

`PluginContext` API: `register_hook(name, callback)`, `register_tool(name, toolset, schema, handler, check_fn=None, requires_env=None, is_async=False, description="", emoji="")`, `register_command(name, handler, description="", args_hint="")`.

Tool schema shape: `{"name", "description", "parameters": {json-schema}}`. Handler: `def h(args: dict, **kw) -> str`.

`plugin.yaml` fields: `name, version, description, author, kind, provides_tools, hooks`.

Worker endpoints (unchanged): `POST /api/sessions/init {contentSessionId, project, prompt}`, `POST /api/sessions/observations {contentSessionId, tool_name, tool_input, tool_response, cwd}`, `POST /api/sessions/summarize {contentSessionId, last_assistant_message}`, `GET /api/context/inject?projects=<csv>` → text, `GET /api/search/observations?query=&limit=` → text, `GET /api/health`, `GET /api/readiness`.

**Note (refines spec §4):** session init happens lazily on the first `pre_llm_call` (so the real prompt is captured), guarded by a seen-sessions set; `on_session_start` only resets per-session state. Summarize uses the last response stashed by `post_llm_call`. This is why we wire 5 hooks, not 4 — update `provides_hooks` accordingly.

Run all pytest from the repo root with: `python3 -m pytest hermes/tests/ -v`.

---

## Task 1: Config resolution

**Files:**
- Create: `hermes/plugin/__init__.py` (empty package marker for now — will be filled in Task 4; create as empty file so `hermes.plugin` is importable)
- Create: `hermes/plugin/config.py`
- Test: `hermes/tests/test_config.py`
- Create: `hermes/tests/__init__.py` (empty)

- [ ] **Step 1: Write the failing test**

```python
# hermes/tests/test_config.py
import os
import pytest
from hermes.plugin import config


def test_defaults(monkeypatch):
    monkeypatch.delenv("CLAUDE_MEM_WORKER_HOST", raising=False)
    monkeypatch.delenv("CLAUDE_MEM_WORKER_PORT", raising=False)
    monkeypatch.delenv("CLAUDE_MEM_PROJECT", raising=False)
    cfg = config.resolve_config(None)
    assert cfg["host"] == "127.0.0.1"
    assert cfg["port"] == 37700 + (os.getuid() % 100)
    assert cfg["project"] == "hermes"


def test_env_overrides_config_block(monkeypatch):
    monkeypatch.setenv("CLAUDE_MEM_WORKER_PORT", "37800")
    monkeypatch.setenv("CLAUDE_MEM_WORKER_HOST", "10.0.0.5")
    block = {"claude_mem": {"worker_port": 1, "worker_host": "x", "project": "proj"}}
    cfg = config.resolve_config(block)
    assert cfg["port"] == 37800
    assert cfg["host"] == "10.0.0.5"
    assert cfg["project"] == "proj"  # project not set in env -> from block


def test_config_block_used_when_no_env(monkeypatch):
    monkeypatch.delenv("CLAUDE_MEM_WORKER_PORT", raising=False)
    monkeypatch.delenv("CLAUDE_MEM_WORKER_HOST", raising=False)
    monkeypatch.delenv("CLAUDE_MEM_PROJECT", raising=False)
    block = {"claude_mem": {"worker_port": 40000, "project": "myproj"}}
    cfg = config.resolve_config(block)
    assert cfg["port"] == 40000
    assert cfg["project"] == "myproj"


def test_content_session_id():
    assert config.content_session_id("abc") == "hermes-abc"
    assert config.content_session_id("") == "hermes-unknown"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest hermes/tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'hermes.plugin.config'` (after creating empty `hermes/plugin/__init__.py` and `hermes/tests/__init__.py`, it becomes `AttributeError`/import error for `config`).

- [ ] **Step 3: Write minimal implementation**

```python
# hermes/plugin/config.py
"""Resolve claude-mem-pro worker connection settings for the Hermes plugin.

Precedence: CLAUDE_MEM_* env vars -> ``claude_mem:`` block in Hermes config
-> built-in defaults. Port default matches the worker's per-user scheme.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PROJECT = "hermes"


def default_port() -> int:
    return 37700 + (os.getuid() % 100)


def resolve_config(hermes_config: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    block = {}
    if isinstance(hermes_config, dict):
        maybe = hermes_config.get("claude_mem")
        if isinstance(maybe, dict):
            block = maybe

    host = os.environ.get("CLAUDE_MEM_WORKER_HOST") or block.get("worker_host") or DEFAULT_HOST
    port_raw = os.environ.get("CLAUDE_MEM_WORKER_PORT") or block.get("worker_port")
    port = int(port_raw) if port_raw not in (None, "") else default_port()
    project = os.environ.get("CLAUDE_MEM_PROJECT") or block.get("project") or DEFAULT_PROJECT
    return {"host": host, "port": int(port), "project": project}


def content_session_id(session_id: str) -> str:
    return f"hermes-{session_id}" if session_id else "hermes-unknown"
```

Also create empty files:
```bash
mkdir -p hermes/plugin hermes/tests
touch hermes/plugin/__init__.py hermes/tests/__init__.py
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest hermes/tests/test_config.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add hermes/plugin/__init__.py hermes/plugin/config.py hermes/tests/__init__.py hermes/tests/test_config.py
git commit -m "feat(hermes): worker connection config resolution"
```

---

## Task 2: WorkerClient + circuit breaker

**Files:**
- Create: `hermes/plugin/worker_client.py`
- Test: `hermes/tests/test_worker_client.py`

- [ ] **Step 1: Write the failing test**

```python
# hermes/tests/test_worker_client.py
from hermes.plugin.worker_client import WorkerClient, CircuitBreaker


class FakeClock:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t


def make_http(calls, responses):
    """responses: list of (status, text) or Exception to raise, consumed in order."""
    def http(method, url, body, timeout):
        calls.append((method, url, body, timeout))
        r = responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r
    return http


def test_get_context_success():
    calls = []
    c = WorkerClient("h", 1, "proj", http_fn=make_http(calls, [(200, "  digest text  ")]))
    assert c.context(["hermes"]) == "digest text"
    assert calls[0][0] == "GET"
    assert "/api/context/inject?projects=hermes" in calls[0][1]


def test_context_empty_on_error():
    c = WorkerClient("h", 1, "proj", http_fn=make_http([], [RuntimeError("down")]))
    assert c.context(["hermes"]) == ""


def test_init_posts_expected_payload():
    calls = []
    c = WorkerClient("h", 2, "proj", http_fn=make_http(calls, [(200, "{}")]))
    c.init("hermes-x", prompt="hello")
    method, url, body, _ = calls[0]
    assert method == "POST"
    assert url.endswith("/api/sessions/init")
    assert body == {"contentSessionId": "hermes-x", "project": "proj", "prompt": "hello"}


def test_observe_posts_expected_payload():
    calls = []
    c = WorkerClient("h", 2, "proj", http_fn=make_http(calls, [(200, "{}")]))
    c.observe("hermes-x", "write_file", {"path": "/a"}, "ok", cwd="/repo")
    _, url, body, _ = calls[0]
    assert url.endswith("/api/sessions/observations")
    assert body == {"contentSessionId": "hermes-x", "tool_name": "write_file",
                    "tool_input": {"path": "/a"}, "tool_response": "ok", "cwd": "/repo"}


def test_non_2xx_returns_none():
    c = WorkerClient("h", 1, "proj", http_fn=make_http([], [(500, "err")]))
    assert c.context(["hermes"]) == ""  # context coerces None -> ""


def test_circuit_breaker_opens_and_half_opens():
    clock = FakeClock()
    cb = CircuitBreaker(threshold=2, cooldown=30.0, now=clock)
    assert cb.allow() is True
    cb.record_failure(); assert cb.allow() is True   # 1 failure
    cb.record_failure(); assert cb.allow() is False   # threshold reached -> open
    clock.t = 31.0
    assert cb.allow() is True                          # half-open after cooldown
    cb.record_success(); assert cb.allow() is True     # closed


def test_breaker_blocks_calls_when_open():
    calls = []
    cb = CircuitBreaker(threshold=1, cooldown=999, now=FakeClock())
    c = WorkerClient("h", 1, "proj", http_fn=make_http(calls, [RuntimeError("x")]), breaker=cb)
    c.context(["hermes"])         # 1st call fails -> opens
    c.context(["hermes"])         # blocked, no http call
    assert len(calls) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest hermes/tests/test_worker_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'hermes.plugin.worker_client'`

- [ ] **Step 3: Write minimal implementation**

```python
# hermes/plugin/worker_client.py
"""Best-effort HTTP client for the claude-mem-pro worker.

Every call is wrapped: timeouts and errors are swallowed (logged at debug),
guarded by a circuit breaker so a down worker never adds latency or raises
into the Hermes agent.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.request
from typing import Any, Callable, List, Optional
from urllib.parse import quote

logger = logging.getLogger(__name__)


class CircuitBreaker:
    def __init__(self, threshold: int = 3, cooldown: float = 30.0,
                 now: Callable[[], float] = time.monotonic):
        self.threshold = threshold
        self.cooldown = cooldown
        self._now = now
        self.failures = 0
        self.opened_at: Optional[float] = None

    def allow(self) -> bool:
        if self.opened_at is None:
            return True
        if self._now() - self.opened_at >= self.cooldown:
            return True  # half-open: allow a single probe
        return False

    def record_success(self) -> None:
        self.failures = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.failures += 1
        if self.failures >= self.threshold:
            self.opened_at = self._now()


def _urllib_http(method: str, url: str, body: Optional[dict], timeout: float):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return getattr(resp, "status", resp.getcode()), resp.read().decode("utf-8", "replace")


class WorkerClient:
    def __init__(self, host: str, port: int, project: str, timeout: float = 1.5,
                 http_fn: Optional[Callable] = None, breaker: Optional[CircuitBreaker] = None):
        self.host = host
        self.port = port
        self.project = project
        self.timeout = timeout
        self._http = http_fn or _urllib_http
        self._breaker = breaker or CircuitBreaker()

    def _base(self) -> str:
        return f"http://{self.host}:{self.port}"

    def _call(self, method: str, path: str, body: Optional[dict] = None) -> Optional[str]:
        if not self._breaker.allow():
            return None
        try:
            status, text = self._http(method, self._base() + path, body, self.timeout)
        except Exception as exc:  # noqa: BLE001 — best-effort, never propagate
            self._breaker.record_failure()
            logger.debug("worker %s %s failed: %s", method, path, exc)
            return None
        if 200 <= status < 300:
            self._breaker.record_success()
            return text
        self._breaker.record_failure()
        return None

    # --- write path ---
    def init(self, content_session_id: str, prompt: str = "") -> None:
        self._call("POST", "/api/sessions/init", {
            "contentSessionId": content_session_id,
            "project": self.project,
            "prompt": prompt,
        })

    def observe(self, content_session_id: str, tool_name: str, tool_input: Any,
                tool_response: str, cwd: str = "") -> None:
        self._call("POST", "/api/sessions/observations", {
            "contentSessionId": content_session_id,
            "tool_name": tool_name,
            "tool_input": tool_input,
            "tool_response": tool_response,
            "cwd": cwd,
        })

    def summarize(self, content_session_id: str, last_assistant_message: str) -> None:
        self._call("POST", "/api/sessions/summarize", {
            "contentSessionId": content_session_id,
            "last_assistant_message": last_assistant_message,
        })

    # --- read path ---
    def context(self, projects: List[str]) -> str:
        csv = ",".join(projects)
        text = self._call("GET", f"/api/context/inject?projects={quote(csv)}")
        return (text or "").strip()

    def search(self, query: str, limit: int = 10) -> str:
        text = self._call("GET", f"/api/search/observations?query={quote(query)}&limit={int(limit)}")
        return text or ""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest hermes/tests/test_worker_client.py -v`
Expected: PASS (8 passed)

- [ ] **Step 5: Commit**

```bash
git add hermes/plugin/worker_client.py hermes/tests/test_worker_client.py
git commit -m "feat(hermes): resilient worker HTTP client + circuit breaker"
```

---

## Task 3: Hooks + recall tool (plugin behavior)

**Files:**
- Create: `hermes/plugin/integration.py` (hook handlers + tool, all logic; `__init__.py` stays a thin wirer)
- Test: `hermes/tests/test_integration.py`

- [ ] **Step 1: Write the failing test**

```python
# hermes/tests/test_integration.py
from hermes.plugin import integration


class FakeClient:
    def __init__(self):
        self.inits = []; self.observes = []; self.summaries = []
        self.context_return = "DIGEST"
        self.search_return = "RESULTS"
    def init(self, csid, prompt=""): self.inits.append((csid, prompt))
    def observe(self, csid, tool_name, tool_input, tool_response, cwd=""):
        self.observes.append((csid, tool_name, tool_input, tool_response, cwd))
    def summarize(self, csid, msg): self.summaries.append((csid, msg))
    def context(self, projects): return self.context_return
    def search(self, query, limit=10): return self.search_return


def make_integration():
    fake = FakeClient()
    # run submitted (fire-and-forget) work synchronously in tests
    integ = integration.Integration(client=fake, project="hermes", submit=lambda fn: fn())
    return integ, fake


def test_pre_llm_call_inits_once_and_injects():
    integ, fake = make_integration()
    out1 = integ.pre_llm_call(session_id="s1", user_message="hi", is_first_turn=True)
    out2 = integ.pre_llm_call(session_id="s1", user_message="again", is_first_turn=False)
    assert fake.inits == [("hermes-s1", "hi")]          # init exactly once
    assert out1 == {"context": "DIGEST"}
    assert out2 == {"context": "DIGEST"}


def test_pre_llm_call_no_context_returns_none():
    integ, fake = make_integration()
    fake.context_return = ""
    assert integ.pre_llm_call(session_id="s1", user_message="hi", is_first_turn=True) is None


def test_post_tool_call_records_and_truncates():
    integ, fake = make_integration()
    big = "x" * 5000
    integ.post_tool_call(tool_name="write_file", args={"path": "/a"}, result=big,
                         session_id="s1")
    csid, name, tin, tresp, cwd = fake.observes[0]
    assert csid == "hermes-s1" and name == "write_file" and tin == {"path": "/a"}
    assert len(tresp) == integration.MAX_RESPONSE_CHARS


def test_post_tool_call_skips_own_tools():
    integ, fake = make_integration()
    integ.post_tool_call(tool_name="mem_recall", args={}, result="x", session_id="s1")
    assert fake.observes == []


def test_summarize_on_session_end_uses_last_response():
    integ, fake = make_integration()
    integ.post_llm_call(session_id="s1", assistant_response="final answer")
    integ.on_session_end(session_id="s1")
    assert fake.summaries == [("hermes-s1", "final answer")]


def test_session_start_resets_init_flag():
    integ, fake = make_integration()
    integ.pre_llm_call(session_id="s1", user_message="a", is_first_turn=True)
    integ.on_session_start(session_id="s1")
    integ.pre_llm_call(session_id="s1", user_message="b", is_first_turn=True)
    assert fake.inits == [("hermes-s1", "a"), ("hermes-s1", "b")]  # re-init after reset


def test_mem_recall_tool_handler():
    integ, fake = make_integration()
    out = integ.mem_recall({"query": "auth bug", "limit": 5})
    assert out == "RESULTS"
    out_empty = integ.mem_recall({"query": ""})
    assert "query" in out_empty.lower()  # friendly error
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest hermes/tests/test_integration.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'hermes.plugin.integration'`

- [ ] **Step 3: Write minimal implementation**

```python
# hermes/plugin/integration.py
"""Hook handlers + recall tool for the claude-mem-pro Hermes plugin.

All worker I/O is best-effort. Write-path calls are submitted via ``submit``
(a thread by default) so they never block a turn; read-path (context) runs
inline with the worker's short timeout + circuit breaker.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Callable, Dict, Optional

from .config import content_session_id
from .worker_client import WorkerClient

logger = logging.getLogger(__name__)

MAX_RESPONSE_CHARS = 1000

MEM_RECALL_SCHEMA = {
    "name": "mem_recall",
    "description": (
        "Search claude-mem-pro cross-session memory for past work — decisions, "
        "fixes, and changes from previous sessions. Use when asked 'how did we do "
        "X', 'did we already solve Y', or 'what changed last time'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What to search memory for"},
            "limit": {"type": "integer", "description": "Max results (default 10)"},
        },
        "required": ["query"],
    },
}


def _default_submit(fn: Callable[[], None]) -> None:
    threading.Thread(target=fn, daemon=True).start()


class Integration:
    def __init__(self, client: WorkerClient, project: str,
                 submit: Callable[[Callable[[], None]], None] = _default_submit):
        self._client = client
        self._project = project
        self._submit = submit
        self._inited: set[str] = set()
        self._last_response: Dict[str, str] = {}
        self._lock = threading.Lock()

    def _projects(self) -> list[str]:
        return [self._project]

    # --- hooks ---
    def on_session_start(self, session_id: str = "", **_: Any) -> None:
        with self._lock:
            self._inited.discard(session_id)
            self._last_response.pop(session_id, None)

    def pre_llm_call(self, session_id: str = "", user_message: str = "",
                     is_first_turn: bool = False, **_: Any) -> Optional[Dict[str, str]]:
        csid = content_session_id(session_id)
        with self._lock:
            need_init = session_id not in self._inited
            if need_init:
                self._inited.add(session_id)
        if need_init:
            prompt = user_message
            self._submit(lambda: self._client.init(csid, prompt))
        digest = self._client.context(self._projects())
        return {"context": digest} if digest else None

    def post_tool_call(self, tool_name: str = "", args: Any = None, result: Any = None,
                       session_id: str = "", **_: Any) -> None:
        if not tool_name or tool_name.startswith("mem_"):
            return
        csid = content_session_id(session_id)
        resp = result if isinstance(result, str) else str(result)
        resp = resp[:MAX_RESPONSE_CHARS]
        tool_input = args if isinstance(args, dict) else {}
        self._submit(lambda: self._client.observe(csid, tool_name, tool_input, resp))

    def post_llm_call(self, session_id: str = "", assistant_response: str = "", **_: Any) -> None:
        if assistant_response:
            with self._lock:
                self._last_response[session_id] = assistant_response

    def on_session_end(self, session_id: str = "", **_: Any) -> None:
        csid = content_session_id(session_id)
        with self._lock:
            msg = self._last_response.pop(session_id, "")
            self._inited.discard(session_id)
        if msg:
            self._submit(lambda: self._client.summarize(csid, msg))

    # --- tool ---
    def mem_recall(self, args: dict, **_: Any) -> str:
        query = str((args or {}).get("query") or "").strip()
        if not query:
            return "mem_recall: 'query' is required."
        limit = int((args or {}).get("limit") or 10)
        result = self._client.search(query, limit=limit)
        return result or "No matching memory found (or memory worker unavailable)."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest hermes/tests/test_integration.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add hermes/plugin/integration.py hermes/tests/test_integration.py
git commit -m "feat(hermes): capture/inject hooks + mem_recall tool"
```

---

## Task 4: Plugin manifest + register() wiring

**Files:**
- Modify: `hermes/plugin/__init__.py` (was empty; add `register`)
- Create: `hermes/plugin/plugin.yaml`
- Test: `hermes/tests/test_register.py`

- [ ] **Step 1: Write the failing test**

```python
# hermes/tests/test_register.py
from hermes.plugin import register


class RecordingCtx:
    def __init__(self):
        self.hooks = {}; self.tools = []
    def register_hook(self, name, cb): self.hooks[name] = cb
    def register_tool(self, **kw): self.tools.append(kw)


def test_register_wires_hooks_and_tool(monkeypatch):
    ctx = RecordingCtx()
    register(ctx)
    for h in ("on_session_start", "pre_llm_call", "post_tool_call",
              "post_llm_call", "on_session_end"):
        assert h in ctx.hooks and callable(ctx.hooks[h])
    assert len(ctx.tools) == 1
    assert ctx.tools[0]["name"] == "mem_recall"
    assert ctx.tools[0]["toolset"] == "memory"


def test_manifest_matches_wiring():
    import yaml, pathlib
    p = pathlib.Path(__file__).parent.parent / "plugin" / "plugin.yaml"
    meta = yaml.safe_load(p.read_text())
    assert meta["name"] == "claude-mem-pro"
    assert meta["kind"] == "standalone"
    assert set(meta["hooks"]) == {"on_session_start", "pre_llm_call",
                                  "post_tool_call", "post_llm_call", "on_session_end"}
    assert meta["provides_tools"] == ["mem_recall"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest hermes/tests/test_register.py -v`
Expected: FAIL — `ImportError: cannot import name 'register'` and missing `plugin.yaml`.

- [ ] **Step 3: Write minimal implementation**

```python
# hermes/plugin/__init__.py
"""claude-mem-pro Hermes plugin — persistent memory via the claude-mem-pro worker.

register() is the entry point Hermes calls. It resolves config, builds the
WorkerClient + Integration, and wires hooks + the mem_recall tool.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def register(ctx) -> None:
    from .config import resolve_config
    from .worker_client import WorkerClient
    from .integration import Integration, MEM_RECALL_SCHEMA

    hermes_config = None
    try:
        from hermes_cli.config import load_config  # type: ignore
        hermes_config = load_config()
    except Exception as exc:  # noqa: BLE001 — config is optional
        logger.debug("claude-mem-pro: could not load Hermes config: %s", exc)

    cfg = resolve_config(hermes_config)
    client = WorkerClient(cfg["host"], cfg["port"], cfg["project"])
    integ = Integration(client, cfg["project"])

    ctx.register_hook("on_session_start", integ.on_session_start)
    ctx.register_hook("pre_llm_call", integ.pre_llm_call)
    ctx.register_hook("post_tool_call", integ.post_tool_call)
    ctx.register_hook("post_llm_call", integ.post_llm_call)
    ctx.register_hook("on_session_end", integ.on_session_end)
    ctx.register_tool(
        name="mem_recall",
        toolset="memory",
        schema=MEM_RECALL_SCHEMA,
        handler=integ.mem_recall,
        description="Search claude-mem-pro cross-session memory.",
        emoji="🧠",
    )
    logger.info("claude-mem-pro: wired memory hooks + mem_recall (worker %s:%s, project=%s)",
                cfg["host"], cfg["port"], cfg["project"])
```

```yaml
# hermes/plugin/plugin.yaml
name: claude-mem-pro
version: 13.3.0
description: "Persistent cross-session memory via the claude-mem-pro worker. Captures durable changes from Hermes runs, injects a recent-mutation digest into new turns, and exposes a mem_recall search tool. Talks to the worker over HTTP; best-effort and never blocks the agent."
author: "cafesean (claude-mem-pro), forked from thedotmack/claude-mem"
kind: standalone
provides_tools:
  - mem_recall
hooks:
  - on_session_start
  - pre_llm_call
  - post_tool_call
  - post_llm_call
  - on_session_end
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest hermes/tests/test_register.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Run the whole suite + commit**

Run: `python3 -m pytest hermes/tests/ -v`
Expected: PASS (all tasks' tests green)

```bash
git add hermes/plugin/__init__.py hermes/plugin/plugin.yaml hermes/tests/test_register.py
git commit -m "feat(hermes): plugin manifest + register() wiring"
```

---

## Task 5: Installer

**Files:**
- Create: `hermes/install.sh`

- [ ] **Step 1: Write the installer**

```bash
#!/usr/bin/env bash
# Install the claude-mem-pro plugin into a Hermes agent.
# Mirrors openclaw/install.sh: ensure deps + worker, drop the plugin, enable it.
set -euo pipefail

REPO_URL="https://github.com/cafesean/claude-mem.git"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
PLUGIN_DST="${HERMES_HOME}/plugins/claude-mem-pro"
NON_INTERACTIVE="${1:-}"

log() { printf '  \033[36m›\033[0m %s\n' "$*"; }
err() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }

# 1. locate this repo (script lives in <repo>/hermes/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ ! -f "${REPO_ROOT}/plugin/scripts/worker-service.cjs" ]]; then
  err "worker-service.cjs not found under ${REPO_ROOT}/plugin/scripts — run 'npm run build' in the repo first."
  exit 1
fi

# 2. deps: bun (worker runtime). Don't hard-fail if already present.
if ! command -v bun >/dev/null 2>&1; then
  err "Bun not found. Install from https://bun.sh then re-run."
  exit 1
fi

# 3. start the worker if not already healthy
PORT="${CLAUDE_MEM_WORKER_PORT:-$((37700 + ($(id -u) % 100)))}"
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  log "Worker already healthy on port ${PORT}."
else
  log "Starting claude-mem-pro worker on port ${PORT}…"
  nohup bun "${REPO_ROOT}/plugin/scripts/worker-service.cjs" start >>"${HERMES_HOME}/claude-mem-pro-worker.log" 2>&1 &
  for _ in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && break
    sleep 1
  done
  if ! curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    err "Worker did not become healthy; check ${HERMES_HOME}/claude-mem-pro-worker.log"
  fi
fi

# 4. drop the plugin into ~/.hermes/plugins/claude-mem-pro/
log "Installing plugin to ${PLUGIN_DST}"
mkdir -p "${PLUGIN_DST}"
cp -R "${SCRIPT_DIR}/plugin/." "${PLUGIN_DST}/"

# 5. enable it (best-effort; user can also add to config)
if command -v hermes >/dev/null 2>&1; then
  hermes plugins enable claude-mem-pro >/dev/null 2>&1 || \
    log "Run 'hermes plugins enable claude-mem-pro' to activate."
else
  log "Hermes CLI not on PATH — add 'claude-mem-pro' to plugins.enabled in ${HERMES_HOME}/config.yaml"
fi

log "Done. Optional config in ${HERMES_HOME}/config.yaml:"
cat <<'EOF'
  claude_mem:
    worker_host: 127.0.0.1
    worker_port: <auto: 37700 + uid%100>
    project: hermes
EOF
```

- [ ] **Step 2: Syntax-check**

Run: `bash -n hermes/install.sh && echo OK`
Expected: `OK`

- [ ] **Step 3: Make executable + commit**

```bash
chmod +x hermes/install.sh
git add hermes/install.sh
git commit -m "feat(hermes): bundled installer"
```

---

## Task 6: Docs — SKILL.md + README/CLAUDE.md flip

**Files:**
- Create: `hermes/SKILL.md`
- Modify: `README.md` (the `### Hermes 🛣️ (planned)` block under `## Integrations`)
- Modify: `CLAUDE.md` (integration mention, if a list exists)

- [ ] **Step 1: Write `hermes/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Flip the README Hermes block**

In `README.md`, replace the `### Hermes 🛣️ (planned)` section body with:

```markdown
### Hermes ✅

claude-mem-pro ships a bundled [Hermes](https://github.com/NousResearch/hermes)
plugin (`hermes/`). It captures tool calls from Hermes runs, injects a recent-
mutation digest into each new turn (via the `pre_llm_call` hook, preserving the
prompt cache), and adds a `mem_recall` search tool — all talking to the same
worker, best-effort so it never blocks the agent.

```bash
git clone https://github.com/cafesean/claude-mem.git
cd claude-mem && npm run build
bash hermes/install.sh
```

See `hermes/SKILL.md` for config and the full hook map.
```

Also update the heading reference in the README intro/Quick Start that says
"Hermes support is planned" → "and Hermes".

- [ ] **Step 3: Verify no stale "planned" Hermes text remains**

Run: `grep -n "Hermes" README.md`
Expected: no "planned" next to Hermes; the `### Hermes ✅` section present.

- [ ] **Step 4: Commit**

```bash
git add hermes/SKILL.md README.md CLAUDE.md
git commit -m "docs(hermes): setup guide + flip README integration to supported"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the whole Python suite**

Run: `python3 -m pytest hermes/tests/ -v`
Expected: PASS — all tests across config, worker_client, integration, register.

- [ ] **Step 2: Importability check (no Hermes installed)**

Run: `python3 -c "import sys; sys.path.insert(0,'.'); from hermes.plugin import register; print('ok')"`
Expected: `ok` (register importable without hermes_cli present — the import is lazy inside register()).

- [ ] **Step 3: Installer syntax**

Run: `bash -n hermes/install.sh && echo OK`
Expected: `OK`

- [ ] **Step 4: Confirm Node build still green (untouched, sanity)**

Run: `npm run build 2>&1 | tail -2`
Expected: build success output.

---

## Self-Review notes (addressed)

- **Spec §4 said 4 hooks / `on_session_start`→init.** Refined to 5 hooks: lazy init in `pre_llm_call` (captures the real first prompt), `post_llm_call` stashes the last response so `on_session_end` can summarize (the end hook carries no message). `provides_hooks` updated in `plugin.yaml` and the README hook map.
- **No new runtime deps:** `worker_client` uses stdlib `urllib`; tests inject `http_fn`. `register()` imports `hermes_cli.config` lazily and tolerates its absence.
- **Type consistency:** `content_session_id`, `WorkerClient.{init,observe,summarize,context,search}`, `Integration.{on_session_start,pre_llm_call,post_tool_call,post_llm_call,on_session_end,mem_recall}`, and `MEM_RECALL_SCHEMA`/`MAX_RESPONSE_CHARS` names match across tasks.
- **Resilience covered by tests:** breaker open/half/close, error→`""` context, blocked-call count.
```
