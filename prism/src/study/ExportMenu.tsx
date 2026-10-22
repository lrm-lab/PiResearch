// Header action "导出全部轨迹": a secondary button with a small menu (Markdown / JSON). While it runs
// the button shows progress with a 取消 action; a failure keeps the menu open with the message.

import { Download01 } from "@untitledui/icons";
import { useState } from "react";
import { Button } from "../ui/Button";
import { cancelExport, dismissExport, exportAll, useExport, type ExportFormat } from "./exportRun";
import { Popover, Tooltip } from "./primitives";
import { useStudy } from "./store";

const ITEM =
  "flex w-full items-center justify-between gap-6 rounded-md px-2.5 py-2 text-left text-sm font-medium text-secondary outline-none hover:bg-primary_hover hover:text-primary focus-visible:bg-primary_hover";

export function ExportMenu() {
  const ready = useStudy((state) => Boolean(state.view?.ok));
  const { phase, done, total, message, format } = useExport();
  const [open, setOpen] = useState(false);

  function start(next: ExportFormat) {
    setOpen(false);
    void exportAll(next);
  }

  return (
    <Popover
      open={open || phase === "error" || phase === "running"}
      onClose={() => {
        setOpen(false);
        if (phase === "error") dismissExport();
      }}
      label="导出全部轨迹"
      className="w-64 p-1.5"
      trigger={
        <Tooltip label="导出全部轨迹" align="end">
          <Button
            color="secondary"
            iconLeading={Download01}
            aria-label="导出全部轨迹"
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={!ready}
            isLoading={phase === "running"}
            onClick={() => setOpen((value) => !value)}
          />
        </Tooltip>
      }
    >
      {phase === "running" && (
        <div role="status" aria-live="polite" className="mb-1 flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-secondary">
          <span className="tabular">
            正在导出 {done}/{total}…
          </span>
          <button type="button" className="font-semibold text-brand-secondary underline" onClick={cancelExport}>
            取消
          </button>
        </div>
      )}
      {phase === "error" && (
        <div role="alert" className="mb-1 rounded-md bg-error-primary px-2.5 py-2 text-sm text-error-primary">
          <p>{message}</p>
          <div className="mt-1.5 flex gap-3 font-semibold">
            <button type="button" className="underline" onClick={() => start(format)}>
              重试
            </button>
            <button type="button" className="underline" onClick={dismissExport}>
              关闭
            </button>
          </div>
        </div>
      )}
      <div role="menu" aria-label="导出全部轨迹" hidden={phase === "running"}>
        <button type="button" role="menuitem" className={ITEM} onClick={() => start("md")}>
          导出全部轨迹（Markdown）
          <span className="text-xs text-quaternary">.md</span>
        </button>
        <button type="button" role="menuitem" className={ITEM} onClick={() => start("json")}>
          导出全部轨迹（JSON）
          <span className="text-xs text-quaternary">.json</span>
        </button>
      </div>
    </Popover>
  );
}
