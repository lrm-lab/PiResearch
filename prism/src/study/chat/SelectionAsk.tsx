// Select a passage of the report and a 问这段 button floats next to it.

import { MessageQuestionSquare } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Picked {
  text: string;
  left: number;
  top: number;
}

const MIN_CHARS = 4;
const WIDTH = 96;

export function SelectionAsk({ article, onAsk }: { article: () => HTMLElement | null; onAsk: (text: string) => void }) {
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    let timer = 0;
    const read = () => {
      const root = article();
      const selection = document.getSelection();
      if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return setPicked(null);
      const range = selection.getRangeAt(0);
      const text = selection.toString().trim();
      if (text.length < MIN_CHARS || !root.contains(range.commonAncestorContainer)) return setPicked(null);
      const rects = range.getClientRects();
      const last = rects[rects.length - 1];
      const first = rects[0];
      if (!last || !first) return setPicked(null);
      const below = last.bottom + 10;
      const top = below + 40 > window.innerHeight ? Math.max(8, first.top - 44) : below;
      const left = Math.min(Math.max(8, last.right - WIDTH / 2), window.innerWidth - WIDTH - 8);
      setPicked({ text, left, top });
    };
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 140);
    };
    document.addEventListener("selectionchange", later);
    window.addEventListener("scroll", later, true);
    window.addEventListener("resize", later);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", later);
      window.removeEventListener("scroll", later, true);
      window.removeEventListener("resize", later);
    };
  }, [article]);

  return createPortal(
    <AnimatePresence>
      {picked && (
        <motion.button
          key="ask-selection"
          type="button"
          // Keep the selection alive through the press.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onAsk(picked.text);
            document.getSelection()?.removeAllRanges();
            setPicked(null);
          }}
          initial={{ opacity: 0, y: 6, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 520, damping: 28 }}
          style={{ position: "fixed", left: picked.left, top: picked.top, width: WIDTH }}
          className="z-50 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-brand-solid text-sm font-semibold text-white shadow-lg ring-1 ring-white/20 outline-none hover:bg-brand-solid_hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <MessageQuestionSquare aria-hidden="true" className="size-4" />
          问这段
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  );
}
