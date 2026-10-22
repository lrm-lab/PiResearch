// Progress, error and done notice of the trajectory export.

import { AnimatePresence, motion } from "motion/react";
import { TONE_COLOR } from "../lib/palette";
import { cancelExport, dismissExport, exportAll, useExport } from "./exportRun";
import { IconCheck } from "./icons";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ExportToast() {
  const { phase, done, total, message, format } = useExport();
  return (
    <div className="toast-stack is-export" aria-live="polite">
      <AnimatePresence>
        {phase !== "idle" && (
          <motion.div
            key="export"
            className="toast glass glass-pop hud-auto"
            data-tone={phase === "error" ? "danger" : phase === "done" ? undefined : "warn"}
            role={phase === "error" ? "alert" : "status"}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {phase === "running" && (
              <>
                <span className="spinner" aria-hidden="true" style={{ color: TONE_COLOR.cyan }} />
                <span className="toast-text">
                  正在导出 {done}/{total}…
                </span>
                <button type="button" className="g-btn" style={{ height: 26, padding: "0 10px", fontSize: 12.5 }} onClick={cancelExport}>
                  取消
                </button>
              </>
            )}
            {phase === "error" && (
              <>
                <span className="toast-text">{message}</span>
                <button type="button" className="g-btn" style={{ height: 26, padding: "0 10px", fontSize: 12.5 }} onClick={() => void exportAll(format)}>
                  重试
                </button>
                <button type="button" className="g-btn" style={{ height: 26, padding: "0 10px", fontSize: 12.5 }} onClick={dismissExport}>
                  关闭
                </button>
              </>
            )}
            {phase === "done" && (
              <>
                <IconCheck width={16} height={16} style={{ color: TONE_COLOR.green, flex: "none" }} />
                <span className="toast-text">{message}</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
