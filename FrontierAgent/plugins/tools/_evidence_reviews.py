"""Record review relationships from an independent agent's actual report."""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

_RESULT = re.compile(r"<review_result>\s*(\{.*?\})\s*</review_result>", re.S)


def _session(scope: Any, name: str) -> Any:
    from frontier_agent.components.agent_bus import AgentBus
    from frontier_agent.core.runtime.registries import services as registry
    from plugins.tools._bus_scope import resolve_bus_task_id

    bus = registry.get_optional(AgentBus)
    return bus.get_session(f"{resolve_bus_task_id(scope)}::{name}") if bus else None


def review_recording_blocked(document: dict, tasks: dict) -> str | None:
    recorded = {item["reviewer"] for item in document.get("evidence_reviews", [])}
    if not recorded and any(task.get("task_kind") == "research" and task.get("resolution") == "resolved"
                            for task in tasks.values()):
        return ("Cannot finish: independent research review has not been recorded. "
                "Create/reuse a verification task and call record_review with the actual reviewer report.")
    missing = [key for key, task in tasks.items() if task.get("task_kind") == "verification"
               and task.get("resolution") == "resolved" and key not in recorded]
    if missing:
        return ("Cannot finish: verification tasks " + ", ".join(missing)
                + " have no recorded review. Call record_review with their actual reports; "
                "inconclusive findings are allowed and must remain visible as uncertainty.")
    return None


def record_review(directory: Path, document: dict, op: dict, scope: Any, tasks: dict) -> str:
    from plugins.tools.constellation import _atomic_write, _now, persist_task_board
    from plugins.tools.task_board import _record_op, in_planning

    if in_planning(scope.task_id):
        return "Error: review actual research results after planning."
    reviewer = str(op.get("reviewer") or "")
    task = tasks.get(reviewer) or {}
    if task.get("task_kind") != "verification":
        return "Error: reviewer must be a verification task on the board."
    agent = str(op.get("agent") or "")
    if not agent or agent not in (task.get("owners") or []):
        return "Error: agent must own the verification task."
    session = _session(scope, agent)
    if (not session or not getattr(session, "total_task_count", 0)
            or getattr(session, "current_job_id", None) or getattr(session, "pending_tasks", None)):
        return "Error: collect a completed independent reviewer report first."
    report = str(getattr(session, "last_report", "") or "")
    matches = list(_RESULT.finditer(report))
    if len(matches) != 1:
        return "Error: reviewer report needs exactly one <review_result> JSON block."
    try:
        result = json.loads(matches[0][1])
    except (ValueError, TypeError):
        return "Error: review_result must be valid JSON."
    if not isinstance(result, dict) or result.get("reviewer") != reviewer:
        return "Error: review_result reviewer does not match the verification task."
    findings = result.get("findings")
    if not isinstance(findings, list) or not findings or any(not isinstance(item, dict) for item in findings):
        return "Error: review_result needs a nonempty findings list."
    graph_ids = {node["id"] for node in document.get("nodes", [])}
    if reviewer not in graph_ids:
        return "Error: add the verification task to the graph first."
    # Validate the entire batch before modifying either graph or task board.
    for item in findings:
        target = item.get("target")
        if not isinstance(target, str) or target == reviewer or target not in graph_ids or target not in tasks:
            return "Error: each finding must target another task on the graph."
        if tasks[target].get("resolution") not in ("resolved", "in_progress"):
            return "Error: review a returned result, not an open or cancelled task."
        if set(task.get("owners") or []) & set(tasks[target].get("owners") or []):
            return "Error: verification and original research must have independent owners."
        if item.get("verdict") not in ("confirmed", "error", "inconclusive"):
            return "Error: review verdict must be confirmed, error or inconclusive."
        if any(not isinstance(item.get(key), str) or not item[key].strip() for key in ("claim", "reason")):
            return "Error: every finding needs a specific claim and reason."
        if item["verdict"] in ("confirmed", "error") and any(
            not isinstance(item.get(key), str) or not item[key].strip() for key in ("source", "quote")
        ):
            return "Error: confirmed/error findings require source and quote; missing evidence is inconclusive."
        if item["verdict"] == "error" and (not isinstance(item.get("correction"), str) or not item["correction"].strip()):
            return "Error: demonstrated errors require a correction."
    digest = hashlib.sha256(report.encode()).hexdigest()
    ledger = document.get("evidence_reviews", [])
    if any(item["reviewer"] == reviewer and item["report_digest"] == digest for item in ledger):
        return json.dumps(document, ensure_ascii=False)
    updated = deepcopy(document)
    edges = updated.setdefault("edges", [])
    for target in dict.fromkeys(item["target"] for item in findings):
        target_findings = [item for item in findings if item["target"] == target]
        verdicts = {item["verdict"] for item in target_findings}
        # Always record actual inspection. A confirmed claim alone cannot certify
        # the whole node when the same report also found errors or uncertainty.
        relations = ["audit"]
        if verdicts == {"confirmed"}:
            relations.append("support")
        if "error" in verdicts:
            relations.append("error")
        edges[:] = [edge for edge in edges if not (
            edge["from"] == reviewer and edge["to"] == target
            and edge["relation"] in ("audit", "support", "error"))]
        edges.extend({"from": reviewer, "to": target, "relation": relation} for relation in relations)
    updated.setdefault("evidence_reviews", []).append({
        "reviewer": reviewer, "agent": agent, "report_digest": digest,
        "recorded_at": _now(), "findings": findings,
    })
    updated["version"] = int(document.get("version") or 1) + 1
    updated["updated_at"] = _now()
    for target in {item["target"] for item in findings if item["verdict"] == "error"}:
        corrections = [item["correction"] for item in findings if item["target"] == target and item["verdict"] == "error"]
        tasks[target]["resolution"] = "in_progress"
        tasks[target]["notes"] = str(tasks[target].get("notes") or "") + "\n独立审核确认错误，需修正：" + "；".join(corrections)
        _record_op(scope.task_id, "update", [target])
    _atomic_write(directory / "constellation.json", updated)
    persist_task_board(directory, tasks)
    return json.dumps(updated, ensure_ascii=False, indent=2)
