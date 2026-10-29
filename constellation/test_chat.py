from __future__ import annotations

import io
import json
import os
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from constellation import chat
from constellation.serve import make_home_server

REPORT = "# 土地财政\n\n## 1. 出让收入\n\n2021 年见顶后连续下降。\n"


def _finished_study(runs: Path, stamp: str, *, question: str = "地方政府土地财政如何转型？", model: str = "deepseek") -> str:
    session_dir = runs / "sessions" / stamp
    trial = session_dir / "generation" / "trials" / "1"
    (trial / "sandbox" / "outputs").mkdir(parents=True)
    (trial / "sandbox" / "worktree").mkdir(parents=True)
    (trial / "sandbox" / "outputs" / "report.md").write_text(REPORT, encoding="utf-8")
    graph = {"goal": {"title": question}, "nodes": [{"id": "t1", "title": "查土地出让收入", "agents": ["land"]}], "edges": []}
    board = {"tasks": {"t1": {"resolution": "resolved", "notes": "出让收入 2021 年后下降"}}}
    (trial / "sandbox" / "worktree" / "constellation.json").write_text(json.dumps(graph, ensure_ascii=False), encoding="utf-8")
    (trial / "sandbox" / "worktree" / "task_board.json").write_text(json.dumps(board, ensure_ascii=False), encoding="utf-8")
    session = {"id": f"sessions/{stamp}/1", "question": question, "created_at": "2026-10-20T10:00:00+08:00", "status": "finished", "model": model}
    (session_dir / "session.json").write_text(json.dumps(session, ensure_ascii=False), encoding="utf-8")
    return f"sessions/{stamp}/1"


class FakeEndpoint:
    """Stands in for the OpenAI-compatible endpoint: records requests, answers with canned text."""

    def __init__(self, reply: str = "出让收入在 2021 年见顶【§1. 出让收入】。") -> None:
        self.reply = reply
        self.requests: list[dict] = []

    def __call__(self, request: Request, timeout: float):
        body = json.loads(request.data.decode("utf-8"))
        self.requests.append(body)
        if body["stream"]:
            lines = [
                b"data: " + json.dumps({"choices": [{"delta": {"content": part}}]}, ensure_ascii=False).encode() + b"\n\n"
                for part in (self.reply[:6], self.reply[6:])
            ]
            return io.BytesIO(b"".join(lines) + b"data: [DONE]\n\n")
        return io.BytesIO(json.dumps({"choices": [{"message": {"content": self.reply}}]}, ensure_ascii=False).encode())


@pytest.fixture
def server(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "http://model.invalid/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "deepseek-default")
    runs = tmp_path / "runs"
    endpoint = FakeEndpoint()
    started: list[Path] = []

    def starter(path: Path) -> int:
        started.append(path)
        return os.getpid()

    httpd = make_home_server(runs, "127.0.0.1", 0, starter=starter, opener=endpoint)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield runs, f"http://127.0.0.1:{httpd.server_address[1]}", endpoint, started
    httpd.shutdown()
    httpd.server_close()


def _get(url: str) -> dict:
    with urlopen(url) as response:
        return json.loads(response.read().decode("utf-8"))


def _post(url: str, payload: dict) -> tuple[str, bytes]:
    request = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urlopen(request) as response:
        return response.headers.get("Content-Type", ""), response.read()


def _events(raw: bytes) -> list[tuple[str, dict]]:
    events = []
    for block in raw.decode("utf-8").split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line and not line.startswith(":"))
        if "event" in lines:
            events.append((lines["event"], json.loads(lines["data"])))
    return events


def test_chat_streams_a_reply_grounded_in_the_report_and_keeps_the_thread(server) -> None:
    runs, base, endpoint, _ = server
    study = _finished_study(runs, "20261020-100000", model="gpt-6.1-sol")
    kind, raw = _post(f"{base}/api/studies/{study}/chat", {"message": "出让收入什么时候见顶？"})
    assert kind.startswith("text/event-stream")
    events = _events(raw)
    assert [name for name, _ in events] == ["start", "delta", "delta", "done"]
    assert "".join(data["text"] for name, data in events if name == "delta") == endpoint.reply
    sent = endpoint.requests[0]
    assert sent["model"] == "gpt-6.1-sol"
    assert "2021 年见顶后连续下降" in sent["messages"][0]["content"]
    assert "查土地出让收入（resolved）：出让收入 2021 年后下降" in sent["messages"][0]["content"]
    assert sent["messages"][-1] == {"role": "user", "content": "出让收入什么时候见顶？"}

    thread = _get(f"{base}/api/studies/{study}/chat")
    assert thread["available"] is True
    assert [item["role"] for item in thread["messages"]] == ["user", "assistant"]

    _post(f"{base}/api/studies/{study}/chat", {"message": "那 2024 年呢？"})
    assert [item["role"] for item in endpoint.requests[1]["messages"]] == ["system", "user", "assistant", "user"]

    request = Request(f"{base}/api/studies/{study}/chat", method="DELETE")
    with urlopen(request):
        pass
    assert _get(f"{base}/api/studies/{study}/chat")["messages"] == []


def test_chat_refuses_studies_without_a_report_and_empty_messages(server) -> None:
    runs, base, endpoint, _ = server
    study = _finished_study(runs, "20261020-100000")
    with pytest.raises(HTTPError) as empty:
        _post(f"{base}/api/studies/{study}/chat", {"message": "  "})
    assert empty.value.code == 400
    (runs / "sessions" / "20261020-100000" / "generation" / "trials" / "1" / "sandbox" / "outputs" / "report.md").unlink()
    assert _get(f"{base}/api/studies/{study}/chat")["available"] is False
    with pytest.raises(HTTPError) as missing:
        _post(f"{base}/api/studies/{study}/chat", {"message": "还在吗？"})
    assert missing.value.code == 409
    assert endpoint.requests == []


def test_followup_draft_and_new_study_carry_the_parent_record(server) -> None:
    runs, base, endpoint, started = server
    parent = _finished_study(runs, "20261020-100000")
    _post(f"{base}/api/studies/{parent}/chat", {"message": "出让收入什么时候见顶？"})

    endpoint.reply = '好的：{"question": "2024-2026 年各省土地出让收入下滑对城投债务的影响"}'
    _, raw = _post(f"{base}/api/studies/{parent}/followup", {"hint": "城投"})
    assert json.loads(raw)["question"] == "2024-2026 年各省土地出让收入下滑对城投债务的影响"
    assert "城投" in endpoint.requests[-1]["messages"][-1]["content"]

    _, raw = _post(f"{base}/api/questions", {"question": "2024-2026 年各省土地出让收入下滑对城投债务的影响", "parent": parent})
    created = json.loads(raw)
    assert created["parent"] == parent
    trial = started[-1] / "generation" / "trials" / "1"
    prior = trial / "sandbox" / "inputs" / "prior"
    assert (prior / "report.md").read_text(encoding="utf-8") == REPORT
    assert "出让收入什么时候见顶？" in (prior / "conversation.md").read_text(encoding="utf-8")
    instruction = (started[-1] / "generation" / "tasks" / "1" / "instruction.md").read_text(encoding="utf-8")
    assert "## Prior research (context)" in instruction and "/inputs/prior/report.md" in instruction
    assert instruction.index("## Prior research") < instruction.index("## Submission contract")

    lineage = _get(f"{base}/api/studies/{parent}/chat")
    assert [item["id"] for item in lineage["followups"]] == [created["id"]]
    child = _get(f"{base}/api/studies/{created['id']}/chat")
    assert child["parent"] == {"id": parent, "title": "地方政府土地财政如何转型？"}
    assert child["available"] is False

    with pytest.raises(HTTPError) as bad:
        _post(f"{base}/api/questions", {"question": "接着一个不存在的研究。", "parent": "sessions/nope/1"})
    assert bad.value.code == 400


def test_endpoint_failure_becomes_an_error_event(server, monkeypatch) -> None:
    runs, base, endpoint, _ = server
    study = _finished_study(runs, "20261020-100000")
    monkeypatch.delenv("OPENAI_API_KEY")
    monkeypatch.delenv("ZHIZENGZENG_OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(chat, "PROJECT", runs)  # no .env files to fall back on
    _, raw = _post(f"{base}/api/studies/{study}/chat", {"message": "还在吗？"})
    events = _events(raw)
    assert events[-1][0] == "error"
    assert _get(f"{base}/api/studies/{study}/chat")["messages"] == []


def test_pings_fill_silence_until_the_first_token() -> None:
    import time

    def slow():
        time.sleep(0.25)
        yield "好"

    assert list(chat.with_pings(slow(), every=0.1))[-1] == "好"
    assert None in list(chat.with_pings(slow(), every=0.1))
