// "核验透镜已开启" notice: a floating pill over the map, an inline bar above the list.

import { SearchRefraction, XClose } from "@untitledui/icons";
import { motion } from "motion/react";
import { cx } from "../ui/cx";
import { RELATION_ORDER } from "./model";
import { EASE_OUT, Kbd } from "./primitives";
import { RelationDot } from "./relations";

export function LensPill({ onClose, floating = false }: { onClose: () => void; floating?: boolean }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
      className={cx(
        "pointer-events-auto flex items-center gap-2.5 text-sm",
        floating
          ? "prism-beam relative rounded-full bg-primary/90 py-1.5 pr-1.5 pl-3 shadow-lg ring-1 ring-brand-200 backdrop-blur-sm dark:ring-brand-800"
          : "w-full border-b border-secondary bg-brand-primary px-4 py-2 sm:px-6",
      )}
    >
      <SearchRefraction aria-hidden="true" className="size-4 shrink-0 text-fg-brand-primary" />
      <span className="font-semibold text-brand-secondary">核验透镜</span>
      <span className="hidden text-tertiary sm:inline">只突出审核、支持、挑战和错误</span>
      <span aria-hidden="true" className="hidden items-center gap-1 sm:flex">
        {RELATION_ORDER.filter((relation) => relation !== "parent").map((relation) => (
          <RelationDot key={relation} relation={relation} className="size-2" />
        ))}
      </span>
      <span className={cx("flex items-center gap-1.5", !floating && "ml-auto")}>
        <Kbd className="hidden lg:inline-flex">V</Kbd>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭核验透镜"
          className="flex size-7 items-center justify-center rounded-full text-fg-quaternary outline-none transition hover:bg-primary_hover hover:text-fg-secondary focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <XClose aria-hidden="true" className="size-4" />
        </button>
      </span>
    </motion.div>
  );
}
