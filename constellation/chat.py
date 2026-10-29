"""Talk with a finished study's main agent, and hand its record to a follow-up study.

The chat is a direct completion on the study's own model through the same OpenAI-compatible
endpoint the research job uses, with the report and the task record as context. The thread is kept
next to ``session.json`` as ``chat.json``. A follow-up study gets the parent's report and the thread
as files under its ``/inputs/prior/`` plus a short pointer in its instruction.
"""

from __future__ import annotations

import json
import os
import queue
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterator
from urllib.request import Request, urlopen

from constellation.models import MODELS

PROJECT = Path(__file__).resolve().parents[1]

MAX_MESSAGE = 4000
MAX_THREAD = 60
# What goes to the model: the whole report up to this size, then the most recent turns.
REPORT_BUDGET = 120_000
RECORD_BUDGET = 12_000
HISTORY_BUDGET = 24_000
HISTORY_TURNS = 16
TIMEOUT = 300
# Seconds between keep-alive comments while the model has not produced a token yet.
PING_EVERY = 10.0

_locks: dict[Path, threading.Lock] = {}
_locks_guard = threading.Lock()


# -- environment ---------------------------------------------------------------


def load_env_file(path: Path) -> None:
    """Fill os.environ from a .env file without overriding what is already set."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def prepare_llm_env(project: Path | None = None) -> None:
    """The research job's model settings: the project's .env files and the zhizengzeng key."""
    project = project or PROJECT
    load_env_file(project / ".env")
    load_env_file(project.parent / ".env")
    if not os.environ.get("OPENAI_API_KEY") and os.environ.get("ZHIZENGZENG_OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = os.environ["ZHIZENGZENG_OPENAI_API_KEY"]


def model_name(key: object) -> str:
    """The endpoint model for a study's recorded model key (OPENAI_MODEL for the default)."""
    name = MODELS.get(str(key or ""), (None, None))[1]
    return name or os.environ.get("OPENAI_MODEL", "")


# -- the study's record ----------------------------------------------------------


def session_dir_of(trial: Path) -> Path | None:
    """runs/sessions/<id>/generation/trials/1 → runs/sessions/<id> (homepage sessions only)."""
    candidate = trial.parent.parent.parent
    if (candidate / "session.json").is_file() and candidate.parent.name == "sessions":
        return candidate
    return None


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _cut(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit].rstrip() + "\n\n…（以下省略）"


def report_text(trial: Path) -> str:
    path = trial / "sandbox" / "outputs" / "report.md"
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def task_record(trial: Path) -> str:
    """One line per research task: title, outcome and the agent's closing note."""
    graph = _read_json(trial / "sandbox" / "worktree" / "constellation.json") or {}
    board = _read_json(trial / "sandbox" / "worktree" / "task_board.json") or {}
    tasks = board.get("tasks") or {} if isinstance(board, dict) else {}
    lines: list[str] = []
    for node in graph.get("nodes") or [] if isinstance(graph, dict) else []:
        node_id = str(node.get("id") or "")
        if not node_id or node_id == "goal":
            continue
        task = tasks.get(node_id) or {}
        status = str(task.get("resolution") or "open")
        note = " ".join(str(task.get("notes") or "").split())
        line = f"- {node.get('title') or node_id}（{status}）"
        if note:
            line += "：" + _cut(note, 400)
        lines.append(line)
    return _cut("\n".join(lines), RECORD_BUDGET)


# -- the thread ---------------------------------------------------------------------


def _lock(path: Path) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(path, threading.Lock())


def chat_path(session_dir: Path) -> Path:
    return session_dir / "chat.json"


def read_thread(session_dir: Path) -> list[dict[str, str]]:
    data = _read_json(chat_path(session_dir))
    messages = data.get("messages") if isinstance(data, dict) else None
    if not isinstance(messages, list):
        return []
    return [
        {"role": str(item.get("role")), "content": str(item.get("content") or ""), "at": str(item.get("at") or "")}
        for item in messages
        if isinstance(item, dict) and item.get("role") in ("user", "assistant")
    ]


def append_thread(session_dir: Path, *messages: dict[str, str]) -> None:
    path = chat_path(session_dir)
    with _lock(path):
        thread = read_thread(session_dir) + list(messages)
        thread = thread[-MAX_THREAD:]
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"messages": thread}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp.replace(path)


def clear_thread(session_dir: Path) -> None:
    path = chat_path(session_dir)
    with _lock(path):
        path.unlink(missing_ok=True)


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def clean_message(text: object) -> str:
    message = str(text or "").strip()
    if not message:
        raise ValueError("说点什么吧。")
    if len(message) > MAX_MESSAGE:
        raise ValueError(f"消息太长了，请收在 {MAX_MESSAGE} 字以内。")
    return message


# -- prompts --------------------------------------------------------------------------

SYSTEM = """你是这项研究的主 agent：你拆解了研究问题、派出子 agent 收集证据，并写出了下面这份报告。研究已经结束，现在用户在读报告时向你提问。

回答要求：
- 只依据下面的报告和任务记录回答；记录里没有的，直接说明「这次研究没有覆盖」，不要编造数字或来源。
- 引用报告内容时，在句末用【§章节标题】标出出处，标题必须与报告里的某个 Markdown 标题逐字一致（去掉前面的 # 号），例如【§2.1 出让收入的变化】。
- 如果问题需要新的资料才能回答，说明缺什么，并建议用户点「继续调研」发起后续研究。
- 用中文，先给结论，再给依据；简洁，能用三五句话说清的不要写长文。可以用 Markdown 列表和表格。

# 研究问题
{question}

# 任务记录（每个子任务的结论摘要）
{record}

# 研究报告
{report}
"""

FOLLOWUP = """根据上面的研究和我们的对话，把用户接下来最想深入调研的问题整理成一个新的研究题目。
要求：一段话，40 到 200 字，说清楚要查什么、范围和时间、必须回答的要点；它会在这次研究的基础上继续，所以不要重复已经查清的内容。
{hint}只输出 JSON：{{"question": "..."}}"""


def study_context(trial: Path, question: str) -> str:
    return SYSTEM.format(
        question=question or "（未记录）",
        record=task_record(trial) or "（没有任务记录）",
        report=_cut(report_text(trial), REPORT_BUDGET) or "（没有报告）",
    )


def _history(thread: list[dict[str, str]]) -> list[dict[str, str]]:
    recent: list[dict[str, str]] = []
    size = 0
    for item in reversed(thread[-HISTORY_TURNS:]):
        size += len(item["content"])
        if size > HISTORY_BUDGET:
            break
        recent.append({"role": item["role"], "content": item["content"]})
    return list(reversed(recent))


def build_messages(trial: Path, question: str, thread: list[dict[str, str]], message: str) -> list[dict[str, str]]:
    return [{"role": "system", "content": study_context(trial, question)}, *_history(thread), {"role": "user", "content": message}]


# -- the endpoint ---------------------------------------------------------------------

Opener = Callable[[Request, float], Any]


def _request(model: str, messages: list[dict[str, str]], *, stream: bool) -> Request:
    base = os.environ.get("OPENAI_BASE_URL", "").rstrip("/")
    key = os.environ.get("OPENAI_API_KEY", "")
    if not base or not key or not model:
        raise RuntimeError("对话服务还没有配置好。")
    body = {"model": model, "messages": messages, "stream": stream, "temperature": 0.3}
    return Request(
        base + "/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
        method="POST",
    )


def default_open(request: Request, timeout: float) -> Any:
    return urlopen(request, timeout=timeout)  # noqa: S310 - the configured endpoint


def stream_completion(model: str, messages: list[dict[str, str]], opener: Opener = default_open) -> Iterator[str]:
    """Text deltas from a streamed chat completion (OpenAI SSE)."""
    response = opener(_request(model, messages, stream=True), TIMEOUT)
    try:
        for raw in response:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                return
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue
            for choice in chunk.get("choices") or []:
                text = (choice.get("delta") or {}).get("content")
                if text:
                    yield str(text)
    finally:
        response.close()


def complete(model: str, messages: list[dict[str, str]], opener: Opener = default_open) -> str:
    response = opener(_request(model, messages, stream=False), TIMEOUT)
    try:
        payload = json.loads(response.read().decode("utf-8"))
    finally:
        response.close()
    choices = payload.get("choices") or []
    return str(((choices[0] if choices else {}).get("message") or {}).get("content") or "")


def with_pings(deltas: Iterator[str], every: float = PING_EVERY) -> Iterator[str | None]:
    """The deltas, with None whenever `every` seconds pass without one (keeps proxies from timing out)."""
    box: queue.Queue[tuple[str, Any]] = queue.Queue()

    def pump() -> None:
        try:
            for delta in deltas:
                box.put(("delta", delta))
        except Exception as exc:  # noqa: BLE001 - reported to the client as an error event
            box.put(("error", exc))
        box.put(("end", None))

    threading.Thread(target=pump, daemon=True).start()
    while True:
        try:
            kind, value = box.get(timeout=every)
        except queue.Empty:
            yield None
            continue
        if kind == "delta":
            yield value
        elif kind == "error":
            raise value
        else:
            return


def draft_followup(trial: Path, question: str, thread: list[dict[str, str]], hint: str, model: str, opener: Opener = default_open) -> str:
    ask = FOLLOWUP.format(hint=f"用户补充的方向：{hint}\n" if hint else "")
    text = complete(model, build_messages(trial, question, thread, ask), opener)
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            drafted = str(json.loads(match.group(0)).get("question") or "").strip()
        except (json.JSONDecodeError, AttributeError):
            drafted = ""
        if drafted:
            return drafted
    drafted = text.strip().strip("`").strip()
    if not drafted:
        raise RuntimeError("没能整理出新的研究题目，再试一次。")
    return drafted


# -- follow-up context -------------------------------------------------------------------


def write_prior(inputs: Path, parent_question: str, parent_trial: Path, thread: list[dict[str, str]]) -> None:
    """The parent's report and the conversation, as files the follow-up study can read."""
    prior = inputs / "prior"
    prior.mkdir(parents=True, exist_ok=True)
    (prior / "report.md").write_text(report_text(parent_trial), encoding="utf-8")
    record = task_record(parent_trial)
    (prior / "tasks.md").write_text(f"# 上一次研究的问题\n\n{parent_question}\n\n# 子任务记录\n\n{record}\n", encoding="utf-8")
    if thread:
        lines = [f"**{'用户' if item['role'] == 'user' else '主 agent'}**：{item['content']}" for item in thread]
        (prior / "conversation.md").write_text("# 读完报告后的对话\n\n" + "\n\n".join(lines) + "\n", encoding="utf-8")


def prior_instruction(parent_question: str, has_thread: bool) -> str:
    files = "`/inputs/prior/report.md`（完整报告）、`/inputs/prior/tasks.md`（子任务记录）"
    if has_thread:
        files += "、`/inputs/prior/conversation.md`（用户读完报告后与主 agent 的对话）"
    return (
        "## Prior research (context)\n\n"
        "这是一次后续研究，接着下面这项已完成的研究继续：\n\n"
        f"> {' '.join(parent_question.split())}\n\n"
        f"开始规划前先读 {files}。在它的基础上推进：已经查清并有来源的结论直接引用，不要重复调研；"
        "把精力放在新问题和上次没覆盖、证据不足的地方。如果新发现与上次结论矛盾，在报告里明确指出。\n\n"
    )
