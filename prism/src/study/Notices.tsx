// Connection feedback and the shortcut card.
//   RefreshToast  — a refresh failed while a view is on screen: CoForge toast bottom-right (white
//                   card, shadow-lg, featured icon). The store clears `error` on the next success,
//                   so it leaves by itself.
//   RetryNotice   — the first load keeps failing: an inline notice under the header, never a toast.
//   ShortcutsCard — the `?` popover.

import { RefreshCw01, WifiOff, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useOnline } from "../lib/hooks";
import { cx } from "../ui/cx";
import { EASE_OUT, FeaturedIcon, Kbd, Spinner } from "./primitives";
import { useStudy } from "./store";
import { useStudyUi } from "./ui";

export function RefreshToast() {
  const stale = useStudy((state) => Boolean(state.view && state.error));
  const error = useStudy((state) => state.error);
  const online = useOnline();
  // On the map the toast clears the zoom group in the bottom-right corner.
  const onMap = useStudy((state) => state.tab === "map");
  const [dismissed, setDismissed] = useState(false);
  const show = (stale || !online) && !dismissed;

  // A new failure after recovery shows the toast again.
  useEffect(() => {
    if (!stale && online) setDismissed(false);
  }, [stale, online]);

  const offline = !online;
  const reason = (error ?? "").replace(/[。.]+$/, "");

  return (
    <div
      className={cx(
        "pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col items-end transition-[right] duration-300",
        onMap && "lg:right-[4.5rem]",
      )}
      aria-live="polite"
    >
      <AnimatePresence>
        {show && (
          <motion.div
            key={offline ? "offline" : "stale"}
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="pointer-events-auto flex w-full items-start gap-3 rounded-xl bg-primary p-4 shadow-lg ring-1 ring-border-secondary"
          >
            <FeaturedIcon icon={offline ? WifiOff : RefreshCw01} tone="warning" size="md" />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-semibold text-primary">{offline ? "网络已断开" : "暂时无法刷新"}</p>
              <p className="mt-1 text-sm text-tertiary">
                {offline ? "恢复联网后会自动更新。" : `${reason || "连接中断"}，正在自动重试。`}页面保留最近一次的数据。
              </p>
              {!offline && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-quaternary">
                  <Spinner className="size-3.5" />
                  重新连接中
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="关闭提示"
              className="-mt-1 -mr-1 flex size-8 items-center justify-center rounded-lg text-fg-quaternary outline-none transition hover:bg-primary_hover hover:text-fg-secondary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              <XClose aria-hidden="true" className="size-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RetryNotice({ message }: { message: string }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="shrink-0 overflow-hidden border-b border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950"
    >
      <p className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-orange-700 sm:px-6 dark:text-orange-300">
        <Spinner />
        <span className="min-w-0 flex-1">{message}</span>
      </p>
    </motion.div>
  );
}

const SHORTCUTS: [keys: string[], label: string][] = [
  [["1", "2", "3"], "切换任务图 / 任务 / 报告"],
  [["←", "↑", "↓", "→"], "在星图中移动到相邻任务"],
  [["Enter"], "选中任务，打开详情"],
  [["V"], "核验透镜：显示所有审核、支持、挑战、错误"],
  [["F"], "让星图适应屏幕"],
  [["↑", "↓"], "在任务列表中移动"],
  [["Esc"], "关闭面板 / 取消选择"],
  [["?"], "显示快捷键"],
];

export function ShortcutsCard({ raised }: { raised: boolean }) {
  const open = useStudyUi((state) => state.popover === "help");
  const setPopover = useStudyUi((state) => state.setPopover);
  const ref = useRef<HTMLDivElement>(null);

  // Outside pointer-downs close the card; its trigger (data-help-trigger) toggles it itself.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (ref.current?.contains(target) || target?.closest?.("[data-help-trigger]")) return;
      setPopover(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, setPopover]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label="快捷键"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className={cx(
            "absolute left-4 z-40 w-80 origin-bottom-left rounded-xl bg-primary p-1.5 shadow-lg ring-1 ring-border-secondary",
            raised ? "bottom-24" : "bottom-4",
          )}
        >
          <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1">
            <p className="text-xs font-semibold text-tertiary">快捷键</p>
            <button
              type="button"
              onClick={() => setPopover(null)}
              aria-label="关闭快捷键"
              className="flex size-6 items-center justify-center rounded-md text-fg-quaternary outline-none hover:bg-primary_hover hover:text-fg-secondary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              <XClose aria-hidden="true" className="size-4" />
            </button>
          </div>
          <dl>
            {SHORTCUTS.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5">
                <dt className="text-sm text-secondary">{label}</dt>
                <dd className="flex shrink-0 gap-1">
                  {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
