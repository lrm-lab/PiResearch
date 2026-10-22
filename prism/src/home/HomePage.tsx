// Prism home (DESIGN.md §5): a CoForge content page without a sidebar. Header, the brand hero with
// the composer, then the studies as cards whose tops are live 3D mini-dioramas. All minis share one
// WebGL canvas (lazy chunk) that sits behind the scrolling content; `?nowebgl=1` or no WebGL2 keeps
// the same page with flat minis and a still hero gradient.

import { lazy, Suspense, useEffect, useState } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "../lib/media";
import { hasWebGL2 } from "../lib/webgl";
import { HeaderControls } from "../ui/HeaderControls";
import { PageHeader } from "../ui/PageHeader";
import { DeleteDialog } from "./DeleteDialog";
import { flags, resetNavigation } from "./flags";
import { Hero } from "./Hero";
import { CanvasBoundary } from "./minis/CanvasBoundary";
import { invalidateMinis } from "./minis/registry";
import { startHomePolling } from "./polling";
import { useHome } from "./store";
import { Studies } from "./Studies";
import { resetPending } from "./SubmitGhost";
import "./home.css";

const MiniCanvas = lazy(() => import("./minis/MiniCanvas"));

const webglAvailable = !flags.noWebGL && hasWebGL2();

// The card → study view transition (home.css) is best effort: when either page is not ready
// to opt in (e.g. the dev server injects CSS after first paint) the browser aborts it, and the
// rejected promises must not surface as page errors. This module loads on every Prism page.
interface RevealEvent extends Event {
  viewTransition?: { ready: Promise<unknown>; finished: Promise<unknown> } | null;
}
if (typeof window !== "undefined") {
  const quiet = (event: Event) => {
    const transition = (event as RevealEvent).viewTransition;
    transition?.ready.catch(() => {});
    transition?.finished.catch(() => {});
  };
  window.addEventListener("pageswap", quiet);
  window.addEventListener("pagereveal", quiet);
}

export function HomePage() {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const webgl = webglAvailable && !canvasFailed;
  const runningCount = useHome((state) => state.rows?.filter((row) => row.status === "running").length ?? null);

  useEffect(() => startHomePolling(), []);

  useEffect(() => {
    document.title = "深度研究 · PiResearch";
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      resetNavigation();
      resetPending();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Layout changes (cards entering, leaving, reflowing) need frames when the canvas renders on demand.
  useEffect(() => useHome.subscribe((state, previous) => {
    if (state.rows !== previous.rows || state.pending !== previous.pending) {
      invalidateMinis();
      setTimeout(invalidateMinis, 60);
      setTimeout(invalidateMinis, 700);
    }
  }), []);

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="flex h-full flex-col bg-primary">
          <PageHeader
            title="深度研究"
            meta={runningCount === null ? undefined : `${runningCount} 项进行中`}
            actions={<HeaderControls />}
          />
          <div className="relative min-h-0 flex-1">
            {webgl && (
              <CanvasBoundary onError={() => setCanvasFailed(true)}>
                <Suspense fallback={null}>
                  <MiniCanvas reducedMotion={reducedMotion} />
                </Suspense>
              </CanvasBoundary>
            )}
            <motion.main
              ref={setScroller}
              layoutScroll
              onScroll={invalidateMinis}
              className="absolute inset-0 overflow-x-hidden overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
                <Hero webgl={webglAvailable} />
                <Studies webgl={webgl} scroller={scroller} />
              </div>
            </motion.main>
          </div>
          <DeleteDialog />
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
