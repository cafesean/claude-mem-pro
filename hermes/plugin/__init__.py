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
    logger.info(
        "claude-mem-pro: wired memory hooks + mem_recall (worker %s:%s, project=%s)",
        cfg["host"], cfg["port"], cfg["project"],
    )
