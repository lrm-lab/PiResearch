// Prism home (DESIGN.md §5): a CoForge content page without a sidebar. A 48px header, then the
// composer at the top of the content, a filter toolbar and the studies as cards whose tops are
// flat SVG star maps. No hero, no slogan: the task comes first.

import { useEffect, useState } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { Plus } from "@untitledui/icons";
import { Button } from "../ui/Button";
import { HeaderControls } from "../ui/HeaderControls";
import { PageHeader } from "../ui/PageHeader";
import { Composer } from "./Composer";
import { DeleteDialog } from "./DeleteDialog";
import { resetNavigation } from "./flags";
import { startHomePolling } from "./polling";
import { useHome } from "./store";
import { Studies } from "./Studies";
import "./home.css";

function focusComposer() {
  const area = document.querySelector<HTMLTextAreaElement>("textarea[name=question]");
  if (!area) return;
  area.closest("form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  area.focus({ preventScroll: true });
}

export function HomePage() {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const runningCount = useHome((state) => state.rows?.filter((row) => row.status === "running").length ?? null);

  useEffect(() => startHomePolling(), []);

  useEffect(() => {
    document.title = "深度研究 · PiResearch";
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetNavigation();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="flex h-full flex-col bg-primary">
          <PageHeader
            title="深度研究"
            meta={runningCount === null ? undefined : `${runningCount} 项进行中`}
            actions={
              <>
                <HeaderControls />
                <Button color="secondary" size="sm" iconLeading={Plus} onClick={focusComposer} aria-label="新研究" className="max-sm:px-2.5">
                  <span className="max-sm:hidden">新研究</span>
                </Button>
              </>
            }
          />
          <motion.main ref={setScroller} layoutScroll className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
              <Composer className="max-w-[760px] pt-6 pb-6" />
              <Studies scroller={scroller} />
            </div>
          </motion.main>
          <DeleteDialog />
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
