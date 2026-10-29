// Research model choice, two ways in: the header gear opens a glass panel with one card per model,
// and the composer carries a chip with the current model that switches it in place. The panel
// explains itself with a miniature composer whose chip follows the selection.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { DEFAULT_MODEL, MODELS, setModelChoice, useModelChoice, type ModelId, type ModelOption } from "../lib/model";
import { IconCheck, IconChevronDown, IconSettings } from "../ui/icons";
import { MenuPopover } from "../ui/Menu";
import { ModelMark } from "../ui/ModelMark";
import { useHome } from "./store";

const SPRING = { type: "spring", stiffness: 520, damping: 34 } as const;
const GEAR_ID = "home-settings";
const CHIP_ID = "home-model-chip";

/** Close an open popover on a pointer press outside its wrapper. */
function useOutsideClose(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, ref, close]);
}

function ModelCard({ model, selected, still, onSelect }: { model: ModelOption; selected: boolean; still: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-model={model.id}
      className="model-card"
      onClick={onSelect}
    >
      {selected && <motion.span layoutId="home-model-ring" aria-hidden="true" className="model-card-ring" transition={still ? { duration: 0 } : SPRING} />}
      <span className="model-card-stage" aria-hidden="true">
        <span className="model-card-halo" />
        <span className="model-card-orbit">
          <i />
        </span>
        <motion.span
          className="model-card-mark"
          animate={selected && !still ? { scale: [1, 1.14, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }}
          transition={{ duration: 0.5 }}
        >
          <ModelMark id={model.id} size="lg" />
        </motion.span>
      </span>
      <span className="model-card-name">
        {model.name}
        {model.id === DEFAULT_MODEL && <span className="model-card-default">默认</span>}
      </span>
      <AnimatePresence>
        {selected && (
          <motion.span
            aria-hidden="true"
            className="model-card-check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={SPRING}
          >
            <IconCheck />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/** A miniature composer: the chip at its foot shows where the chosen model goes. */
function ComposerPreview({ choice, still }: { choice: ModelId; still: boolean }) {
  const model = MODELS.find((option) => option.id === choice)!;
  return (
    <div aria-hidden="true" className="model-preview">
      <span className="model-preview-lines">
        <i />
        <i />
      </span>
      <span className="model-preview-foot">
        <motion.span
          key={choice}
          className="model-preview-chip"
          initial={still ? false : { scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
        >
          {!still && <span className="model-preview-ripple" />}
          <ModelMark id={model.id} size="xs" />
          {model.short}
        </motion.span>
        <span className="model-preview-launch" />
      </span>
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

/** Header gear → settings panel. A cyan dot on the gear while a non-default model is chosen. */
export function SettingsButton() {
  const choice = useModelChoice();
  const still = useHome((state) => state.reducedMotion);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);
  useOutsideClose(open, ref, close);

  return (
    <span className="home-settings" ref={ref}>
      <button
        id={GEAR_ID}
        type="button"
        className={`home-settings-btn${open ? " is-open" : ""}`}
        aria-label="设置"
        title="设置"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IconSettings />
        {choice !== DEFAULT_MODEL && <span className="home-settings-dot" aria-hidden="true" />}
      </button>
      <MenuPopover open={open} label="设置" role="dialog" onClose={close} triggerId={GEAR_ID} className="g-menu model-panel">
        <p className="model-panel-label">研究模型</p>
        <div role="radiogroup" aria-label="研究模型" className="model-cards" onKeyDown={(event) => onRadioKeys(event, choice)}>
          {MODELS.map((model) => (
            <ModelCard key={model.id} model={model} selected={model.id === choice} still={still} onSelect={() => setModelChoice(model.id)} />
          ))}
        </div>
        <ComposerPreview choice={choice} still={still} />
      </MenuPopover>
    </span>
  );
}

/** The composer's model chip: the current model, switchable in place. */
export function ModelChip({ disabled }: { disabled?: boolean }) {
  const choice = useModelChoice();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);
  useOutsideClose(open, ref, close);
  const model = MODELS.find((option) => option.id === choice)!;

  return (
    <span className="home-model" ref={ref}>
      <button
        id={CHIP_ID}
        type="button"
        className="home-model-chip"
        aria-label={`研究模型：${model.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="home-model-chip-mark">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={choice}
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
        <IconChevronDown className={`home-model-chev${open ? " is-open" : ""}`} />
      </button>
      <MenuPopover open={open} label="研究模型" onClose={close} triggerId={CHIP_ID} className="g-menu model-menu">
        {MODELS.map((option, index) => {
          const on = option.id === choice;
          return (
            <motion.button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              className="g-menu-item model-menu-item"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.03 + index * 0.05 }}
              onClick={() => {
                setModelChoice(option.id);
                close();
                document.getElementById(CHIP_ID)?.focus({ preventScroll: true });
              }}
            >
              <ModelMark id={option.id} size="sm" />
              <span>{option.name}</span>
              {on && <IconCheck className="model-menu-check" />}
            </motion.button>
          );
        })}
      </MenuPopover>
    </span>
  );
}
