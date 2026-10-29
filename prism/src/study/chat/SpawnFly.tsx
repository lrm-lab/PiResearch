// Prism's spawn animation, second half: after the draft card's light ripple, a small clone of the
// card flies up and shrinks into the header's lineage chip.

import { GitBranch01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { createPortal } from "react-dom";

export interface Fly {
  key: number;
  from: DOMRect;
  /** Where it lands, in viewport coordinates. */
  to: { x: number; y: number };
  text: string;
}

export function SpawnFly({ fly, onLand }: { fly: Fly; onLand: () => void }) {
  const { from, to } = fly;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return createPortal(
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed z-[60] flex items-start gap-2 overflow-hidden rounded-xl bg-primary p-3 shadow-xl ring-1 ring-fg-brand-primary"
      style={{ left: from.x, top: from.y, width: from.width, height: Math.min(from.height, 120), transformOrigin: "0 0" }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
      animate={{
        x: [0, dx * 0.35, dx],
        y: [0, dy * 0.55 - 60, dy],
        scale: [1, 0.55, 0.1],
        opacity: [1, 1, 0.2],
        rotate: [0, -3, 0],
      }}
      transition={{ duration: 0.95, times: [0, 0.45, 1], ease: [0.45, 0, 0.2, 1] }}
      onAnimationComplete={onLand}
    >
      <GitBranch01 className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" />
      <p className="line-clamp-3 text-sm leading-5 font-medium text-primary">{fly.text}</p>
      <span className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,#8f6ff2,#22d3ee,#f472b6,#fbbf24)]" />
    </motion.div>,
    document.body,
  );
}
