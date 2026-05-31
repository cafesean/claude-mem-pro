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
            prompt = user_message  # captured by value before lambda closes over it
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
        tool_input = dict(args) if isinstance(args, dict) else {}
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
