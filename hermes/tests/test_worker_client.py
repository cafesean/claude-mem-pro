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
    assert c.context(["hermes"]) == ""


def test_circuit_breaker_opens_and_half_opens():
    clock = FakeClock()
    cb = CircuitBreaker(threshold=2, cooldown=30.0, now=clock)
    assert cb.allow() is True
    cb.record_failure(); assert cb.allow() is True
    cb.record_failure(); assert cb.allow() is False
    clock.t = 31.0
    assert cb.allow() is True
    cb.record_success(); assert cb.allow() is True


def test_breaker_blocks_calls_when_open():
    calls = []
    cb = CircuitBreaker(threshold=1, cooldown=999, now=FakeClock())
    c = WorkerClient("h", 1, "proj", http_fn=make_http(calls, [RuntimeError("x")]), breaker=cb)
    c.context(["hermes"])
    c.context(["hermes"])
    assert len(calls) == 1
