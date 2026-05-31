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
