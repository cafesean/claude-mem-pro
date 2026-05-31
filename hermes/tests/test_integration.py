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
    integ = integration.Integration(client=fake, project="hermes", submit=lambda fn: fn())
    return integ, fake


def test_pre_llm_call_inits_once_and_injects():
    integ, fake = make_integration()
    out1 = integ.pre_llm_call(session_id="s1", user_message="hi", is_first_turn=True)
    out2 = integ.pre_llm_call(session_id="s1", user_message="again", is_first_turn=False)
    assert fake.inits == [("hermes-s1", "hi")]
    assert out1 == {"context": "DIGEST"}
    assert out2 == {"context": "DIGEST"}


def test_pre_llm_call_no_context_returns_none():
    integ, fake = make_integration()
    fake.context_return = ""
    assert integ.pre_llm_call(session_id="s1", user_message="hi", is_first_turn=True) is None


def test_post_tool_call_records_and_truncates():
    integ, fake = make_integration()
    big = "x" * 5000
    integ.post_tool_call(tool_name="write_file", args={"path": "/a"}, result=big, session_id="s1")
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
    assert fake.inits == [("hermes-s1", "a"), ("hermes-s1", "b")]


def test_mem_recall_tool_handler():
    integ, fake = make_integration()
    out = integ.mem_recall({"query": "auth bug", "limit": 5})
    assert out == "RESULTS"
    out_empty = integ.mem_recall({"query": ""})
    assert "query" in out_empty.lower()
