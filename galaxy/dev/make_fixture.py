"""Write a rich synthetic homepage session for galaxy development.

    python3 galaxy/dev/make_fixture.py <runs_dir>

Creates (or overwrites) ``<runs_dir>/sessions/20261020-120000/`` following the
on-disk layout read by ``constellation.serve --home`` (notes/2d-frontend-spec.md
sections 3.1-3.3): 30 tasks, 6 agents, 3 depth levels, every relation type,
live tool calls, a cancelled task, unassigned tasks and a report with
``<report status=...>`` blocks. Other sessions in ``runs_dir`` are untouched.

Live calls expire 30 minutes after a trajectory file's mtime, so re-run this to
revive them. Standard library only; Python 3.9+.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

STAMP = "20261020-120000"
QUESTION = (
    "地方政府土地财政如何转型？请梳理2020-2025年国有土地使用权出让收入、专项债与城投债务的变化，"
    "比较房产税试点与其他替代财源的可行性，并给出分阶段的政策建议。"
)

# (id, title, agent or None, parent, status, notes)
TASKS = [
    ("t1", "出让收入总量与结构", "fiscal", "goal", "resolved", "2021年 87051 亿元，2024年降至约 4.9 万亿元。"),
    ("t2", "房产税试点回顾", "property", "goal", "resolved", "上海、重庆试点覆盖面有限。"),
    ("t3", "地方债务与城投", "debt", "goal", "resolved", ""),
    ("t4", "城市更新与存量用地", "urban", "goal", "resolved", ""),
    ("t5", "独立核验：收入与试点", "fact_verifier", "goal", "resolved", "两项核验通过。"),
    ("t6", "抽样挑战 1/5", "sample_challenger", "goal", "resolved", "pass: 债务口径一致"),
    ("t7", "抽样挑战 2/5", "sample_challenger", "goal", "resolved", "confirmed_error: 试点税率引用了旧版本"),
    ("t8", "国际经验对比", None, "goal", "open", ""),
    ("t9", "政策建议汇总", None, "goal", "open", ""),
    ("t10", "分省出让收入 2020-2025", "fiscal", "t1", "resolved", "31 省数据已整理。"),
    ("t11", "出让收入口径说明", "fiscal", "t1", "resolved", ""),
    ("t12", "上海试点税基测算", "property", "t2", "in_progress", "\n独立审核确认错误，需修正：税基口径与统计年鉴不一致"),
    ("t13", "重庆试点税率与豁免", "property", "t2", "in_progress", "\n抽样挑战确认错误，需修正：试点税率引用了旧版本"),
    ("t14", "专项债发行规模", "debt", "t3", "resolved", ""),
    ("t15", "城投有息债务", "debt", "t3", "resolved", ""),
    ("t16", "存量用地盘活案例", "urban", "t4", "resolved", ""),
    ("t17", "城市更新资金来源", "urban", "t4", "resolved", ""),
    ("t18", "独立核验：分省数据", "fact_verifier", "t5", "in_progress", ""),
    ("t19", "房地产税立法进展", None, "t2", "open", ""),
    ("t20", "土地储备专项债（已并入 t14）", "fiscal", "t1", "cancelled", "与 t14 重复，取消。"),
    ("t21", "收入下降的周期与结构因素", "fiscal", "t10", "in_progress", ""),
    ("t22", "出让收入占地方综合财力比重", "fiscal", "t10", "resolved", ""),
    ("t23", "试点对房价的影响", "property", "t12", "in_progress", ""),
    ("t24", "债务置换效果", "debt", "t14", "in_progress", ""),
    ("t25", "更新项目收益测算", "urban", "t16", "in_progress", ""),
    ("t26", "口径统一后的收入序列", "fiscal", "t11", "resolved", ""),
    ("t27", "豁免面积的财政影响", "property", "t13", "open", ""),
    ("t28", "城投转型路径", "debt", "t15", "open", ""),
    ("t29", "租赁住房用地供给", None, "t17", "open", ""),
    ("t30", "REITs 与更新融资", "urban", "t17", "open", ""),
]

EXTRA_EDGES = [
    ("t5", "t1", "audit"),
    ("t5", "t1", "support"),
    ("t5", "t2", "audit"),
    ("t5", "t2", "support"),
    ("t18", "t10", "audit"),
    ("t18", "t10", "support"),
    ("t18", "t12", "audit"),
    ("t18", "t12", "error"),
    ("t6", "t3", "challenge"),
    ("t7", "t13", "challenge"),
    ("t7", "t13", "error"),
    ("t11", "t26", "fusion"),
]

TASK_KIND = {"fact_verifier": "verification", "sample_challenger": "challenge"}


def call(name: str, **args: Any) -> Dict[str, Any]:
    return {"name": name, "args": args}


def llm(turn: int, *calls: Dict[str, Any]) -> Dict[str, Any]:
    return {"t": "llm", "turn": turn, "tool_calls": list(calls)}


def result(turn: int, name: str, text: str = "", error: Optional[str] = None, ms: int = 900) -> Dict[str, Any]:
    event: Dict[str, Any] = {"t": "result", "turn": turn, "name": name, "tool_call_id": f"c{turn}-{name}", "ms": ms}
    if error:
        event["error"] = error
    else:
        event["result"] = text
        event["error"] = False
    return event


def compaction(turn: int, before: int, after: int, summary: str) -> Dict[str, Any]:
    return {"t": "compaction", "turn": turn, "tokens_before": before, "tokens_after": after, "summary": summary}


def finished(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{"t": "start"}] + events + [{"t": "end", "turns": len(events), "tool_calls": len(events)}]


def in_flight(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """No `end` event: the last llm calls stay announced but unanswered."""
    return [{"t": "start"}] + events


REPORT_SUBMISSION = "## 出让收入的结构变化\n\n### 1. 总量\n2021 年 87051 亿元。\n"

TRAJECTORIES: Dict[str, List[List[Dict[str, Any]]]] = {
    "fiscal": [
        finished([
            llm(1, call("web_search", q=["国有土地使用权出让收入 2021 87051亿元"])),
            result(1, "web_search", "财政部：2021年全国国有土地使用权出让收入87051亿元，比上年增长3.5%。"),
            llm(2, call("web_search", q=["2022 土地出让收入 66854亿元 下降"])),
            result(2, "web_search", "2022年国有土地使用权出让收入66854亿元，比上年下降23.3%。"),
            llm(3, call("web_fetch", url="https://www.mof.gov.cn/gkml/caizhengshuju/202301/t20230130.htm", info_to_extract="出让收入口径，按年份列出")),
            result(3, "web_fetch", "2020-2023 年出让收入：84142、87051、66854、57996 亿元。"),
            llm(4, call("web_search", q=["2024年 土地出让收入 48699亿元"])),
            result(4, "web_search", "2024年全国国有土地使用权出让收入48699亿元，同比下降16%。"),
            compaction(5, 52000, 9800, "已收集 2020-2024 年出让收入与口径说明。"),
            llm(6, call("web_fetch", url="http://www.stats.gov.cn/blocked/report", info_to_extract="分省出让收入")),
            result(6, "web_fetch", error="HTTP 403 Forbidden"),
        ]),
        finished([
            llm(1, call("bash", command="mkdir -p /workspace/fiscal/tables")),
            result(1, "bash", ""),
            llm(2, call("bash", command="cd /workspace/fiscal/tables")),
            result(2, "bash", ""),
            llm(3, call("bash", command="ls /workspace/fiscal/tables")),
            result(3, "bash", "provinces.csv"),
            llm(4, call("bash", command="ls /workspace/fiscal/tables")),
            result(4, "bash", "provinces.csv"),
            llm(5, call("read_file", path="/workspace/fiscal/tables/provinces.csv")),
            result(5, "read_file", "省份,2020,2021,2022,2023,2024"),
            llm(6, call("bash", command="python3 /workspace/fiscal/share_of_revenue.py --years 2020-2024")),
            result(6, "bash", "出让收入占地方综合财力比重：2020 年 41%，2024 年 27%。"),
            llm(7, call("bash", command="wc -l /workspace/fiscal/tables/provinces.csv")),
            result(7, "bash", "32 provinces.csv"),
            llm(8, call("create_file", path="/workspace/fiscal/notes/收入序列.md", content="# 收入序列\n")),
            result(8, "create_file", "已写入"),
            llm(9, call("submit_report", content=REPORT_SUBMISSION)),
            result(9, "submit_report", "已提交"),
        ]),
        in_flight([
            llm(1, call("web_search", q=["土地出让收入 下降 周期因素 结构因素 2023"])),
            result(1, "web_search", "研究认为下降主要来自房地产周期与人口结构变化。"),
            llm(2,
                call("web_fetch", url="https://www.pbc.gov.cn/research/2024/land.html", info_to_extract="周期因素与结构因素的拆分"),
                call("bash", command="python3 /workspace/fiscal/decompose.py")),
        ]),
    ],
    "property": [
        finished([
            llm(1, call("web_search", q=["上海 房产税 试点 2011 税率 0.6%"])),
            result(1, "web_search", "上海试点对新购第二套及以上住房征收，税率 0.6% 或 0.4%。"),
            llm(2, call("web_search", q=["重庆 房产税 试点 税率 1.2%"])),
            result(2, "web_search", "重庆对高档住房征收，税率 0.5%-1.2%。"),
            llm(3, call("web_fetch", url="https://www.shanghai.gov.cn/nw12344/fangchanshui.html")),
            result(3, "web_fetch", "上海市开展对部分个人住房征收房产税试点的暂行办法。"),
            llm(4, call("bash", command="grep -n 税率 /workspace/property/notes.md")),
            result(4, "bash", "12: 税率 0.6%"),
            llm(5, call("submit_report", content="## 试点回顾\n\n上海与重庆。\n")),
            result(5, "submit_report", "已提交"),
        ]),
        in_flight([
            llm(1, call("read_file", path="/workspace/property/shanghai_base.csv")),
            result(1, "read_file", "年份,应税面积"),
            llm(2, call("bash", command="python3 /workspace/property/calc_tax_base.py")),
        ]),
    ],
    "debt": [
        finished([
            llm(1, call("web_search", q=["2023 地方政府专项债 发行 3.8万亿"])),
            result(1, "web_search", "2023年新增专项债券额度3.8万亿元。"),
            llm(2, call("web_search", q=["城投 有息债务 规模 2023"])),
            result(2, "web_search", "城投有息债务约 60 万亿元（口径不一）。"),
            llm(3, call("web_fetch", url="https://www.celma.org.cn/debt/2024.html", info_to_extract="专项债余额，按年份")),
            result(3, "web_fetch", "2024年末专项债余额约 29 万亿元。"),
            compaction(4, 38000, 7200, "债务数据与口径。"),
            llm(5, call("submit_report", content="## 地方债务\n\n专项债与城投。\n")),
            result(5, "submit_report", "已提交"),
        ]),
        in_flight([
            llm(1, call("web_fetch", url="https://www.gov.cn/zhengce/2024-11/debt-swap.html", info_to_extract="化债置换额度与利息节约")),
        ]),
    ],
    "urban": [
        finished([
            llm(1, call("web_search", q=["城市更新 存量用地 盘活 案例 深圳"])),
            result(1, "web_search", "深圳通过城市更新单元盘活存量用地。"),
            llm(2, call("bash", command="find /workspace/urban -name '*.csv'")),
            result(2, "bash", "/workspace/urban/cases.csv"),
            llm(3, call("bash", command="cat /workspace/urban/cases.csv")),
            result(3, "bash", "城市,项目,面积"),
            llm(4, call("submit_report", content="## 城市更新\n\n案例与资金来源。\n")),
            result(4, "submit_report", "已提交"),
        ]),
        in_flight([
            llm(1, call("bash", command="python3 /workspace/urban/irr.py --project 12")),
            result(1, "bash", "IRR 5.8%"),
            llm(2, call("create_file", path="/workspace/urban/notes/收益测算.md", content="# 收益测算\n")),
        ]),
    ],
    "fact_verifier": [
        finished([
            llm(1, call("read_file", path="/workspace/notes/fiscal.md")),
            result(1, "read_file", "2021年 87051 亿元"),
            llm(2, call("web_search", q=["财政部 2021 土地出让收入 87051"])),
            result(2, "web_search", "已确认。"),
            llm(3, call("read_file", path="/workspace/notes/property.md")),
            result(3, "read_file", "上海税率 0.6%"),
            llm(4, call("submit_report", content="## 核验结论\n\n两项通过。\n")),
            result(4, "submit_report", "已提交"),
        ]),
        # Running, every call answered: the server reports 【思考】.
        in_flight([
            llm(1, call("read_file", path="/workspace/notes/provinces.md")),
            result(1, "read_file", "31 省"),
        ]),
    ],
    "sample_challenger": [
        finished([
            llm(1, call("web_search", q=["城投 有息债务 口径 2023"])),
            result(1, "web_search", "口径一致。"),
            llm(2, call("web_fetch", url="https://www.cq.gov.cn/zwgk/fangchanshui.html", info_to_extract="现行试点税率")),
            result(2, "web_fetch", error="timeout after 30s"),
            llm(3, call("web_fetch", url="https://www.cq.gov.cn/zwgk/fangchanshui-2017.html", info_to_extract="现行试点税率")),
            result(3, "web_fetch", "2017 年修订后税率为 0.5%-1.2%。"),
        ]),
    ],
}

REPORT = """# 地方土地财政转型研究

<report status="complete">
Scope: 研究2020-2025年国有土地使用权出让收入的变化，采用财政部决算口径。
Findings:
**1. 出让收入连续三年下降**
出让收入在 2021 年见顶后连续下降 quality: high（官方决算）。

| 年份 | 出让收入（亿元） | 同比 |
| --- | ---: | ---: |
| 2020 | 84142 | 15.9% |
| 2021 | 87051 | 3.5% |
| 2022 | 66854 | -23.3% |
| 2023 | 57996 | -13.2% |
| 2024 | 48699 | -16.0% |

下降主要来自住宅用地成交萎缩，分省差异明显。

Evidence:
- https://www.mof.gov.cn/gkml/caizhengshuju/202301/t20230130.htm — 财政部 2022 年财政收支情况 quality: high
- https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/202501/t20250124.htm — 财政部 2024 年财政收支情况
- /Users/someone/workspace/fiscal/notes.md — 本地笔记
Confidence: 高，口径来自官方决算。
Unresolved:
- 2025 年全年数据尚未公布。
Disconfirming: 部分研究认为 2024 年降幅被土地储备专项债平滑。
Conflicts: 统计局与财政部口径存在差异。
</report>

<report status="complete">
Scope: 比较房产税试点与其他替代财源的可行性。
Findings:
**1. 房产税试点覆盖面有限**
上海、重庆试点自 2011 年起实施，税收规模占地方收入不足 1%。

| 城市 | 起始年份 | 税率 | 征收对象 |
| --- | --- | --- | --- |
| 上海 | 2011 | 0.4%-0.6% | 新购第二套及以上住房 |
| 重庆 | 2011 | 0.5%-1.2% | 独栋别墅与高档住房 |

Evidence:
- https://www.shanghai.gov.cn/nw12344/fangchanshui.html — 上海市暂行办法
Confidence: 中。
</report>

<report status="incomplete">
Scope: 国际经验对比（未完成）。
Findings:
草稿：尚未收集。
</report>

<report status="complete">
## Completeness Check
覆盖了收入、债务与试点三部分。
## Correctness Check
关键数字均有官方来源。
## Deliverable Check
已给出分阶段建议。
</report>
"""


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_events(path: Path, events: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(event, ensure_ascii=False) + "\n" for event in events), encoding="utf-8")


def build(runs: Path) -> Path:
    session = runs / "sessions" / STAMP
    if session.exists():
        shutil.rmtree(session)
    trial = session / "generation" / "trials" / "1"
    worktree = trial / "sandbox" / "worktree"

    save_json(session / "session.json", {
        "id": f"sessions/{STAMP}/1",
        "question": QUESTION,
        "created_at": "2026-10-20T12:00:00+08:00",
        "status": "running",
        "error": "",
        "pid": 0,
    })
    (session / "job.log").write_text("synthetic fixture\n", encoding="utf-8")
    task_dir = session / "generation" / "tasks" / "1"
    task_dir.mkdir(parents=True, exist_ok=True)
    (task_dir / "instruction.md").write_text(f"# Task\n\n{QUESTION}\n\n## Submission contract (mandatory)\n\n...\n", encoding="utf-8")
    (task_dir / "task.toml").write_text('version = "1.0"\n', encoding="utf-8")
    save_json(trial / "config.json", {"synthetic": True})

    edges = [{"from": parent, "to": tid, "relation": "parent"} for tid, _, _, parent, _, _ in TASKS]
    edges += [{"from": a, "to": b, "relation": rel} for a, b, rel in EXTRA_EDGES]
    save_json(worktree / "constellation.json", {
        "version": 42,
        "updated_at": "2026-10-20T04:30:00Z",
        "goal": {"id": "goal", "title": f"# Task\n\n{QUESTION}\n\n## Submission contract (mandatory)\n..."},
        "nodes": [
            {"id": tid, "title": title, "task_id": tid, "agents": [agent] if agent else []}
            for tid, title, agent, _, _, _ in TASKS
        ],
        "edges": edges,
    })
    board = {}
    for tid, title, agent, _, status, notes in TASKS:
        entry = {"description": title, "resolution": status, "owners": [agent] if agent else [], "notes": notes}
        entry["task_kind"] = TASK_KIND.get(agent or "", "research")
        board[tid] = entry
    save_json(worktree / "task_board.json", {"tasks": board})

    subagents = trial / "agent" / "trajectories" / "subagents"
    for agent, files in TRAJECTORIES.items():
        for index, events in enumerate(files, start=1):
            write_events(subagents / f"{agent}.t{index:02d}.jsonl", events)

    outputs = trial / "sandbox" / "outputs"
    outputs.mkdir(parents=True, exist_ok=True)
    (outputs / "report.md").write_text(REPORT, encoding="utf-8")

    # Fresh mtimes keep the live calls alive for the next 30 minutes.
    now = time.time()
    for path in sorted(subagents.glob("*.jsonl")):
        os.utime(path, (now, now))
    return session


def main(argv: List[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    session = build(Path(argv[1]).expanduser().resolve())
    print(f"wrote {session} ({len(TASKS)} tasks, {len(TRAJECTORIES)} agents)")
    print(f"study id: sessions/{STAMP}/1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
