// The floating question composer (spec section 5). Enter submits, Shift+Enter
// adds a newline, IME composition and key repeat are ignored. On success the
// scene plays the launch sequence and then navigates to the new study.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { navigate } from "./flags";
import { enterAction } from "./format";
import { getModelChoice } from "../lib/model";
import { ModelChip } from "./ModelSettings";
import { gallery } from "./motion";
import { submitQuestion } from "./mutations";
import { useHome } from "./store";

const MAX_LENGTH = 8000;
const PLACEHOLDER = "写下要查清的问题。可以包含范围、时间和必须回答的要点。";
/** Longest a launch may take before we navigate anyway. */
const LAUNCH_WATCHDOG_MS = 4500;
/** Clearance (CSS px) kept between the composer and content above it. */
const COMPOSER_GAP = 14;

export function Composer({ firstRun }: { firstRun: boolean }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const launch = useHome((state) => state.launch);

  // Auto-grow up to the CSS max-height.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [value]);

  // Space the composer takes at the bottom of the viewport: 3D captions stay
  // above it (gallery.composerReserve) and the 2D grid scrolls focused cards
  // clear of it (--home-composer-reserve feeds scroll-padding-bottom).
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const root = document.documentElement;
    const measure = () => {
      const bottom = Number.parseFloat(getComputedStyle(dock).bottom) || 0;
      const reserve = Math.ceil(dock.offsetHeight + bottom + COMPOSER_GAP);
      gallery.composerReserve = reserve;
      root.style.setProperty("--home-composer-reserve", `${reserve}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      gallery.composerReserve = 0;
      root.style.removeProperty("--home-composer-reserve");
    };
  }, []);

  // Back from the study page via bfcache: re-enable the form.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setBusy(false);
      setLaunching(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  useEffect(() => {
    if (!launch) setLaunching(false);
  }, [launch]);

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
      const area = areaRef.current;
      if (area && !area.checkValidity()) {
        area.reportValidity();
        return;
      }
      const question = value.trim();
      setError(null);
      setBusy(true);
      const result = await submitQuestion(question, getModelChoice());
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      const state = useHome.getState();
      if (state.reducedMotion || !state.sceneReady) {
        navigate(result.href);
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      setLaunching(true);
      state.startLaunch({
        href: result.href,
        from: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: innerWidth / 2, y: innerHeight - 80 },
      });
      // navigate() is a no-op once the director's dive has already left.
      setTimeout(() => {
        if (useHome.getState().launch?.href === result.href) navigate(result.href);
      }, LAUNCH_WATCHDOG_MS);
    },
    [busy, value],
  );

  const count = value.length;
  return (
    <div ref={dockRef} className={`home-composer-dock${firstRun ? " is-first" : ""}`}>
      <form
        ref={formRef}
        className={`home-composer${launching ? " is-launching" : ""}${busy ? " is-busy" : ""}`}
        onSubmit={onSubmit}
      >
        <span className="home-composer-aurora" aria-hidden="true" />
        <div className="home-composer-body">
          <span className="home-composer-glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="2.4" fill="currentColor" />
              <ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="currentColor" strokeWidth="1.2" opacity=".7" transform="rotate(-24 12 12)" />
            </svg>
          </span>
          <textarea
            ref={areaRef}
            className="home-composer-input"
            name="question"
            rows={1}
            required
            maxLength={MAX_LENGTH}
            aria-label="研究问题"
            placeholder={PLACEHOLDER}
            value={value}
            disabled={launching}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "home-ask-error" : "home-ask-hint"}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button ref={buttonRef} type="submit" className="home-launch" aria-label="开始研究" title="开始研究" disabled={busy}>
            <span className="home-launch-ring" aria-hidden="true" />
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="home-launch-icon">
              <path
                d="M12 3.2c2.9 2.1 4.4 5.2 4.4 8.6 0 1.6-.4 3.1-1 4.4H8.6c-.6-1.3-1-2.8-1-4.4 0-3.4 1.5-6.5 4.4-8.6Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="10.2" r="1.7" fill="currentColor" />
              <path d="M9.6 19.2 12 21l2.4-1.8M8.4 13.6l-2.6 2.2.6 2.4 2.6-1.4m6.6-3.2 2.6 2.2-.6 2.4-2.6-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="home-composer-foot">
          <ModelChip disabled={busy || launching} />
          <span id="home-ask-hint" className="home-composer-hint">
            <kbd>Enter</kbd> 开始研究 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行
          </span>
          {count > MAX_LENGTH * 0.8 && (
            <span className="home-composer-count" aria-live="polite">
              {count} / {MAX_LENGTH}
            </span>
          )}
          {launching && <span className="home-composer-status">正在点亮新的星系…</span>}
        </div>
        {error && (
          <p id="home-ask-error" className="home-composer-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
