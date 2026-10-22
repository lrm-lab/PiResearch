// 工具步骤 as a vertical signal trace: a glowing line with one node per step.
// Live calls sit on top with a travelling signal; errors are red with 失败.

import { useEffect, useState } from "react";
import { TOOL } from "../lib/activity";
import { ERROR_RED } from "../lib/palette";
import { capNote, DETAIL_CAP, HINT_CAP } from "../lib/trajectory";
import type { LoadState } from "../store";
import type { LiveCall, Step } from "../types/api";
import { IconDownload, IconRetry, ToolGlyph } from "./icons";
import { toolColor } from "./tokens";

interface Row {
  key: string;
  step: Step | LiveCall;
  live: boolean;
}

const LIVE_ROW_PX = 64;

export function SignalTrace({
  live,
  steps,
  state,
  onRetry,
  onExport,
}: {
  live: LiveCall[];
  steps: Step[];
  state: LoadState;
  onRetry: () => void;
  /** Markdown export of this task from the steps already loaded. */
  onExport?: () => void;
}) {
  // `all` is what 全部展开 / 全部收起 last asked for; `tick` re-applies it to rows the reader toggled.
  const [expand, setExpand] = useState({ all: false, tick: 0 });
  const rows: Row[] = [
    ...live.map((step, index) => ({ key: `live:${index}:${step.tool}:${step.label}`, step, live: true })),
    ...steps.map((step, index) => ({ key: `step:${index}:${step.tool}:${step.label}`, step, live: false })),
  ];
  const loadingEmpty = state === "loading" && !steps.length;

  return (
    <div aria-busy={state === "loading"}>
      {rows.length > 0 && (
        <div className="trace-tools">
          <button
            type="button"
            className="g-btn trace-tool-btn"
            aria-pressed={expand.all}
            onClick={() => setExpand((previous) => ({ all: !previous.all, tick: previous.tick + 1 }))}
          >
            {expand.all ? "全部收起" : "全部展开"}
          </button>
          {onExport && (
            <button type="button" className="g-btn trace-tool-btn" disabled={!steps.length && !live.length} onClick={onExport}>
              <IconDownload />
              导出此任务轨迹
            </button>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ position: "relative" }}>
          {live.length > 0 && (
            <span className="trace-signal" aria-hidden="true" style={{ ["--signal-travel" as string]: `${live.length * LIVE_ROW_PX - 20}px` }} />
          )}
          <ol className="trace">
            {rows.map((row) => (
              <TraceRow key={row.key} step={row.step} live={row.live} expand={expand} />
            ))}
          </ol>
        </div>
      )}
      {loadingEmpty && (
        <div className="g-fade-in" style={{ marginTop: rows.length ? 10 : 0 }}>
          <p className="trace-state" role="status">
            <span className="spinner" aria-hidden="true" style={{ color: "var(--g-accent)" }} />
            正在读取工具步骤…
          </p>
          <div aria-hidden="true" style={{ display: "grid", gap: 14, marginTop: 14 }}>
            {[0.92, 0.7, 0.82].map((width, index) => (
              <div key={index} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 10 }}>
                <span className="g-skeleton" style={{ width: 24, height: 24, borderRadius: "50%" }} />
                <span style={{ display: "grid", gap: 6 }}>
                  <span className="g-skeleton" style={{ width: "34%", height: 10 }} />
                  <span className="g-skeleton" style={{ width: `${width * 100}%`, height: 12 }} />
                  <span className="g-skeleton" style={{ width: `${width * 70}%`, height: 9 }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {state === "error" && (
        <button type="button" className="trace-retry" style={{ marginTop: rows.length ? 12 : 0 }} onClick={onRetry}>
          <IconRetry />
          工具详情暂未读出，点击重试
        </button>
      )}
      {state === "ready" && !rows.length && <p className="trace-state">没有工具步骤</p>}
    </div>
  );
}

function TraceRow({ step, live, expand }: { step: Step | LiveCall; live: boolean; expand: { all: boolean; tick: number } }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (expand.tick) setOpen(expand.all);
  }, [expand]);
  const thinking = step.tool === "思考";
  const color = step.error ? ERROR_RED : toolColor(step.tool);
  const detail = "detail" in step ? step.detail : undefined;
  const count = step.count ?? 1;
  const hintNote = capNote(step.hint, HINT_CAP);
  const detailNote = capNote(detail, DETAIL_CAP);
  const long = Boolean((detail && Array.from(detail).length > 70) || (step.hint && Array.from(step.hint).length > 40) || hintNote || detailNote);
  const classes = ["trace-row", open ? "is-open" : "", live ? "is-live" : "", step.error ? "is-error" : "", thinking ? "is-thinking" : ""].join(" ");

  return (
    <li className={classes} style={{ ["--tool" as string]: color }}>
      <span className="trace-node" aria-hidden="true">
        <ToolGlyph tool={step.tool} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="trace-head">
          <span className="trace-tool">{TOOL[step.tool] ?? step.tool}</span>
          {count > 1 && <span className="trace-badge">×{count}</span>}
          {step.error && <span className="trace-fail">失败</span>}
          {live && (
            <span className="trace-live-tag">
              <span className="g-dot g-dot-live" style={{ ["--dot-color" as string]: color, width: 5, height: 5 }} />
              {thinking ? "思考中" : "进行中"}
            </span>
          )}
        </div>
        {thinking ? (
          <p className="trace-label">
            <span className="thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {step.hint || "正在想下一步"}
          </p>
        ) : (
          <>
            {step.label && <p className="trace-label">{step.label}</p>}
            {step.hint && (
              <p className="trace-hint" title={open ? undefined : step.hint}>
                {step.hint}
              </p>
            )}
            {open && hintNote && <p className="trace-cap">{hintNote}</p>}
          </>
        )}
        {detail && (
          <p className="trace-detail">{detail}</p>
        )}
        {open && detailNote && <p className="trace-cap">{detailNote}</p>}
        {long && (
          <button
            type="button"
            className="g-btn"
            style={{ height: 22, padding: "0 6px", marginTop: 2, marginLeft: -6, fontSize: 12, color: "var(--g-ink-dim)" }}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "收起" : "展开"}
          </button>
        )}
      </div>
    </li>
  );
}
