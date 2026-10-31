// The entry: a pill floating at the bottom of the report. The orb, a placeholder, and 继续调研.
// Opening it morphs the pill into the chat panel (shared layoutId).

import { GitBranch01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { Tooltip } from "../primitives";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { SHELL_ID, SHELL_SPRING } from "./ChatPanel";

export function AskBar({ pulse, onOpen, onFollowup }: { pulse: number; onOpen: () => void; onFollowup: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4 sm:bottom-6">
      <motion.div
        layoutId={SHELL_ID}
        transition={SHELL_SPRING}
        style={{ borderRadius: 9999 }}
        whileHover={{ y: -2 }}
        className="pointer-events-auto flex h-14 w-full max-w-[28rem] items-center gap-1 bg-primary/90 p-1.5 pl-3 shadow-lg ring-1 ring-border-primary backdrop-blur-md"
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-full text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <AgentAvatar name="主 agent" seed="main" mood={pulse ? "happy" : "calm"} className="size-7" />
          <span className="truncate text-sm text-placeholder">问问主 agent…</span>
        </button>
        <Tooltip label="继续调研" side="top" align="end">
          <button
            type="button"
            aria-label="继续调研"
            onClick={onFollowup}
            className="inline-flex size-11 items-center justify-center rounded-full bg-brand-primary text-fg-brand-primary outline-none transition-colors hover:bg-brand-secondary hover:text-brand-secondary focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <GitBranch01 aria-hidden="true" className="size-5" />
          </button>
        </Tooltip>
      </motion.div>
    </div>
  );
}
