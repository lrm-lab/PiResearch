// Detail panel: <aside aria-label="节点详情">, right column on desktop, bottom sheet ≤900 px.

import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import type { ReactNode } from "react";
import { goalActivity, progress, stateText, toolCount } from "../lib/activity";
import { headingPane } from "../lib/heading";
import { useMediaQuery } from "../lib/media";
import { TONE_COLOR, toneColor } from "../lib/palette";
import { findGoal, findNode, useGalaxy, useNodeDetail, useSelectedNode } from "../store";
import type { ViewNode } from "../types/api";
import { childState, goalMeta, goalSummary } from "./childState";
import { SHEET_QUERY } from "./hooks";
import { IconCheck, IconChevron, IconClose, IconCore } from "./icons";
import { SignalTrace } from "./SignalTrace";
import { ToolChipsRow } from "./ToolBoard";
import { stateColor } from "./tokens";
import { exportTask } from "./exportRun";
import { useUi } from "./uiStore";

const EASE = [0.22, 1, 0.36, 1] as const;

export function DetailPanel() {
  const node = useSelectedNode();
  const sheet = useMediaQuery(SHEET_QUERY);
  return <AnimatePresence>{node && <Panel key={sheet ? "sheet" : "side"} node={node} sheet={sheet} />}</AnimatePresence>;
}

function Panel({ node, sheet }: { node: ViewNode; sheet: boolean }) {
  // During the exit animation the store no longer has a selection; keep the last node.
  const live = useSelectedNode();
  const shown = live ?? node;
  const select = useGalaxy((state) => state.select);
  const goalId = useGalaxy((state) => findGoal(state.view)?.id ?? null);
  const expanded = useUi((state) => state.sheetExpanded);
  const setExpanded = useUi((state) => state.setSheetExpanded);
  const closeDetail = useUi((state) => state.closeDetail);
  const drag = useDragControls();
  const tone = toneColor(shown.tone);

  function close() {
    closeDetail(shown.id);
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const { y } = info.offset;
    const v = info.velocity.y;
    if (y < -40 || v < -500) setExpanded(true);
    else if (expanded && (y > 50 || v > 500)) setExpanded(false);
    else if (!expanded && (y > 120 || v > 800)) close();
  }

  return (
    <motion.aside
      aria-label="节点详情"
      className="detail glass glass-strong glass-glow hud-auto"
      data-expanded={sheet && expanded}
      style={{ ["--glow-color" as string]: tone }}
      initial={sheet ? { y: "100%", opacity: 0.6 } : { x: 40, opacity: 0, scale: 0.98 }}
      animate={sheet ? { y: 0, opacity: 1 } : { x: 0, opacity: 1, scale: 1 }}
      exit={sheet ? { y: "100%", opacity: 0.6 } : { x: 32, opacity: 0, scale: 0.985 }}
      transition={{ duration: sheet ? 0.36 : 0.42, ease: EASE }}
      drag={sheet ? "y" : false}
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.18}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
    >
      {sheet && (
        <button
          type="button"
          className="detail-handle"
          aria-label={expanded ? "收起详情" : "展开详情"}
          aria-expanded={expanded}
          onPointerDown={(event) => drag.start(event)}
          onClick={() => setExpanded(!expanded)}
        />
      )}
      <div className="detail-header">
        <span className="g-kicker">
          <span className="g-dot" style={{ ["--dot-color" as string]: tone }} />
          {shown.goal ? "研究主问题" : "研究任务"}
          {!shown.goal && <span style={{ fontFamily: "var(--font-tool)", letterSpacing: 0 }}>· {shown.id.toUpperCase()}</span>}
        </span>
        {!shown.goal && goalId && (
          <button type="button" className="g-btn" style={{ height: 30, padding: "0 10px", fontSize: 12.5 }} onClick={() => select(goalId)}>
            <IconCore />
            回到主节点
          </button>
        )}
        <button type="button" className="g-btn g-btn-icon" aria-label="关闭节点详情" onClick={close}>
          <IconClose />
        </button>
      </div>
      <motion.div
        key={shown.id}
        className="detail-body g-scroll"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: EASE }}
      >
        <Body node={shown} />
      </motion.div>
    </motion.aside>
  );
}

function Body({ node }: { node: ViewNode }) {
  const retryNode = useGalaxy((state) => state.retryNode);
  const detail = useNodeDetail(node.goal ? null : node.id);
  const pane = headingPane(node);

  return (
    <>
      <h2 className={`detail-heading ${node.goal ? "is-goal" : ""}`}>{pane.heading}</h2>
      {pane.showPane && (
        // The body is keyed by node id: the pane keeps its open state and scroll across polls
        // and resets when the selection changes (2D behaviour).
        <details className="fulltext">
          <summary>
            <IconChevron />
            {pane.paneLabel}
            <span className="len">{pane.lengthLabel}</span>
          </summary>
          <div
            className={`fulltext-text g-scroll ${node.goal ? "is-goal" : ""}`}
            aria-label={node.goal ? "完整问题内容" : "完整节点内容"}
            tabIndex={0}
          >
            {pane.full}
          </div>
        </details>
      )}

      {!node.goal && <FailureNote node={node} />}

      {node.goal ? <GoalSummary /> : <TaskFacts node={node} />}

      {!node.goal && (
        <Section label="备注">
          <p className={`detail-notes ${node.notes.trim() ? "" : "is-empty"}`}>{node.notes.trim() || "还没有备注"}</p>
        </Section>
      )}

      <Section label="子任务" count={node.children.length || undefined}>
        <Children node={node} />
      </Section>

      {!node.goal && (
        <Section label="工具步骤" count={toolCount(node) || undefined}>
          <ToolChipsRow steps={detail?.steps ?? []} />
          <SignalTrace
            live={node.live}
            steps={detail?.steps ?? []}
            state={detail?.state ?? (node.step_count ? "loading" : "ready")}
            onRetry={() => void retryNode(node.id)}
            onExport={() => exportTask(node.id)}
          />
        </Section>
      )}
    </>
  );
}

function Section({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h3 className="g-kicker">
        {label}
        {count !== undefined && <span className="count">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

/** The failure callout: why this task did not finish, in one glance. */
function FailureNote({ node }: { node: ViewNode }) {
  const view = useGalaxy((state) => state.view);
  const cancelled = node.status === "cancelled";
  const flagEdge = (view?.edges ?? []).find((edge) => edge.relation === "error" && edge.to === node.id);
  if (node.status === "resolved" || (!flagEdge && !cancelled)) return null;
  const flagTitle = flagEdge ? ((view?.nodes ?? []).find((item) => item.id === flagEdge.from)?.title ?? flagEdge.from) : null;
  return (
    <div className="detail-fail" role="note">
      <p className="detail-fail-title">没有完成{flagTitle ? ` · 被「${flagTitle}」标记` : ""}</p>
      <p className="detail-fail-text">
        {cancelled && !flagEdge ? "这项任务已被取消。" : node.notes.trim() || "核验流程标记这项任务存在错误。"}
      </p>
    </div>
  );
}

function TaskFacts({ node }: { node: ViewNode }) {
  const view = useGalaxy((state) => state.view);
  const state = stateText(view, node);
  const color = stateColor(state);
  const working = node.status === "in_progress" && view?.running !== false;
  const tone = toneColor(node.tone);
  const calls = toolCount(node);

  return (
    <>
      <Section label="状态">
        <div className="detail-facts">
          <span className="g-chip" style={{ ["--chip-color" as string]: color }}>
            <span className={`g-dot ${working ? "g-dot-live" : ""}`} style={{ ["--dot-color" as string]: color }} />
            {state}
          </span>
          <span className="g-chip" style={{ fontVariantNumeric: "tabular-nums" }}>
            {calls} 次工具调用
          </span>
        </div>
      </Section>
      <Section label="Agent">
        <div className="detail-facts">
          {node.agents.length ? (
            node.agents.map((agent) => (
              <span key={agent} className="g-chip" style={{ ["--chip-color" as string]: tone }}>
                <span className="g-dot" style={{ ["--dot-color" as string]: tone }} />
                {agent}
              </span>
            ))
          ) : (
            <span className="g-chip" style={{ ["--chip-color" as string]: TONE_COLOR.pending, borderStyle: "dashed" }}>
              待分配
            </span>
          )}
        </div>
      </Section>
    </>
  );
}

function GoalSummary() {
  const view = useGalaxy((state) => state.view);
  const { resolved, total } = progress(view);
  const activity = goalActivity(view);
  const ratio = total ? resolved / total : 0;
  const circumference = 2 * Math.PI * 19;
  const meta = activity?.phase === "finalizing" ? activity.label : goalMeta(view?.nodes ?? []);

  return (
    <div className="goal-summary detail-section">
      <svg width="48" height="48" viewBox="0 0 48 48" className="progress-ring" aria-hidden="true" style={{ flex: "none" }}>
        <circle className="track" cx="24" cy="24" r="19" style={{ strokeWidth: 3.5 }} />
        <circle
          className="bar"
          cx="24"
          cy="24"
          r="19"
          transform="rotate(-90 24 24)"
          style={{ strokeWidth: 3.5 }}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
        <text x="24" y="28" textAnchor="middle" fill="#fff" style={{ font: "600 12px var(--font-ui)" }}>
          {total ? `${Math.round(ratio * 100)}%` : "—"}
        </text>
      </svg>
      <div style={{ minWidth: 0 }}>
        <strong>{goalSummary(view, resolved, total)}</strong>
        <span style={activity?.phase === "finalizing" ? { color: "var(--g-accent)" } : undefined}>{meta}</span>
      </div>
    </div>
  );
}

function Children({ node }: { node: ViewNode }) {
  const view = useGalaxy((state) => state.view);
  const select = useGalaxy((state) => state.select);
  if (!node.children.length) return <p className="detail-notes is-empty">没有子任务</p>;

  return (
    <ul className="children">
      {node.children.map((child, index) => {
        const match = findNode(view, child.id);
        const state = childState(match, view);
        const title = child.title || "未命名任务";
        return (
          <li key={child.id}>
            <button
              type="button"
              className="child"
              data-state={state.state}
              aria-label={`${title}，${state.label}`}
              style={{ ["--tone" as string]: toneColor(match?.tone ?? "pending"), ["--child-delay" as string]: `${-index * 0.37}s` }}
              onClick={() => select(child.id)}
            >
              <span className="child-icon" aria-hidden="true">
                {state.state === "resolved" && <IconCheck />}
                {state.state === "cancelled" && (
                  <svg viewBox="0 0 16 16">
                    <path d="M5 8h6" />
                  </svg>
                )}
              </span>
              <span className="child-copy">
                <span className="child-title">{title}</span>
                <small className="child-status">{state.label}</small>
              </span>
              <span className="child-id" aria-hidden="true">
                {child.id.toUpperCase()}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
