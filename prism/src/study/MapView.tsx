// 任务图 tab: the star map fills the area; small overlays sit on top (zoom group bottom-right,
// legend bottom-left). Overlay wrappers ignore the pointer so drag and wheel reach the map; only
// the controls themselves take clicks.

import { Keyboard01, Maximize02, Minus, Plus } from "@untitledui/icons";
import { motion } from "motion/react";
import type { Snapshot } from "../types/api";
import { cx } from "../ui/cx";
import { TONE_CLASS } from "../lib/status";
import { Kbd, Skeleton, Tooltip } from "./primitives";
import { MapBackdrop, StarMap } from "./starmap/StarMap";
import { useStudy } from "./store";
import { useStudyUi } from "./ui";

export function MapView({ view, rightInset, bottomInset, compact }: { view: Snapshot; rightInset: number; bottomInset: number; compact: boolean }) {
  const hasSelection = useStudy((s) => s.selectedId !== null);
  const helpOpen = useStudyUi((s) => s.popover === "help");
  const togglePopover = useStudyUi((s) => s.togglePopover);
  const requestFit = useStudyUi((s) => s.requestFit);
  const requestZoom = useStudyUi((s) => s.requestZoom);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <StarMap view={view} rightInset={rightInset} bottomInset={bottomInset} compact={compact} />
      <div className="pointer-events-none absolute inset-0 z-10">
        <motion.div
          data-ui
          className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs"
          initial={false}
          animate={{ right: 16 + rightInset, bottom: 16 + bottomInset }}
          transition={{ type: "spring", stiffness: 420, damping: 42 }}
          role="group"
          aria-label="缩放"
        >
          <ZoomButton label="放大" icon={Plus} onClick={() => requestZoom(1.5)} />
          <span className="h-px bg-[var(--color-border-secondary)]" aria-hidden="true" />
          <ZoomButton label="缩小" icon={Minus} onClick={() => requestZoom(1 / 1.5)} />
          <span className="h-px bg-[var(--color-border-secondary)]" aria-hidden="true" />
          <ZoomButton label="适应屏幕" shortcut="F" icon={Maximize02} onClick={requestFit} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          data-ui
          className={cx("pointer-events-auto absolute left-4 flex flex-col gap-2 rounded-xl border border-secondary bg-primary/90 px-3 py-2.5 text-xs text-tertiary shadow-xs backdrop-blur", compact && hasSelection && "hidden")}
          style={{ bottom: compact ? 16 + bottomInset : 16 }}
          role="group"
          aria-label="图例"
        >
          <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {(
              [
                ["todo", "未开始"],
                ["progress", "进行中"],
                ["done", "已完成"],
                ["closed", "已取消"],
                ["error", "有错误"],
              ] as const
            ).map(([tone, label]) => (
              <li key={tone} className="inline-flex items-center gap-1.5 text-secondary">
                <span aria-hidden="true" className={cx("size-2 rounded-full ring-2 ring-[var(--color-bg-primary)]", TONE_CLASS[tone].dot)} />
                {label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => togglePopover("help")}
            aria-expanded={helpOpen}
            aria-haspopup="dialog"
            aria-keyshortcuts="?"
            data-help-trigger
            className="hidden items-center gap-1.5 rounded text-left outline-none hover:text-secondary focus-visible:outline-2 focus-visible:outline-focus-ring lg:inline-flex"
          >
            <Keyboard01 aria-hidden="true" className="size-4 shrink-0" />
            悬停或聚焦星点查看关联 · 拖动平移 · 滚轮缩放 · <Kbd>?</Kbd> 快捷键
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function ZoomButton({ label, shortcut, icon: Icon, onClick }: { label: string; shortcut?: string; icon: typeof Plus; onClick: () => void }) {
  return (
    <Tooltip label={label} shortcut={shortcut} side="left">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex size-8 items-center justify-center text-fg-tertiary outline-none transition hover:bg-primary_hover hover:text-fg-secondary focus-visible:bg-primary_hover focus-visible:text-fg-secondary active:scale-95"
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
    </Tooltip>
  );
}

/** First load (or a run without a graph yet): the strip says what is going on; the map area is a faint empty sky. */
export function MapSkeleton({ bare = false }: { bare?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-primary" role={bare ? undefined : "status"}>
      <span aria-hidden="true" className="sm-root absolute inset-0 overflow-hidden">
        <MapBackdrop />
      </span>
      {!bare && (
        <>
          <span aria-hidden="true" className="absolute flex gap-12">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="size-8 rounded-lg" />
            ))}
          </span>
          <span className="relative mt-24 text-sm text-tertiary">正在读取研究</span>
        </>
      )}
    </div>
  );
}
