"""Homepage sessions: one submitted question, and the studies already on disk."""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from constellation.chat import prior_instruction, read_thread, session_dir_of, write_prior
from constellation.models import resolve_model

_SAFE = re.compile(r"^[A-Za-z0-9._-]+$")


def short_question(text: str, limit: int = 42) -> str:
    cleaned = re.sub(r"^#\s*Task\s*", "", str(text or "").strip(), flags=re.I)
    sentence = re.split(r"[。\n]", cleaned, maxsplit=1)[0].strip() or cleaned
    sentence = " ".join(sentence.split())
    if len(sentence) <= limit:
        return sentence
    return sentence[: limit - 1] + "…"


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _question_text(trial: Path, session: dict[str, Any] | None) -> str:
    if session and str(session.get("question") or "").strip():
        return str(session["question"]).strip()
    instruction = trial.parent.parent / "tasks" / trial.name / "instruction.md"
    if instruction.is_file():
        text = instruction.read_text(encoding="utf-8")
        return re.split(r"\n## (?:Prior research|Submission contract)", text, maxsplit=1)[0].strip()
    result = _read_json(trial / "result.json")
    if result and str(result.get("question") or "").strip():
        return str(result["question"]).strip()
    graph = _read_json(trial / "sandbox" / "worktree" / "constellation.json")
    goal = (graph or {}).get("goal") or {}
    return str(goal.get("title") or "").strip()


def _stamp(path: Path) -> str:
    try:
        moment = datetime.fromtimestamp(path.stat().st_mtime).astimezone()
    except OSError:
        moment = datetime.now().astimezone()
    return moment.isoformat(timespec="seconds")


def _pid_alive(pid: object) -> bool:
    try:
        number = int(pid)
    except (TypeError, ValueError):
        return False
    if number <= 0:
        return False
    try:
        os.kill(number, 0)
    except OSError:
        return False
    return True


def _session_path(trial: Path) -> Path | None:
    # runs/sessions/<id>/generation/trials/1 → session.json sits on <id>
    candidate = trial.parent.parent.parent / "session.json"
    if candidate.is_file() and candidate.parent.parent.name == "sessions":
        return candidate
    return None


def _reconcile(path: Path | None, session: dict[str, Any] | None) -> dict[str, Any] | None:
    if not session or not path or session.get("status") != "running":
        return session
    if not session.get("pid") or _pid_alive(session.get("pid")):
        return session
    session["status"] = "failed"
    session["error"] = str(session.get("error") or "研究进程已经停了。")
    path.write_text(json.dumps(session, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return session


def _status(trial: Path, session: dict[str, Any] | None) -> str:
    if session and session.get("status") in {"running", "failed"}:
        return str(session["status"])
    result = _read_json(trial / "result.json") or {}
    if result.get("error") and not str(result.get("predicted_answer") or "").strip():
        return "failed"
    report = trial / "sandbox" / "outputs" / "report.md"
    if report.is_file() or str(result.get("predicted_answer") or "").strip():
        return "finished"
    if (trial / "sandbox" / "worktree" / "constellation.json").is_file():
        return "finished"
    return "running"


def _entry(study_id: str, trial: Path, session: dict[str, Any] | None) -> dict[str, Any] | None:
    question = _question_text(trial, session)
    if not question and not (trial / "sandbox" / "worktree" / "constellation.json").is_file():
        return None
    created = ""
    if session and session.get("created_at"):
        created = str(session["created_at"])
    elif (trial / "result.json").is_file():
        created = _stamp(trial / "result.json")
    elif trial.exists():
        created = _stamp(trial)
    graph = trial / "sandbox" / "worktree" / "constellation.json"
    report = trial / "sandbox" / "outputs" / "report.md"
    return {
        "id": study_id,
        "title": short_question(question) or "未命名研究",
        "question": " ".join(question.split()),
        "status": _status(trial, session),
        "constellation": graph.is_file(),
        "report": report.is_file(),
        "created_at": created,
        "error": str((session or {}).get("error") or ""),
        "model": str((session or {}).get("model") or ""),
        "parent": str((session or {}).get("parent") or ""),
        "href": "/study/" + study_id,
    }


def _trials(runs: Path):
    if not runs.is_dir():
        return
    for run in sorted(runs.iterdir(), key=lambda path: path.name):
        if not run.is_dir() or run.name.startswith("."):
            continue
        if run.name == "sessions":
            for session_dir in run.iterdir():
                if not session_dir.is_dir() or not _SAFE.match(session_dir.name):
                    continue
                trial = session_dir / "generation" / "trials" / "1"
                yield f"sessions/{session_dir.name}/1", trial
            continue
        trials = run / "generation" / "trials"
        if not trials.is_dir() or not _SAFE.match(run.name):
            continue
        for trial in trials.iterdir():
            if trial.is_dir() and _SAFE.match(trial.name):
                yield f"{run.name}/{trial.name}", trial


def _study_root(trial: Path) -> Path:
    """A homepage session is one folder. An older run deletes only that trial."""
    session = trial.parent.parent.parent
    if session.parent.name == "sessions":
        return session
    return trial


def _stop_recorded_job(session_dir: Path) -> None:
    session = _read_json(session_dir / "session.json") or {}
    if not _pid_alive(session.get("pid")):
        return
    pid = int(session["pid"])
    try:
        command = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", "command="],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError, ValueError):
        return
    if "constellation.run_job" not in command or str(session_dir) not in command:
        return
    os.kill(pid, signal.SIGTERM)


def delete_study(runs: Path, study: str) -> None:
    trial = resolve_trial(runs, study)
    if trial is None:
        raise FileNotFoundError("没有这项研究。")
    root = runs.resolve()
    try:
        target = _study_root(trial).resolve()
    except OSError as exc:
        raise FileNotFoundError("没有这项研究。") from exc
    if target != root and root not in target.parents:
        raise FileNotFoundError("没有这项研究。")
    if not target.exists():
        raise FileNotFoundError("没有这项研究。")
    if (target / "session.json").is_file():
        _stop_recorded_job(target)
    shutil.rmtree(target)


def list_history(runs: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for study_id, trial in _trials(runs):
        path = _session_path(trial)
        session = _reconcile(path, _read_json(path) if path else None)
        row = _entry(study_id, trial, session)
        if row:
            rows.append(row)
    rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    return rows


def resolve_trial(runs: Path, study: str) -> Path | None:
    parts = [part for part in study.split("/") if part]
    if not parts or any(not _SAFE.match(part) for part in parts):
        return None
    if len(parts) == 2:
        trial = runs / parts[0] / "generation" / "trials" / parts[1]
    elif len(parts) == 3 and parts[0] == "sessions":
        trial = runs / "sessions" / parts[1] / "generation" / "trials" / parts[2]
    else:
        return None
    try:
        resolved = trial.resolve()
        root = runs.resolve()
    except OSError:
        return None
    if root != resolved and root not in resolved.parents:
        return None
    return resolved


def _pythonpath(project: Path) -> str:
    entries = [str(project), str(project / "FrontierAgent")]
    current = os.environ.get("PYTHONPATH", "")
    for part in current.split(os.pathsep):
        if part and part not in entries:
            entries.append(part)
    return os.pathsep.join(entries)


def job_interpreter(project: Path) -> str:
    """Research jobs need the FrontierAgent environment, not the UI process."""
    candidate = project / "FrontierAgent" / ".venv" / "bin" / "python"
    if candidate.is_file():
        return str(candidate)
    return sys.executable


def spawn_job(session_dir: Path) -> int:
    project = Path(__file__).resolve().parents[1]
    log_path = session_dir / "job.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PYTHONPATH"] = _pythonpath(project)
    env.setdefault("SANDBOX_BACKEND", "native")
    with log_path.open("ab") as log:
        proc = subprocess.Popen(
            [job_interpreter(project), "-m", "constellation.run_job", str(session_dir)],
            cwd=str(project),
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    return proc.pid


_IMAGE_MIME = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
_IMAGE_TOTAL_BYTES = 12 * 1024 * 1024


def _write_images(trial: Path, images: object) -> list[dict[str, str]]:
    """Save the question's pictures under the sandbox inputs; returns what session.json records."""
    import base64
    import binascii

    if not images:
        return []
    if not isinstance(images, list):
        raise ValueError("图片格式不对。")
    folder = trial / "sandbox" / "inputs" / "images"
    folder.mkdir(parents=True, exist_ok=True)
    saved: list[dict[str, str]] = []
    total = 0
    for index, item in enumerate(images, start=1):
        if not isinstance(item, dict):
            raise ValueError("图片格式不对。")
        mime = str(item.get("mime") or "").split(";")[0].strip().lower()
        if mime not in _IMAGE_MIME:
            raise ValueError("只支持 PNG、JPEG、WebP 图片。")
        data = str(item.get("data") or "").strip()
        if data.startswith("data:"):
            data = data.split(",", 1)[-1]
        try:
            blob = base64.b64decode(data, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("图片数据读不出来。") from exc
        total += len(blob)
        if total > _IMAGE_TOTAL_BYTES:
            raise ValueError("图片总共不能超过 12MB。")
        stem = re.sub(r"[^A-Za-z0-9._-]+", "-", str(item.get("name") or "image"))[:60].strip("-") or "image"
        stem = re.sub(r"\.(png|jpe?g|webp)$", "", stem, flags=re.I) or "image"
        name = f"{index:02d}-{stem}{_IMAGE_MIME[mime]}"
        (folder / name).write_bytes(blob)
        saved.append({"name": name, "mime": mime, "path": f"sandbox/inputs/images/{name}"})
    return saved


def create_session(
    runs: Path,
    question: str,
    *,
    starter: Callable[[Path], int] | None = spawn_job,
    model: object = None,
    parent: object = None,
    images: object = None,
) -> dict[str, Any]:
    text = " ".join(str(question or "").split())
    if len(text) < 4:
        raise ValueError("问题太短了。")
    if len(text) > 8000:
        raise ValueError("问题太长了，请收在 8000 字以内。")
    model_key = resolve_model(model)
    prior = _parent_study(runs, parent)

    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    session_dir = runs / "sessions" / stamp
    suffix = 2
    while session_dir.exists():
        session_dir = runs / "sessions" / f"{stamp}-{suffix}"
        suffix += 1
    trial = session_dir / "generation" / "trials" / "1"
    task = session_dir / "generation" / "tasks" / "1"
    for folder in (
        trial / "sandbox" / "worktree",
        trial / "sandbox" / "outputs",
        trial / "sandbox" / "inputs",
        task,
    ):
        folder.mkdir(parents=True, exist_ok=True)

    study_id = f"sessions/{session_dir.name}/1"
    created = datetime.now().astimezone().isoformat(timespec="seconds")
    session = {
        "id": study_id,
        "question": text,
        "created_at": created,
        "status": "running",
        "error": "",
        "pid": 0,
        "model": model_key,
    }
    saved_images = _write_images(trial, images)
    if saved_images:
        session["images"] = saved_images
    if prior:
        session["parent"] = prior[0]
        write_prior(trial / "sandbox" / "inputs", prior[1], prior[2], prior[3])
    session_path = session_dir / "session.json"
    session_path.write_text(json.dumps(session, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (task / "instruction.md").write_text(
        _instruction(text, prior_instruction(prior[1], bool(prior[3])) if prior else "", saved_images), encoding="utf-8"
    )
    (task / "task.toml").write_text(_task_toml(), encoding="utf-8")
    (trial / "config.json").write_text(
        json.dumps({"task": {"path": str(task.resolve())}}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if starter is not None:
        try:
            session["pid"] = int(starter(session_dir))
        except Exception as exc:
            session["status"] = "failed"
            session["error"] = f"研究没有启动：{exc}"
        session_path.write_text(json.dumps(session, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return _entry(study_id, trial, session) or session


def _parent_study(runs: Path, parent: object) -> tuple[str, str, Path, list[dict[str, str]]] | None:
    """(id, question, trial, chat thread) of a finished study a follow-up builds on; None without one."""
    study = str(parent or "").strip()
    if not study:
        return None
    trial = resolve_trial(runs, study)
    session_dir = session_dir_of(trial) if trial else None
    if trial is None or session_dir is None or not (trial / "sandbox" / "outputs" / "report.md").is_file():
        raise ValueError("要接着的研究不存在，或者还没有报告。")
    session = _read_json(session_dir / "session.json")
    return study, _question_text(trial, session), trial, read_thread(session_dir)


def _instruction(question: str, prior: str = "", images: list[dict[str, str]] | None = None) -> str:
    attached = ""
    if images:
        listing = "\n".join(f"- `{item['path']}`（{item['mime']}）" for item in images)
        attached = (
            "## Attached images\n\n"
            "The user attached these pictures with the question. Read every one of them before researching, "
            "and use what they show (text, tables, charts, screenshots) as part of the question:\n\n"
            f"{listing}\n\n"
        )
    return (
        "# Task\n\n"
        f"{question}\n\n"
        f"{attached}"
        f"{prior}"
        "## Submission contract (mandatory)\n\n"
        "Work in three phases. Do not skip phase 2.\n\n"
        "Phase 1 — research. Cover every deliverable in the user prompt. "
        "Write notes under `/outputs/notes/`.\n\n"
        "Phase 2 — gap fill. Compare notes against the question. "
        "Spawn sub-agents only for missing numbers, empty table cells, or claims that still lack sources.\n\n"
        "Phase 3 — write the report. Your last message must be the complete Markdown report, "
        "and you must also write it to `/outputs/report.md`.\n\n"
        "Chinese reports need analysis after every table. Every key figure needs a source URL "
        "or an official document name.\n"
    )


def _task_toml() -> str:
    return """schema_version = "1.1"

[metadata]
question_id = "1"
answer_type = "report"
pipeline_id = "agent_team_report"
language = "zh"
benchmark = "deepresearch_bench_ii"
profile = "drb2_deepseek_v2"
"""
