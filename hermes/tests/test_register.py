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
