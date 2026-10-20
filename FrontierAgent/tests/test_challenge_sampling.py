from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from frontier_agent.core.execution_context import (
    ExecutionScope,
    reset_current_execution_scope,
    set_current_execution_scope,
)
from plugins.tools import _challenge_sampling as sampling
from plugins.tools.constellation import init_constellation, update_constellation
from plugins.tools.finalize_answer import finalize_gate
from plugins.tools.task_board import add_task, board_tasks, clear_board, update_task
from workflows.agent_team.prompts import get_main_system_prompt, get_subagent_system_prompt


@pytest.fixture
def run(tmp_path, monkeypatch):
    scope = ExecutionScope(task_id="sampling-test", phase_id="execution", role_id="agent_team_main",
                           metadata={"constellation_dir": str(tmp_path), "sampled_challenges_enabled": True})
    token = set_current_execution_scope(scope)
    init_constellation(tmp_path, "Research projects")
    session = SimpleNamespace(total_task_count=0, last_report="", current_job_id=None, pending_tasks=[])
    monkeypatch.setattr(sampling, "_session", lambda scope: session)
    seen_pools = []
    def choose(pool):
        seen_pools.append(list(pool))
        return pool[-1]
    monkeypatch.setattr(sampling.secrets, "choice", choose)
    asyncio.run(add_task.func([
        *[{"description": f"研究项目 {i} 的许可证", "owner": f"researcher_{i}", "task_kind": "research"} for i in range(6)],
        {"description": "审阅整体报告", "owner": "final_verifier", "task_kind": "verification"},
        {"description": "撰写报告", "owner": "publisher", "task_kind": "writing"},
    ]))
    tasks = board_tasks(scope.task_id)
    asyncio.run(update_task.func([{"id": key, "resolution": "resolved", "notes": "许可证为 MIT"} for key in tasks]))
    ops = []
    for key in tasks:
        ops.extend([{"op": "add_node", "id": key}, {"op": "add_edge", "from": "goal", "to": key, "relation": "parent"}])
    assert not asyncio.run(update_constellation.func(ops)).startswith("Error")
    def graph():
        return json.loads((tmp_path / "constellation.json").read_text())
    def call(op):
        return asyncio.run(update_constellation.func([op]))
    def complete(verdict, *, malformed=False):
        active = graph()["challenge_sampling"]["attempts"][-1]
        result = {"target": active["target"], "verdict": verdict, "summary": "独立检查主要结论及来源",
                  "evidence": [] if verdict == "inconclusive" else [{"claim": "MIT", "source": "https://example.org/LICENSE", "quote": "Apache-2.0" if verdict == "confirmed_error" else "MIT", "correction": "Apache-2.0"}]}
        session.total_task_count += 1
        session.last_report = "failed to return structured findings" if malformed else "Evidence checked.\n<challenge_result>" + json.dumps(result) + "</challenge_result>"
        return call({"op": "record_challenge", "challenge_id": active["challenge_id"]})
    try:
        yield SimpleNamespace(scope=scope, tasks=tasks, graph=graph, call=call, session=session,
                              complete=complete, pools=seen_pools, path=tmp_path / "constellation.json")
    finally:
        clear_board(scope.task_id)
        reset_current_execution_scope(token)


def test_first_pass_stops_sampling_and_only_finished_research_can_be_selected(run):
    assert "bounded random sample" in finalize_gate(run.scope.task_id, "report")
    run.call({"op": "next_challenge"})
    attempt = run.graph()["challenge_sampling"]["attempts"][0]
    assert run.pools[0] == ["t1", "t2", "t3", "t4", "t5", "t6"]
    assert attempt["target"] == "t6"  # the runtime chooser decides, not the coordinator
    assert run.tasks[attempt["challenge_id"]]["resolution"] == "in_progress"
    before = run.path.read_bytes()
    run.call({"op": "next_challenge"})
    assert run.path.read_bytes() == before  # no parallel reservation or duplicate node
    assert "record sampled challenges" in asyncio.run(update_task.func([{"id": attempt["challenge_id"], "resolution": "resolved"}]))
    run.complete("pass")
    assert run.graph()["challenge_sampling"]["status"] == "passed"
    before = run.path.read_bytes()
    run.call({"op": "next_challenge"})
    assert run.path.read_bytes() == before
    assert finalize_gate(run.scope.task_id, "report") is None


def test_only_confirmed_errors_continue_and_reopen_the_original_task(run):
    run.call({"op": "next_challenge"})
    first = run.graph()["challenge_sampling"]["attempts"][0]
    run.complete("confirmed_error")
    assert run.tasks[first["target"]]["resolution"] == "in_progress"
    assert {"from": first["challenge_id"], "to": first["target"], "relation": "error"} in run.graph()["edges"]
    assert "correct the known error" in run.call({"op": "next_challenge"})
    asyncio.run(update_task.func([{"id": first["target"], "resolution": "resolved", "notes": "已核对原始许可证并修正"}]))
    run.call({"op": "next_challenge"})
    second = run.graph()["challenge_sampling"]["attempts"][-1]
    assert second["target"] != first["target"]
    assert first["target"] not in run.pools[-1]
    run.complete("pass")
    assert len(run.graph()["challenge_sampling"]["attempts"]) == 2
    assert run.graph()["challenge_sampling"]["status"] == "passed"


def test_five_confirmed_errors_cannot_allocate_a_sixth_node(run):
    targets = []
    for _ in range(5):
        run.call({"op": "next_challenge"})
        attempt = run.graph()["challenge_sampling"]["attempts"][-1]
        targets.append(attempt["target"])
        run.complete("confirmed_error")
        asyncio.run(update_task.func([{"id": attempt["target"], "resolution": "resolved", "notes": "修正已独立复核"}]))
    state = run.graph()["challenge_sampling"]
    assert state["status"] == "limit_reached"
    assert len(set(targets)) == 5
    before = run.path.read_bytes()
    run.call({"op": "next_challenge"})
    assert run.path.read_bytes() == before
    assert sum(task.get("task_kind") == "challenge" for task in run.tasks.values()) == 5
    assert "at most five" in asyncio.run(add_task.func([{"description": "试图创建第六个挑战", "task_kind": "challenge"}]))


def test_pool_exhaustion_does_not_repeat_an_existing_target(run):
    for key in ("t3", "t4", "t5", "t6"):
        run.tasks[key]["resolution"] = "cancelled"
    for _ in range(2):
        run.call({"op": "next_challenge"})
        attempt = run.graph()["challenge_sampling"]["attempts"][-1]
        run.complete("confirmed_error")
        asyncio.run(update_task.func([{"id": attempt["target"], "resolution": "resolved"}]))
    assert run.graph()["challenge_sampling"]["status"] == "exhausted"
    run.call({"op": "next_challenge"})
    assert len(run.graph()["challenge_sampling"]["attempts"]) == 2


@pytest.mark.parametrize("malformed", [False, True])
def test_uncertain_or_broken_reports_stop_without_fabricating_an_error_or_pass(run, malformed):
    run.call({"op": "next_challenge"})
    run.complete("inconclusive", malformed=malformed)
    assert run.graph()["challenge_sampling"]["status"] == "inconclusive"
    assert not any(edge["relation"] == "error" for edge in run.graph()["edges"])
    run.call({"op": "next_challenge"})
    assert len(run.graph()["challenge_sampling"]["attempts"]) == 1


def test_stale_report_and_wrong_round_do_not_consume_or_finish_the_sample(run):
    run.call({"op": "next_challenge"})
    attempt = run.graph()["challenge_sampling"]["attempts"][0]
    before = run.path.read_bytes()
    assert "does not match" in run.call({"op": "record_challenge", "challenge_id": "t1"})
    assert "fresh completed" in run.call({"op": "record_challenge", "challenge_id": attempt["challenge_id"]})
    assert run.path.read_bytes() == before
    assert sampling.assignment_error(run.graph(), run.session, publishing=True)
    run.session.current_job_id = "active-job"
    assert sampling.assignment_error(run.graph(), run.session, publishing=False)
    run.session.current_job_id = None
    assert sampling.assignment_error(run.graph(), run.session, publishing=False) is None


def test_failed_execution_without_a_new_report_is_inconclusive(run):
    run.call({"op": "next_challenge"})
    attempt = run.graph()["challenge_sampling"]["attempts"][0]
    run.session.total_task_count += 1
    response = run.call({"op": "record_challenge", "challenge_id": attempt["challenge_id"]})
    assert not response.startswith("Error")
    assert run.graph()["challenge_sampling"]["status"] == "inconclusive"
    assert run.tasks[attempt["target"]]["resolution"] == "resolved"


def test_empty_pool_waits_instead_of_claiming_quality(run):
    for key in list(run.tasks):
        if run.tasks[key].get("task_kind") == "research":
            run.tasks[key]["resolution"] = "in_progress"
    before = run.path.read_bytes()
    assert "wait for research results" in run.call({"op": "next_challenge"})
    assert run.path.read_bytes() == before


def test_six_challenge_nodes_cannot_be_added_through_raw_graph_ops(run):
    before = run.path.read_bytes()
    response = asyncio.run(update_constellation.func([
        {"op": "add_edge", "from": f"t{index}", "to": "t8", "relation": "challenge"}
        for index in range(1, 7)
    ]))
    assert "at most five challenge nodes" in response
    assert run.path.read_bytes() == before


def test_missing_evidence_cannot_be_a_confirmed_error():
    report = '<challenge_result>{"target":"t1","verdict":"confirmed_error","summary":"I disagree","evidence":[]}</challenge_result>'
    result, error = sampling.parse_result(report, "t1")
    assert result is None and "needs evidence" in error


def test_prompts_express_the_stop_rule_cap_and_independence():
    main = get_main_system_prompt("2026-10-16", phase="execution")
    reviewer = get_subagent_system_prompt("sample_challenger", "audit")
    assert "next_challenge" in main and "record_challenge" in main
    assert "FIVE challenge nodes" in main and "STOP sampling immediately" in main
    assert "A random" in main and "NOT proof" in main
    assert "<challenge_result>" in reviewer and "inconclusive" in reviewer
