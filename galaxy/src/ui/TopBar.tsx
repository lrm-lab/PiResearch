// Top bar: brand, question, phase chip, progress and the scene controls.
// 报告 and the Galaxy / Prism / 2D switch stay visible at every width; ≤1180 px the
// quality label shortens and ≤900 px the other scene controls fold into a menu.

import { useCallback, useRef } from "react";
import { goalActivity, phaseLabel, progress } from "../lib/activity";
import { useDismiss } from "../lib/hooks";
import { TITLE_LOADING, TITLE_NO_GRAPH } from "../lib/report";
import { type Quality, useGalaxy } from "../store";
import {
  IconCheck,
  IconCore,
  IconDownload,
  IconHelp,
  IconLens,
  IconMore,
  IconQuality,
  IconReport,
  IconReset,
} from "./icons";
import { exportAll, useExport } from "./exportRun";
import { MenuPopover } from "./Menu";
import { UiSwitch } from "./UiSwitch";
import { REPORT_BUTTON_ID, useUi } from "./uiStore";

const QUALITY_LABEL: Record<Quality, string> = { auto: "自动", high: "高", low: "低" };
const QUALITIES: Quality[] = ["auto", "high", "low"];

export function TopBar() {
  const view = useGalaxy((state) => state.view);
  const loadState = useGalaxy((state) => state.loadState);
  const retrying = useGalaxy((state) => !state.view && state.loadState === "error" && state.errorKind === "retry");
  const question = view?.ok ? (view.goal?.title ?? "") : loadState === "loading" || retrying ? TITLE_LOADING : TITLE_NO_GRAPH;

  return (
    <header className="topbar glass hud-auto">
      <a href="/galaxy/" title="回到主页" className="topbar-brand">
        <span className="topbar-brand-mark" aria-hidden="true" />
        <span className="topbar-brand-text">PiResearch</span>
      </a>
      <span className="topbar-divider" aria-hidden="true" />
      <h1 className="topbar-question" title={question}>
        {question}
      </h1>
      {view?.ok && <StudyMeta />}
      <Actions />
      <div className="topbar-question-row">
        <p className="topbar-question" title={question}>
          {question}
        </p>
      </div>
    </header>
  );
}

function StudyMeta() {
  const view = useGalaxy((state) => state.view);
  const { resolved, total } = progress(view);
  const activity = goalActivity(view);
  const running = Boolean(view?.running);
  const phase = activity ? activity.phase : running ? "running" : "ended";
  const ratio = total ? resolved / total : 0;
  const circumference = 2 * Math.PI * 7.5;

  return (
    <div className="topbar-meta">
      <span className="g-chip phase-chip" data-phase={phase} role="status" aria-live="polite">
        {phase === "running" && <span className="g-dot g-dot-live" style={{ ["--dot-color" as string]: "var(--chip-color)" }} />}
        {(phase === "planning" || phase === "finalizing") && <span className="phase-orbit" aria-hidden="true" />}
        {phase === "ended" && <span className="g-dot" style={{ ["--dot-color" as string]: "var(--chip-color)", boxShadow: "none" }} />}
        {phaseLabel(view)}
      </span>
      <span className="progress-readout" aria-label={`已完成 ${resolved} / ${total}`}>
        <svg className="progress-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <defs>
            <linearGradient id="g-progress-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#48d3e4" />
              <stop offset="1" stopColor="#58d69a" />
            </linearGradient>
          </defs>
          <circle className="track" cx="10" cy="10" r="7.5" />
          <circle
            className="bar"
            cx="10"
            cy="10"
            r="7.5"
            transform="rotate(-90 10 10)"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
          />
        </svg>
        <span aria-hidden="true">
          <span className="progress-word">已完成 </span>
          <b>{resolved}</b> / {total}
        </span>
      </span>
      <span className="topbar-progress-line" aria-hidden="true">
        <span style={{ width: `${ratio * 100}%` }} />
      </span>
    </div>
  );
}

function Actions() {
  const view = useGalaxy((state) => state.view);
  const studyId = useGalaxy((state) => state.studyId);
  const lens = useGalaxy((state) => state.lens);
  const toggleLens = useGalaxy((state) => state.toggleLens);
  const emitCamera = useGalaxy((state) => state.emitCamera);
  const quality = useGalaxy((state) => state.quality);
  const effective = useGalaxy((state) => state.effectiveQuality);
  const setQuality = useGalaxy((state) => state.setQuality);
  const menu = useUi((state) => state.menu);
  const setMenu = useUi((state) => state.setMenu);
  const toggleMenu = useUi((state) => state.toggleMenu);
  const beginReport = useUi((state) => state.beginReport);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMenu(null), [setMenu]);
  useDismiss(ref, menu !== null, close);

  const hasReport = Boolean(view?.report);
  const finished = hasReport && view?.ok === true && view.running === false;
  const hasGoal = Boolean(view?.ok && view.nodes.some((node) => node.goal));
  const exporting = useExport((state) => state.phase === "running");
  const canExport = Boolean(view?.ok) && !exporting;
  const qualityHint = quality === "auto" ? `自动 · ${QUALITY_LABEL[effective]}` : QUALITY_LABEL[quality];

  const qualityItems = QUALITIES.map((value) => (
    <button
      key={value}
      type="button"
      role="menuitemradio"
      aria-checked={quality === value}
      className="g-menu-item"
      onClick={() => {
        setQuality(value);
        setMenu(null);
      }}
    >
      {quality === value ? <IconCheck /> : <span style={{ width: 16 }} aria-hidden="true" />}
      {QUALITY_LABEL[value]}
      {value === "auto" && <span className="hint">按帧率切换{quality === "auto" ? ` · 当前${QUALITY_LABEL[effective]}` : ""}</span>}
      {value === "high" && <span className="hint">全部特效</span>}
      {value === "low" && <span className="hint">省电</span>}
    </button>
  ));

  const exportItems = (
    <>
      <button
        type="button"
        role="menuitem"
        className="g-menu-item"
        aria-disabled={!canExport}
        onClick={() => {
          if (!canExport) return;
          setMenu(null);
          void exportAll("md");
        }}
      >
        <IconDownload />
        导出全部轨迹（Markdown）
        <span className="hint">.md</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="g-menu-item"
        aria-disabled={!canExport}
        onClick={() => {
          if (!canExport) return;
          setMenu(null);
          void exportAll("json");
        }}
      >
        <IconDownload />
        导出全部轨迹（JSON）
        <span className="hint">.json</span>
      </button>
    </>
  );

  return (
    <div className="topbar-actions" ref={ref}>
      <button
        id={REPORT_BUTTON_ID}
        type="button"
        className={`g-btn g-btn-accent g-tip topbar-report${finished ? " is-ready" : ""}`}
        aria-disabled={!hasReport}
        aria-haspopup="dialog"
        data-tip={hasReport ? undefined : "这份运行还没有报告"}
        data-tip-align="end"
        onClick={() => hasReport && beginReport()}
      >
        <IconReport />
        <span className="btn-label">报告</span>
        {!hasReport && <span className="sr-only">（这份运行还没有报告）</span>}
      </button>

      {studyId && <UiSwitch studyId={studyId} className="topbar-ui-switch" />}

      <span className="wide-only topbar-actions">
        <button
          type="button"
          className="g-btn g-btn-toggle g-tip"
          aria-pressed={lens}
          aria-keyshortcuts="V"
          data-tip="核验透镜：只看审核、支持、挑战和错误（V）"
          data-tip-align="end"
          onClick={toggleLens}
        >
          <IconLens />
          <span className="btn-label">核验透镜</span>
        </button>

        <span className="relative">
          <button
            id="galaxy-export-button"
            type="button"
            className="g-btn g-btn-toggle"
            aria-haspopup="menu"
            aria-expanded={menu === "export"}
            aria-label="导出轨迹"
            onClick={() => toggleMenu("export")}
          >
            <IconDownload />
            <span className="btn-label">导出</span>
          </button>
          <MenuPopover open={menu === "export"} label="导出轨迹" onClose={close} triggerId="galaxy-export-button">
            <div className="g-kicker g-menu-label">导出研究轨迹</div>
            {exportItems}
          </MenuPopover>
        </span>

        <span className="relative">
          <button
            id="galaxy-quality-button"
            type="button"
            className="g-btn g-btn-toggle"
            aria-haspopup="menu"
            aria-expanded={menu === "quality"}
            aria-label={`画质：${qualityHint}`}
            onClick={() => toggleMenu("quality")}
          >
            <IconQuality />
            <span className="btn-label">画质</span>
            <span className="btn-label btn-label-wide" style={{ color: "var(--g-ink-faint)" }}>
              {QUALITY_LABEL[quality]}
            </span>
          </button>
          <MenuPopover open={menu === "quality"} label="画质" onClose={close} triggerId="galaxy-quality-button">
            <div className="g-kicker g-menu-label">画质</div>
            {qualityItems}
          </MenuPopover>
        </span>

        <button
          type="button"
          className="g-btn g-btn-icon g-tip"
          aria-label="回到主节点"
          aria-keyshortcuts="F"
          data-tip="回到主节点（F）"
          data-tip-align="end"
          disabled={!hasGoal}
          onClick={() => emitCamera({ kind: "core" })}
        >
          <IconCore />
        </button>
        <button
          type="button"
          className="g-btn g-btn-icon g-tip"
          aria-label="重置视角"
          aria-keyshortcuts="R"
          data-tip="重置视角（R）"
          data-tip-align="end"
          onClick={() => emitCamera({ kind: "overview" })}
        >
          <IconReset />
        </button>
        <span className="relative">
          <button
            id="galaxy-help-button"
            type="button"
            className="g-btn g-btn-icon g-btn-toggle"
            aria-label="快捷键"
            aria-keyshortcuts="?"
            aria-haspopup="dialog"
            aria-expanded={menu === "help"}
            onClick={() => toggleMenu("help")}
          >
            <IconHelp />
          </button>
          <MenuPopover open={menu === "help"} label="快捷键" onClose={close} triggerId="galaxy-help-button" className="help" role="dialog">
            <ShortcutList />
          </MenuPopover>
        </span>
      </span>

      <span className="narrow-only relative">
        <button
          id="galaxy-more-button"
          type="button"
          className="g-btn g-btn-icon g-btn-toggle"
          aria-label="更多操作"
          aria-haspopup="menu"
          aria-expanded={menu === "more"}
          onClick={() => toggleMenu("more")}
        >
          <IconMore />
        </button>
        <MenuPopover open={menu === "more"} label="更多操作" onClose={close} triggerId="galaxy-more-button">
          <button type="button" role="menuitemcheckbox" aria-checked={lens} className="g-menu-item" onClick={() => toggleLens()}>
            <IconLens />
            核验透镜
            <span className="hint">V</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="g-menu-item"
            aria-disabled={!hasGoal}
            onClick={() => {
              if (!hasGoal) return;
              emitCamera({ kind: "core" });
              setMenu(null);
            }}
          >
            <IconCore />
            回到主节点
            <span className="hint">F</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="g-menu-item"
            onClick={() => {
              emitCamera({ kind: "overview" });
              setMenu(null);
            }}
          >
            <IconReset />
            重置视角
            <span className="hint">R</span>
          </button>
          <button type="button" role="menuitem" className="g-menu-item" onClick={() => setMenu("help")}>
            <IconHelp />
            快捷键
            <span className="hint">?</span>
          </button>
          <div className="g-menu-sep" role="separator" />
          {exportItems}
          <div className="g-menu-sep" role="separator" />
          <div className="g-kicker g-menu-label">画质</div>
          {qualityItems}
        </MenuPopover>
        <MenuPopover open={menu === "help"} label="快捷键" onClose={close} triggerId="galaxy-more-button" className="help" role="dialog">
          <ShortcutList />
        </MenuPopover>
      </span>
    </div>
  );
}

function ShortcutList() {
  const rows: [string[], string][] = [
    [["V"], "核验透镜"],
    [["F"], "回到主节点"],
    [["R"], "重置视角"],
    [["Tab"], "在节点之间移动"],
    [["Enter"], "选中节点"],
    [["Esc"], "关闭面板或报告"],
    [["?"], "显示快捷键"],
  ];
  return (
    <>
      <div className="g-kicker">快捷键</div>
      <dl>
        {rows.map(([keys, label]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt>
              {keys.map((key) => (
                <kbd key={key} className="g-kbd">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
