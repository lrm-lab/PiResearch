// DOM overlay above the canvas and its drei label layer. The label layer is
// isolated (its labels' z-index up to ~120 stays inside it) and the HUD is its
// own stacking context with a positive z-index, so the HUD always paints on top.
// The root ignores pointer events so empty areas pass clicks to the scene;
// panels opt back in (.hud-auto).

import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { useGalaxy } from "../store";
import { DetailPanel } from "./DetailPanel";
import { useShortcuts } from "./hooks";
import { Legend } from "./Legend";
import { Notices } from "./Notices";
import { ReportReader } from "./ReportReader";
import { TopBar } from "./TopBar";
import { useUi } from "./uiStore";

export function Hud() {
  const goalTitle = useGalaxy((state) => (state.view?.ok ? state.view.goal?.title : null));
  const stage = useUi((state) => state.reportStage);
  const reportOpen = stage === "open";
  useShortcuts();

  useEffect(() => {
    document.title = goalTitle ? `${goalTitle} · PiResearch Galaxy` : "PiResearch Galaxy";
  }, [goalTitle]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="hud">
        <div className="hud-chrome" data-landing={stage === "diving" || stage === "open"} inert={reportOpen} aria-hidden={reportOpen || undefined}>
          <TopBar />
          <Notices />
          <Legend />
          <DetailPanel />
        </div>
        <ReportReader />
      </div>
    </MotionConfig>
  );
}
