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
from plugins.tools import _evidence_reviews as reviews
from plugins.tools.constellation import init_constellation, update_constellation
from plugins.tools.finalize_answer import finalize_gate
from plugins.tools.task_board import add_task, board_tasks, clear_board, update_task
from workflows.agent_team.prompts import get_main_system_prompt, get_subagent_system_prompt


@pytest.fixture
def run(tmp_path, monkeypatch):
    scope = ExecutionScope(task_id="review-test", phase_id="execution", role_id="agent_team_main",
                           metadata={"constellation_dir": str(tmp_path), "evidence_reviews_enabled": True})
    token = set_current_execution_scope(scope)
    init_constellation(tmp_path, "Context management")
    session = SimpleNamespace(total_task_count=1, last_report="", current_job_id=None, pending_tasks=[])
    monkeypatch.setattr(reviews, "_session", lambda scope, name: session)
    asyncio.run(add_task.func([
        {"description": "研究压缩方法", "owner": "compression_research", "task_kind": "research"},
        {"description": "研究基准数据", "owner": "benchmark_research", "task_kind": "research"},
        {"description": "分批核验主要断言", "owner": "fact_verifier", "task_kind": "verification"},
    ]))
    tasks = board_tasks(scope.task_id)
    asyncio.run(update_task.func([
        {"id": key, "resolution": "resolved" if key != "t3" else "in_progress", "notes": "reported results"}
        for key in tasks
    ]))
    ops = []
    for key in tasks:
        ops.extend([{"op": "add_node", "id": key}, {"op": "add_edge", "from": "goal", "to": key, "relation": "parent"}])
    assert not asyncio.run(update_constellation.func(ops)).startswith("Error")
    def graph():
        return json.loads((tmp_path / "constellation.json").read_text())
    def finding(target="t1", verdict="confirmed"):
        return {"target": target, "verdict": verdict, "claim": "原断言：得分 81",
                "reason": "重新打开原始表格比较实验条件与得分", "source": "https://example.org/results",
                "quote": "score: 81", "correction": "相同实验设置下应为 71"}
    def record(findings=None, *, raw_report=None):
        session.last_report = raw_report if raw_report is not None else (
            "Independent checks.\n<review_result>" + json.dumps({"reviewer": "t3", "findings": findings or [finding()]})
            + "</review_result>")
        return asyncio.run(update_constellation.func([{"op": "record_review", "reviewer": "t3", "agent": "fact_verifier"}]))
    try:
        yield SimpleNamespace(scope=scope, tasks=tasks, graph=graph, session=session, finding=finding,
                              record=record, path=tmp_path / "constellation.json")
    finally:
        clear_board(scope.task_id)
        reset_current_execution_scope(token)


def test_batch_review_records_real_inspection_and_only_confirmed_support(run):
    assert not run.record([run.finding(), run.finding("t2", "inconclusive")]).startswith("Error")
    edges = run.graph()["edges"]
    assert {"from": "t3", "to": "t1", "relation": "audit"} in edges
    assert {"from": "t3", "to": "t1", "relation": "support"} in edges
    assert {"from": "t3", "to": "t2", "relation": "audit"} in edges
    assert {"from": "t3", "to": "t2", "relation": "support"} not in edges
    ledger = run.graph()["evidence_reviews"][0]
    assert ledger["agent"] == "fact_verifier"
    assert ledger["findings"][0]["quote"] == "score: 81"
    assert len(ledger["report_digest"]) == 64


def test_real_report_is_required_and_in_progress_reviewer_cannot_record(run):
    before = run.path.read_bytes()
    assert "exactly one" in run.record(raw_report="I agree with everything")
    run.session.current_job_id = "running"
    assert "completed" in run.record()
    run.session.current_job_id = None
    run.session.pending_tasks = ["next batch"]
    assert "completed" in run.record()
    assert run.path.read_bytes() == before


def test_self_review_and_raw_decorative_lines_are_rejected(run):
    run.tasks["t1"]["owners"] = ["fact_verifier"]
    before = run.path.read_bytes()
    assert "independent owners" in run.record()
    for relation in ("audit", "support"):
        result = asyncio.run(update_constellation.func([
            {"op": "add_edge", "from": "t3", "to": "t1", "relation": relation}]))
        assert "record_review" in result
    assert run.path.read_bytes() == before


def test_missing_evidence_never_becomes_support_and_batch_is_atomic(run):
    bad = run.finding("t2")
    bad["quote"] = ""
    before = run.path.read_bytes()
    assert "require source and quote" in run.record([run.finding(), bad])
    assert run.path.read_bytes() == before
    assert run.tasks["t1"]["resolution"] == "resolved"


def test_duplicate_report_is_idempotent_and_new_error_withdraws_support(run):
    run.record()
    before = run.path.read_bytes()
    run.record()
    assert run.path.read_bytes() == before
    run.record([run.finding(verdict="error")])
    edges = run.graph()["edges"]
    assert {"from": "t3", "to": "t1", "relation": "support"} not in edges
    assert {"from": "t3", "to": "t1", "relation": "audit"} in edges
    assert {"from": "t3", "to": "t1", "relation": "error"} in edges
    assert run.tasks["t1"]["resolution"] == "in_progress"
    assert "71" in run.tasks["t1"]["notes"]
    assert len(run.graph()["evidence_reviews"]) == 2
    assert "unresolved" in finalize_gate(run.scope.task_id, "answer")


def test_mixed_claim_verdicts_do_not_certify_a_node(run):
    run.record([run.finding(), run.finding(verdict="inconclusive")])
    assert {"from": "t3", "to": "t1", "relation": "support"} not in run.graph()["edges"]


def test_missing_review_blocks_finish_but_uncertainty_does_not_force_support(run):
    asyncio.run(update_task.func([{"id": "t3", "resolution": "resolved"}]))
    assert "record_review" in finalize_gate(run.scope.task_id, "answer")
    run.record([run.finding(verdict="inconclusive")])
    assert finalize_gate(run.scope.task_id, "answer") is None
    assert not any(edge["relation"] == "support" for edge in run.graph()["edges"])


@pytest.mark.parametrize("raw_report", [
    '<review_result>[]</review_result>',
    '<review_result>{"reviewer":"t3","findings":[null]}</review_result>',
    '<review_result>{"reviewer":"t3","findings":[]}</review_result>',
    '<review_result>{"reviewer":"other","findings":[]}</review_result>',
])
def test_malformed_reports_leave_graph_unchanged(run, raw_report):
    before = run.path.read_bytes()
    assert run.record(raw_report=raw_report).startswith("Error")
    assert run.path.read_bytes() == before


def test_prompts_review_early_in_batches_without_extra_challenge_campaign():
    prompt = get_main_system_prompt("2026-10-16", phase="execution")
    assert "first 2-3" in prompt
    assert "record_review" in prompt
    assert "never create decorative relationships" in prompt
    assert "FIVE challenge nodes" in prompt
    assert "no recorded" not in get_main_system_prompt("2026-10-16", phase="planning")
    assert "<review_result>" in get_subagent_system_prompt("fact_verifier")
    assert "<review_result>" in get_subagent_system_prompt("local_verifier")
