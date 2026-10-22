// Dev-only harness for the scene: /prism/dev/scene?study=<id>
// URL flags: quality=high|low|auto, panel=1 (400px right inset), sheet=1 (bottom sheet),
// select=<id> (after the first snapshot), lens=1, reduced=1, hide=<agent>, tab=tasks (start hidden).
// Buttons carry data-dev="…" for scripted screenshots.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStudy, type Quality } from "../../study/store";
import type { LiveCall, Snapshot, ViewNode } from "../../types/api";
import StudyScene from "../StudyScene";

const DEFAULT_STUDY = "sessions/20261020-120000/1";

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function DevButton({ id, onClick, active, children }: { id: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      data-dev={id}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs font-medium ${active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-secondary bg-primary text-secondary hover:bg-secondary"}`}
    >
      {children}
    </button>
  );
}

/** A copy of the snapshot with a new revision (so the poller's next same-revision tick keeps it). */
function mutate(view: Snapshot, change: (nodes: ViewNode[]) => ViewNode[]): Snapshot {
  return { ...view, nodes: change(view.nodes.map((node) => ({ ...node }))), revision: `dev-${Date.now()}` };
}

export default function SceneHarness() {
  const view = useStudy((s) => s.view);
  const selectedId = useStudy((s) => s.selectedId);
  const lens = useStudy((s) => s.lens);
  const hiddenAgents = useStudy((s) => s.hiddenAgents);
  const reducedMotion = useStudy((s) => s.reducedMotion);
  const quality = useStudy((s) => s.quality);
  const tier = useStudy((s) => s.effectiveQuality);
  const tab = useStudy((s) => s.tab);
  const [panel, setPanel] = useState(() => params().get("panel") === "1");
  const [sheet, setSheet] = useState(() => params().get("sheet") === "1");
  const [height, setHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    const p = params();
    const stop = useStudy.getState().startStudy(p.get("study") || DEFAULT_STUDY);
    const q = p.get("quality");
    if (q === "high" || q === "low" || q === "auto") useStudy.getState().setQuality(q as Quality);
    if (p.get("reduced") === "1") useStudy.setState({ reducedMotion: true });
    if (p.get("tab") === "tasks") useStudy.getState().setTab("tasks");
    // live=1: inject live calls once the first snapshot is in (see injectLive).
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => {
      stop();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // URL selections once the first snapshot is in.
  const loaded = view !== null;
  useEffect(() => {
    if (!loaded) return;
    const p = params();
    const store = useStudy.getState();
    if (p.get("lens") === "1" && !store.lens) store.toggleLens();
    const hide = p.get("hide");
    if (hide) store.toggleAgent(hide);
    const select = p.get("select");
    if (select) window.setTimeout(() => useStudy.getState().select(select), 2600);
  }, [loaded]);

  const tasks = useMemo(() => (view?.nodes ?? []).filter((node) => !node.goal), [view]);
  const agents = useMemo(() => [...new Set(tasks.flatMap((node) => node.agents))], [tasks]);
  const store = useStudy.getState;

  const selectNext = () => {
    const list = tasks.map((node) => node.id);
    if (!list.length) return;
    const i = selectedId ? list.indexOf(selectedId) : -1;
    store().select(list[(i + 1) % list.length]!);
  };
  const selectLive = () => {
    const live = tasks.find((node) => node.status === "in_progress") ?? tasks[0];
    if (live) store().select(live.id);
  };
  const cycleAgent = () => {
    if (!agents.length) return;
    const hidden = Object.keys(hiddenAgents);
    if (!hidden.length) store().toggleAgent(agents[0]!);
    else {
      const next = agents[(agents.indexOf(hidden[0]!) + 1) % agents.length]!;
      store().showAllAgents();
      if (next !== agents[0]) store().toggleAgent(next);
    }
  };
  const flipOne = () => {
    if (!view) return;
    const target = view.nodes.find((node) => node.status === "open" && !node.goal) ?? view.nodes.find((node) => node.status === "in_progress");
    if (!target) return;
    useStudy.setState({
      view: mutate(view, (nodes) =>
        nodes.map((node) => (node.id === target.id ? { ...node, status: node.status === "open" ? "in_progress" : "resolved", agents: node.agents.length ? node.agents : ["fiscal"], tone: node.tone === "pending" ? "green" : node.tone } : node)),
      ),
    });
  };
  // The fixture's live calls expire after 30 minutes; this puts some back on in-progress tasks.
  const injectLive = () => {
    if (!view) return;
    const samples: LiveCall[][] = [
      [{ tool: "bash", label: "【执行】calc tax base.py", hint: "python3 calc_tax_base.py", error: false, count: 1 }],
      [{ tool: "思考", label: "【思考】", hint: "正在想下一步", error: false, count: 1 }],
      [
        { tool: "web_fetch", label: "【浏览】周期因素与结构因素的拆分", error: false, count: 1 },
        { tool: "bash", label: "【执行】decompose.py", error: false, count: 1 },
      ],
    ];
    let i = 0;
    useStudy.setState({
      view: mutate(view, (nodes) => nodes.map((node) => (node.status === "in_progress" && i < 6 ? { ...node, live: samples[i++ % samples.length]! } : node))),
    });
  };
  const addOne = () => {
    if (!view) return;
    const n = view.nodes.length;
    const base = view.nodes.find((node) => node.goal) ?? view.nodes[0];
    if (!base) return;
    const angle = n * 2.4;
    const node: ViewNode = {
      ...base,
      id: `t${100 + n}`,
      title: `新任务 ${n}：补充数据核验`,
      goal: false,
      weight: "node",
      tone: "violet",
      agents: ["debt"],
      status: "in_progress",
      x: base.x + Math.cos(angle) * 1500,
      y: base.y + Math.sin(angle) * 1500,
      radius: 50,
      step_count: 2,
      live: [{ tool: "web_search", label: "【搜索】城投债务置换 2025", error: false, count: 1 }],
    };
    useStudy.setState({ view: { ...mutate(view, (nodes) => [...nodes, node]), edges: [...view.edges, { from: base.id, to: node.id, relation: "parent" }] } });
  };

  const rightInset = panel ? 400 : 0;
  const bottomInset = sheet ? Math.round(height * 0.45) : 0;

  return (
    <div className="relative h-dvh overflow-hidden bg-primary">
      {/* Like the study chrome: the scene stays mounted but hidden and inert off the map tab. */}
      <div className={tab === "map" ? "absolute inset-0" : "invisible absolute inset-0"} inert={tab !== "map" || undefined}>
        <StudyScene rightInset={rightInset} bottomInset={bottomInset} />
      </div>
      {panel ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[400px] border-l border-secondary bg-primary/85 p-4 text-sm text-tertiary shadow-xl backdrop-blur-sm">detail panel (400px)</div>
      ) : null}
      {sheet ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-secondary bg-primary/85 p-4 text-sm text-tertiary shadow-xl backdrop-blur-sm" style={{ height: bottomInset }}>
          bottom sheet
        </div>
      ) : null}
      <div className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-xl border border-secondary bg-primary/90 p-2 shadow-sm backdrop-blur-sm">
        <DevButton id="select" onClick={selectLive}>
          select live
        </DevButton>
        <DevButton id="next" onClick={selectNext}>
          next
        </DevButton>
        <DevButton id="goal-select" onClick={() => { const goal = view?.nodes.find((node) => node.goal); if (goal) store().select(goal.id); }}>
          select goal
        </DevButton>
        <DevButton id="deselect" onClick={() => store().select(null)}>
          deselect
        </DevButton>
        <DevButton id="overview" onClick={() => store().emitCamera({ kind: "overview" })}>
          overview
        </DevButton>
        <DevButton id="core" onClick={() => store().emitCamera({ kind: "core" })}>
          goal
        </DevButton>
        <DevButton id="zoom-in" onClick={() => store().emitCamera({ kind: "zoom", step: 1 })}>
          zoom +
        </DevButton>
        <DevButton id="zoom-out" onClick={() => store().emitCamera({ kind: "zoom", step: -1 })}>
          zoom −
        </DevButton>
        <DevButton id="lens" active={lens} onClick={() => store().toggleLens()}>
          lens
        </DevButton>
        <DevButton id="agent" active={Object.keys(hiddenAgents).length > 0} onClick={cycleAgent}>
          hide {Object.keys(hiddenAgents)[0] ?? "agent"}
        </DevButton>
        <DevButton id="reduced" active={reducedMotion} onClick={() => useStudy.setState({ reducedMotion: !reducedMotion })}>
          reduced
        </DevButton>
        <DevButton id="quality" onClick={() => store().setQuality(quality === "auto" ? "high" : quality === "high" ? "low" : "auto")}>
          q: {quality} ({tier})
        </DevButton>
        <DevButton id="panel" active={panel} onClick={() => setPanel((v) => !v)}>
          panel
        </DevButton>
        <DevButton id="sheet" active={sheet} onClick={() => setSheet((v) => !v)}>
          sheet
        </DevButton>
        <DevButton id="tab" active={tab !== "map"} onClick={() => store().setTab(tab === "map" ? "tasks" : "map")}>
          {tab === "map" ? "hide map" : "show map"}
        </DevButton>
        <DevButton id="flip" onClick={flipOne}>
          flip status
        </DevButton>
        <DevButton id="live" onClick={injectLive}>
          live calls
        </DevButton>
        <DevButton id="add" onClick={addOne}>
          add task
        </DevButton>
        <span className="self-center px-1 font-mono text-xs text-tertiary">{selectedId ?? "—"}</span>
      </div>
    </div>
  );
}
