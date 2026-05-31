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
