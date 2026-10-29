// The question composer, Slack-style (CoForge docs/design/page-skeleton-and-density.md): one
// rounded box, text on top, a toolbar below with the key hint on the left and the page's single
// primary action on the right. Focus deepens the border to brand, with no glow. Enter submits,
// Shift+Enter adds a line, IME composition and key repeat are ignored (enterAction). While empty,
// the placeholder types and erases example questions. On success a card for the question
// slides in at the top of the grid (Studies), then the study opens; errors show inline under the box.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircle, Stars02 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "../lib/media";
import { getModelChoice } from "../lib/model";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { COMPOSER_PLACEHOLDER, EXAMPLE_QUESTIONS } from "./examples";
import { flags, navigate } from "./flags";
import { enterAction } from "./format";
import { ModelChip } from "./ModelSettings";
import { submitQuestion } from "./mutations";
import { useHome } from "./store";

const MAX_LENGTH = 8000;
const EMPTY_QUESTION = "先写下要研究的问题。";

/** Types and erases `lines` in turn while `enabled`. */
function useTypewriter(lines: readonly string[], enabled: boolean): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!enabled) {
      setText("");
      return;
    }
    let line = 0;
    let length = 0;
    let erasing = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const current = lines[line % lines.length]!;
      const chars = Array.from(current);
      if (!erasing) {
        length += 1;
        setText(chars.slice(0, length).join(""));
        if (length >= chars.length) {
          erasing = true;
          timer = setTimeout(step, 2400);
          return;
        }
        timer = setTimeout(step, 46 + Math.random() * 50);
      } else {
        length -= 2;
        if (length <= 0) {
          length = 0;
          erasing = false;
          line += 1;
          setText("");
          timer = setTimeout(step, 500);
          return;
        }
        setText(chars.slice(0, length).join(""));
        timer = setTimeout(step, 18);
      }
    };
    timer = setTimeout(step, 900);
    return () => clearTimeout(timer);
  }, [lines, enabled]);
  return text;
}

export function Composer({ className }: { className?: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const submitted = useRef(false);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const pending = useHome((state) => state.pending);
  const prefill = useHome((state) => state.prefill);
  const typing = useTypewriter(EXAMPLE_QUESTIONS, !reducedMotion && !value && !busy);
  const showTyping = !reducedMotion && !value && !busy;

  // Auto-grow up to the CSS max-height.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [value]);

  // An example chip fills the composer.
  useEffect(() => {
    if (prefill === null) return;
    setValue(prefill);
    setError(null);
    useHome.getState().setPrefill(null);
    const area = areaRef.current;
    if (area) {
      area.focus({ preventScroll: true });
      requestAnimationFrame(() => area.setSelectionRange(area.value.length, area.value.length));
      area.closest("form")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    }
  }, [prefill, reducedMotion]);

  // The ghost card finished without leaving (`?navigate=0`): get ready for the next question.
  useEffect(() => {
    if (pending || !submitted.current) return;
    submitted.current = false;
    setBusy(false);
    setValue("");
  }, [pending]);

  // Back from the study page through the bfcache: re-enable the form.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      submitted.current = false;
      setBusy(false);
      useHome.getState().setPending(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = enterAction({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.keyCode,
      repeat: event.repeat,
    });
    if (action === "ignore") return;
    event.preventDefault();
    if (action === "swallow") return;
    const button = buttonRef.current;
    if (button && !button.disabled) formRef.current?.requestSubmit(button);
  }, []);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) return;
      const question = value.trim();
      if (!question) {
        setError(EMPTY_QUESTION);
        areaRef.current?.focus();
        return;
      }
      setError(null);
      setBusy(true);
      const model = getModelChoice();
      const result = await submitQuestion(question, model);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        areaRef.current?.focus();
        return;
      }
      submitted.current = true;
      // The new card slides in at the top of the grid, then the page opens the study.
      useHome.getState().setPending({ question, href: result.href, phase: "fly", model });
      setTimeout(
        () => {
          navigate(result.href);
          if (flags.stay) setTimeout(() => useHome.getState().setPending(null), 1600);
        },
        reducedMotion ? 0 : 900,
      );
    },
    [busy, value, reducedMotion],
  );

  const count = value.length;
  return (
    <div className={className}>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        className={cx(
          "flex flex-col rounded-xl border bg-primary text-left shadow-xs transition-colors duration-150",
          error ? "border-error" : "border-primary focus-within:border-brand",
        )}
      >
        <div className="relative">
          <textarea
            ref={areaRef}
            name="question"
            rows={2}
            maxLength={MAX_LENGTH}
            aria-label="研究问题"
            placeholder={COMPOSER_PLACEHOLDER}
            value={value}
            readOnly={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "home-ask-error" : "home-ask-hint"}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            className={cx(
              "block max-h-48 min-h-[4.5rem] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-md text-primary outline-none placeholder:text-quaternary focus-visible:outline-none",
              showTyping && "placeholder:text-transparent",
            )}
          />
          {showTyping && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-4 top-3.5 line-clamp-2 text-md text-quaternary select-none"
            >
              {typing || "\u200b"}
              <span className="home-caret text-fg-quaternary" />
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-3 pt-1 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <ModelChip disabled={busy} />
            <span id="home-ask-hint" className="truncate font-mono text-xs text-quaternary max-sm:hidden">
              ⏎ 发送 · ⇧⏎ 换行
            </span>
          </div>
          <div className="flex items-center gap-3">
            {count > MAX_LENGTH * 0.8 && (
              <span className="font-mono text-xs text-tertiary tabular" aria-live="polite">
                {count}/{MAX_LENGTH}
              </span>
            )}
            <Button ref={buttonRef} type="submit" color="primary" size="sm" iconLeading={Stars02} isLoading={busy} showTextWhileLoading>
              开始研究
            </Button>
          </div>
        </div>
      </form>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            key="error"
            id="home-ask-error"
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-1.5 overflow-hidden text-sm text-error-primary"
          >
            <AlertCircle aria-hidden="true" className="mt-2 size-4 shrink-0" />
            <span className="pt-1.5">{error}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
