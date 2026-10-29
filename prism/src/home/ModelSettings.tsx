// Research model choice, two ways in: the header gear opens a settings panel with one card per model,
// and the composer carries a chip with the current model that switches it in place. The panel
// explains itself with a miniature composer whose chip follows the selection.

import { Check, ChevronDown, Settings01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useState, type KeyboardEvent } from "react";
import { DEFAULT_MODEL, MODELS, setModelChoice, useModelChoice, type ModelId, type ModelOption } from "../lib/model";
import { Popover } from "../study/primitives";
import { cx } from "../ui/cx";
import { ModelMark } from "../ui/ModelMark";

const SPRING = { type: "spring", stiffness: 520, damping: 34 } as const;

function ModelCard({ model, selected, onSelect }: { model: ModelOption; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-model={model.id}
      onClick={onSelect}
      className={cx(
        "group relative flex flex-col items-start rounded-xl p-3.5 text-left outline-none transition-[background-color,translate,box-shadow] duration-200",
        "ring-1 ring-border-secondary ring-inset hover:-translate-y-px hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        selected ? "bg-brand-primary/50" : "bg-primary hover:bg-primary_hover",
      )}
    >
      {selected && (
        <motion.span
          layoutId="model-card-ring"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-fg-brand-primary ring-inset"
          transition={SPRING}
        />
      )}
      <motion.span animate={selected ? { scale: [1, 1.12, 1], rotate: [0, -6, 0] } : { scale: 1, rotate: 0 }} transition={{ duration: 0.45 }}>
        <ModelMark id={model.id} size="lg" />
      </motion.span>
      <span className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-primary">
        {model.name}
        {model.id === DEFAULT_MODEL && (
          <span className="rounded-full bg-tertiary px-1.5 py-px text-[10px] leading-4 font-medium text-tertiary">默认</span>
        )}
      </span>
      <AnimatePresence>
        {selected && (
          <motion.span
            aria-hidden="true"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={SPRING}
            className="absolute top-2.5 right-2.5 inline-flex size-5 items-center justify-center rounded-full bg-brand-solid text-white shadow-xs"
          >
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/** A miniature composer: the chip at its foot shows where the chosen model goes. */
function ComposerPreview({ choice }: { choice: ModelId }) {
  const model = MODELS.find((option) => option.id === choice)!;
  return (
    <div aria-hidden="true" className="mt-3 rounded-xl bg-secondary p-3">
      <div className="rounded-lg bg-primary px-3 pt-3 pb-2.5 shadow-xs ring-1 ring-border-secondary ring-inset">
        <div className="h-1.5 w-4/5 rounded-full bg-tertiary" />
        <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-tertiary" />
        <div className="mt-4 flex items-center justify-between">
          <motion.span
            key={choice}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING}
            className="relative inline-flex items-center gap-1 rounded-md bg-primary py-0.5 pr-1.5 pl-0.5 text-[11px] font-semibold text-secondary ring-1 ring-border-primary ring-inset"
          >
            <motion.span
              className="absolute -inset-1 rounded-lg ring-2 ring-fg-brand-primary"
              initial={{ opacity: 0.7, scale: 0.9 }}
              animate={{ opacity: 0, scale: 1.25 }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
            />
            <ModelMark id={model.id} size="xs" />
            {model.short}
          </motion.span>
          <span className="h-4 w-11 rounded-md bg-brand-solid" />
        </div>
      </div>
    </div>
  );
}

function onRadioKeys(event: KeyboardEvent<HTMLDivElement>, choice: ModelId) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const index = MODELS.findIndex((model) => model.id === choice);
  const next = MODELS[(index + step + MODELS.length) % MODELS.length]!;
  setModelChoice(next.id);
  event.currentTarget.querySelector<HTMLElement>(`[data-model="${next.id}"]`)?.focus();
}

/** Header gear → settings panel. A brand dot on the gear while a non-default model is chosen. */
export function SettingsButton() {
  const choice = useModelChoice();
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      label="设置"
      className="w-[22rem] max-w-[calc(100vw-2rem)] p-4"
      trigger={
        <button
          type="button"
          aria-label="设置"
          title="设置"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-tertiary shadow-xs ring-1 ring-border-primary outline-none ring-inset transition-colors hover:bg-primary_hover hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <motion.span animate={{ rotate: open ? 60 : 0 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="inline-flex">
            <Settings01 aria-hidden="true" className="size-4" />
          </motion.span>
          {choice !== DEFAULT_MODEL && (
            <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-fg-brand-primary ring-2 ring-bg-primary" />
          )}
        </button>
      }
    >
      <p className="text-xs font-semibold text-tertiary">研究模型</p>
      <div role="radiogroup" aria-label="研究模型" className="mt-3 grid grid-cols-2 gap-2.5" onKeyDown={(event) => onRadioKeys(event, choice)}>
        {MODELS.map((model) => (
          <ModelCard key={model.id} model={model} selected={model.id === choice} onSelect={() => setModelChoice(model.id)} />
        ))}
      </div>
      <ComposerPreview choice={choice} />
    </Popover>
  );
}

/** The composer's model chip: the current model, switchable in place. */
export function ModelChip({ disabled }: { disabled?: boolean }) {
  const choice = useModelChoice();
  const [open, setOpen] = useState(false);
  const model = MODELS.find((option) => option.id === choice)!;
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      label="研究模型"
      align="start"
      className="w-52 p-1.5"
      trigger={
        <button
          type="button"
          aria-label={`研究模型：${model.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md py-0.5 pr-1.5 pl-1 text-xs font-semibold text-secondary ring-1 ring-border-secondary outline-none ring-inset transition-colors hover:bg-primary_hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:opacity-60"
        >
          <span className="relative inline-flex size-4">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={choice}
                className="absolute inset-0"
                initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.4, opacity: 0, rotate: 30 }}
                transition={SPRING}
              >
                <ModelMark id={choice} size="xs" />
              </motion.span>
            </AnimatePresence>
          </span>
          <motion.span key={choice} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {model.short}
          </motion.span>
          <ChevronDown aria-hidden="true" className={cx("size-3.5 text-fg-quaternary transition-transform duration-200", open && "rotate-180")} />
        </button>
      }
    >
      <div role="menu" aria-label="研究模型">
        {MODELS.map((option, index) => {
          const on = option.id === choice;
          return (
            <motion.button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.03 + index * 0.04 }}
              onClick={() => {
                setModelChoice(option.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm font-medium text-secondary outline-none hover:bg-primary_hover hover:text-primary focus-visible:bg-primary_hover"
            >
              <ModelMark id={option.id} size="sm" />
              <span className="flex-1">{option.name}</span>
              {on && <Check aria-hidden="true" className="size-4 text-fg-brand-primary" />}
            </motion.button>
          );
        })}
      </div>
    </Popover>
  );
}
