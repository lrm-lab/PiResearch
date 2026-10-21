// Popover menu shell: Motion entrance, arrow-key navigation, Esc returns focus to the trigger.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const ITEM = '[role^="menuitem"]:not([aria-disabled="true"])';

export function MenuPopover({
  open,
  label,
  onClose,
  triggerId,
  className = "g-menu",
  role = "menu",
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  triggerId: string;
  className?: string;
  role?: "menu" | "dialog";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>(role === "menu" ? `${ITEM}[aria-checked="true"], ${ITEM}` : "button, a");
      first?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, role]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      document.getElementById(triggerId)?.focus({ preventScroll: true });
      return;
    }
    if (role !== "menu") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Tab") onClose();
    const target = next >= 0 ? items[next] : undefined;
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role={role}
          aria-label={label}
          className={`glass glass-pop hud-auto ${className}`}
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          onKeyDown={onKeyDown}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
