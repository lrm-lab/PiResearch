// Loading, connection and empty-graph notices.

import { AnimatePresence, motion } from "motion/react";
import { useOnline } from "../lib/hooks";
import { TONE_COLOR } from "../lib/palette";
import { FIRST_LOAD_FAILED, useGalaxy } from "../store";
import { IconOffline } from "./icons";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Notices() {
  const view = useGalaxy((state) => state.view);
  const loadState = useGalaxy((state) => state.loadState);
  const error = useGalaxy((state) => state.error);
  const errorKind = useGalaxy((state) => state.errorKind);
  const online = useOnline();

  // Only a 404 study is missing; network errors and 5xx keep retrying.
  const missing = !view && loadState === "error" && errorKind === "missing";
  const retrying = !view && loadState === "error" && !missing;
  const empty = Boolean(view && !view.ok);
  // The store reports refresh failures with a view in `error` (once it does, this shows).
  const stale = Boolean(view && error);

  let toast: { key: string; text: string; tone: "warn" | "danger"; spin: boolean } | null = null;
  if (!online) toast = { key: "offline", text: "网络已断开，恢复后会自动刷新星图。", tone: "warn", spin: false };
  else if (retrying) toast = { key: "retry", text: FIRST_LOAD_FAILED, tone: "warn", spin: true };
  else if (stale) toast = { key: "stale", text: `星图暂时没有更新：${(error ?? "").replace(/[。.]+$/, "")}。正在重试。`, tone: "warn", spin: true };

  return (
    <>
      <div className="toast-stack" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.key}
              className="toast glass glass-pop hud-auto"
              data-tone={toast.tone}
              role="status"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {toast.spin ? (
                <span className="spinner" aria-hidden="true" style={{ color: TONE_COLOR.amber }} />
              ) : (
                <IconOffline width={16} height={16} style={{ color: TONE_COLOR.amber, flex: "none" }} />
              )}
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {loadState === "loading" && !view && (
          <motion.div
            key="loading"
            className="loading-orb"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.25 } }}
            exit={{ opacity: 0 }}
          >
            <i aria-hidden="true" />
            正在读取
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(missing || empty) && (
          <motion.div
            key="empty"
            className="empty-card glass hud-auto"
            role="status"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
          >
            <div className="empty-card-orbit" aria-hidden="true" />
            <h2>没有星图</h2>
            {(empty ? view?.message : error) && <p>{empty ? view?.message : error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
