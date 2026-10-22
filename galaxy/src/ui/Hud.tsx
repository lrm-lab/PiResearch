// DOM overlay above the canvas and its drei label layer. The label layer is
// isolated (its labels' z-index up to ~120 stays inside it) and the HUD is its
// own stacking context with a positive z-index, so the HUD always paints on top.
// The root ignores pointer events so empty areas pass clicks to the scene;
// panels opt back in (.hud-auto).

import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { useGalaxy } from "../store";
import { DetailPanel } from "./DetailPanel";
import { ExportToast } from "./ExportToast";
import { useShortcuts } from "./hooks";
import { Legend } from "./Legend";
import { Notices } from "./Notices";
import { ReportCta, ReportReader } from "./ReportReader";
import { TopBar } from "./TopBar";
import { useUi } from "./uiStore";

export function Hud() {
  const goalTitle = useGalaxy((state) => (state.view?.ok ? state.view.goal?.title : null));
  // While the report dialog is up (and until its exit finishes) the chrome
  // stays visible under the backdrop but is inert.
  const reportOpen = useUi((state) => state.reportStage !== "closed");
  useShortcuts();

  useEffect(() => {
    document.title = goalTitle ? `${goalTitle} · PiResearch Galaxy` : "PiResearch Galaxy";
  }, [goalTitle]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="hud">
        <div className="hud-chrome" inert={reportOpen} aria-hidden={reportOpen || undefined}>
          <TopBar />
          <Notices />
          <ExportToast />
          <Legend />
          <DetailPanel />
          <ReportCta />
        </div>
        <ReportReader />
      </div>
    </MotionConfig>
  );
}
