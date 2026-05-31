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
    assert cfg["project"] == "proj"


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
