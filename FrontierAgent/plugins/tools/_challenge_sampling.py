"""Sequential random challenges: stop on a clean sample, never exceed five targets."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from copy import deepcopy
from pathlib import Path
from typing import Any

LIMIT = 5
CHALLENGER = "sample_challenger"
STOPPED = {"passed", "inconclusive", "limit_reached", "exhausted"}
_RESULT = re.compile(r"<challenge_result>\s*(\{.*?\})\s*</challenge_result>", re.S)


def eligible_targets(document: dict[str, Any], tasks: dict[str, dict[str, Any]]) -> list[str]:
    graph_ids = {node["id"] for node in document.get("nodes") or []}
    selected = {attempt["target"] for attempt in (document.get("challenge_sampling") or {}).get("attempts", [])}
    out = []
    for task_id, task in tasks.items():
        if task_id not in graph_ids or task_id in selected or task.get("resolution") != "resolved":
            continue
        if CHALLENGER in (task.get("owners") or []):
            continue
        kind = task.get("task_kind")
        if kind and kind != "research":
            continue
        # Compatibility for boards created before task_kind existed.
        if not kind:
            owners = " ".join(task.get("owners") or []).lower()
            if any(role in owners for role in ("verif", "challeng", "critic", "publish", "report", "writer")):
                continue
            if re.match(r"(?i)\s*(write\b|publish\b|synthesize\b|integrate\b|verify\b|audit\b|撰写|编写|发布|核验|复核|审计|交叉核验|汇总.*报告)", task.get("description", "")):
                continue
        out.append(task_id)
    return sorted(out)


def sampling_blocked(document: dict[str, Any], tasks: dict[str, dict[str, Any]]) -> str | None:
    state = document.get("challenge_sampling") or {}
    if state.get("status") in STOPPED:
        return None
    if state.get("pending"):
        return "Cannot finish: collect the active sample_challenger report, then call update_constellation with record_challenge."
    if state.get("attempts") or eligible_targets(document, tasks):
        return "Cannot finish: call update_constellation with a single next_challenge op to run the bounded random sample."
    return None


def parse_result(report: str, target: str) -> tuple[dict[str, Any] | None, str | None]:
    matches = list(_RESULT.finditer(report))
    if len(matches) != 1:
        return None, "challenger report needs exactly one <challenge_result> JSON block"
    try:
        result = json.loads(matches[0][1])
    except (ValueError, TypeError):
        return None, "challenge_result must be valid JSON"
    if result.get("target") != target:
        return None, "challenger result target does not match the active sample"
    if result.get("verdict") not in ("pass", "confirmed_error", "inconclusive"):
        return None, "challenge verdict must be pass, confirmed_error or inconclusive"
    if not isinstance(result.get("summary"), str) or not result["summary"].strip():
        return None, "challenge result needs a specific summary"
    evidence = result.get("evidence")
    if not isinstance(evidence, list):
        return None, "challenge result needs an evidence list"
    if result["verdict"] in ("pass", "confirmed_error") and not evidence:
        return None, "pass or confirmed_error needs evidence; missing sources are inconclusive"
    for item in evidence:
        fields = ("claim", "source", "quote")
        if result["verdict"] == "confirmed_error":
            fields += ("correction",)
        if not isinstance(item, dict) or any(not isinstance(item.get(key), str) or not item[key].strip() for key in fields):
            return None, "evidence needs claim/source/quote, plus correction for confirmed errors"
    return result, None


def _session(scope: Any) -> Any:
    from frontier_agent.components.agent_bus import AgentBus
    from frontier_agent.core.runtime.registries import services as registry
    from plugins.tools._bus_scope import resolve_bus_task_id

    bus = registry.get_optional(AgentBus)
    return bus.get_session(f"{resolve_bus_task_id(scope)}::{CHALLENGER}") if bus else None


def assignment_error(document: dict[str, Any], session: Any, *, publishing: bool) -> str | None:
    state = document.get("challenge_sampling") or {}
    if not state.get("pending") or state.get("status") in STOPPED:
        return "Error: next_challenge must allocate a target before assigning sample_challenger."
    if publishing:
        return "Error: sample_challenger is read-only for final outputs; omit publication permissions."
    attempt = state["attempts"][-1]
    if session and (getattr(session, "current_job_id", None) or getattr(session, "pending_tasks", None)):
        return "Error: one challenge is already running; collect it before another assignment."
    if session and getattr(session, "total_task_count", 0) > attempt["previous_task_count"]:
        return "Error: record the completed challenge before any further challenger assignment."
    return None


def _response(state: dict[str, Any], tasks: dict[str, dict[str, Any]]) -> str:
    selected = state["attempts"][-1]["target"] if state.get("pending") else None
    target_context = {"id": selected, **tasks[selected]} if selected else None
    return json.dumps({"challenge_sampling": state, "target_context": target_context, "instruction":
        "Use only sample_challenger for this bounded sample; never dispatch two rounds concurrently. "
        "Pass stops sampling only, not final report completeness checks. Repair confirmed errors before continuing."}, ensure_ascii=False)


async def sampling_op(
    directory: Path, document: dict[str, Any], op: dict[str, Any], scope: Any,
    tasks: dict[str, dict[str, Any]],
) -> str:
    from plugins.tools.constellation import _atomic_write, _now, apply_ops, persist_task_board
    from plugins.tools.task_board import _record_op, add_task, in_planning

    if in_planning(scope.task_id):
        return "Error: sample completed research only after planning."
    updated = deepcopy(document)
    state = updated.setdefault("challenge_sampling", {"status": "active", "attempts": [], "pending": None})
    session = _session(scope)
    if op["op"] == "next_challenge":
        if state["pending"] or state["status"] in STOPPED:
            return _response(state, tasks)
        for attempt in state["attempts"]:
            if attempt.get("verdict") == "confirmed_error" and tasks[attempt["target"]].get("resolution") not in ("resolved", "cancelled"):
                return "Error: correct the known error in " + attempt["target"] + " before sampling another target."
        candidates = eligible_targets(updated, tasks)
        challenge_nodes = {edge["from"] for edge in document.get("edges") or [] if edge.get("relation") == "challenge"}
        if len(state["attempts"]) >= LIMIT or len(challenge_nodes) >= LIMIT:
            state["status"] = "limit_reached"
        elif not candidates:
            # Do not call an empty/early pool a clean sample.
            return "No unchallenged completed research task is eligible; wait for research results."
        else:
            target = secrets.choice(candidates)
            if CHALLENGER in (tasks[target].get("owners") or []):
                return "Error: the challenger cannot audit its own research."
            index = len(state["attempts"]) + 1
            description = f"抽样挑战 {index}/{LIMIT}：独立核查 {target} — {tasks[target]['description']}"
            result = await add_task.func([{"description": description, "owner": CHALLENGER, "task_kind": "challenge"}])
            if result.startswith("Error"):
                return result
            challenge_id = next(key for key, task in tasks.items() if task["description"] == description)
            tasks[challenge_id]["resolution"] = "in_progress"
            attempt = {"target": target, "challenge_id": challenge_id, "round": index,
                       "previous_task_count": getattr(session, "total_task_count", 0),
                       "previous_report": hashlib.sha256(str(getattr(session, "last_report", "")).encode()).hexdigest()}
            state["attempts"].append(attempt)
            state["pending"] = challenge_id
            descriptions = {key: task["description"] for key, task in tasks.items()}
            updated, error = apply_ops(updated, [
                {"op": "add_node", "id": challenge_id, "title": f"抽样挑战 {index}/{LIMIT}", "agents": [CHALLENGER]},
                {"op": "add_edge", "from": "goal", "to": challenge_id, "relation": "parent"},
                {"op": "add_edge", "from": challenge_id, "to": target, "relation": "challenge"},
            ], descriptions)
            if error or updated is None:
                # Roll back the allocated board entry if graph validation failed.
                tasks.pop(challenge_id, None)
                persist_task_board(directory, tasks)
                return "Error: " + str(error)
            state = updated["challenge_sampling"]
    else:
        if not state["pending"]:
            return "Error: there is no active challenge to record."
        attempt = state["attempts"][-1]
        if op.get("challenge_id") != state["pending"]:
            return "Error: challenge_id does not match the active sample."
        report = str(getattr(session, "last_report", "") or "")
        digest = hashlib.sha256(report.encode()).hexdigest()
        if not session or getattr(session, "current_job_id", None) or getattr(session, "total_task_count", 0) <= attempt["previous_task_count"]:
            return "Error: wait for a fresh completed sample_challenger report; do not reuse a prior verdict."
        if not report or digest == attempt["previous_report"]:
            outcome, error = None, "challenger finished without a fresh report"
        else:
            outcome, error = parse_result(report, attempt["target"])
        if error or outcome is None:
            outcome = {"target": attempt["target"], "verdict": "inconclusive",
                       "summary": "挑战未形成可核验结论：" + str(error), "evidence": []}
        attempt.update(outcome)
        attempt.pop("previous_report", None)
        state["pending"] = None
        state["status"] = {"pass": "passed", "inconclusive": "inconclusive"}.get(outcome["verdict"], "active")
        if outcome["verdict"] == "confirmed_error":
            target = tasks[attempt["target"]]
            target["resolution"] = "in_progress"
            target["notes"] = str(target.get("notes") or "") + "\n抽样挑战确认错误，需修正：" + outcome["summary"]
            updated["edges"].append({"from": attempt["challenge_id"], "to": attempt["target"], "relation": "error"})
            challenge_count = len({edge["from"] for edge in updated["edges"] if edge.get("relation") == "challenge"})
            if len(state["attempts"]) >= LIMIT or challenge_count >= LIMIT:
                state["status"] = "limit_reached"
            elif not eligible_targets(updated, tasks):
                state["status"] = "exhausted"
            _record_op(scope.task_id, "update", [attempt["target"]])
        challenge = tasks[attempt["challenge_id"]]
        challenge["resolution"] = "resolved"
        challenge["notes"] = outcome["verdict"] + ": " + outcome["summary"]
        _record_op(scope.task_id, "update", [attempt["challenge_id"]])
    updated["version"] = int(document.get("version") or 1) + 1
    updated["updated_at"] = _now()
    _atomic_write(directory / "constellation.json", updated)
    persist_task_board(directory, tasks)
    return _response(state, tasks)
