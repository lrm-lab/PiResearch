// DOM overlay above the canvas and its drei label layer (labels use z-index up to
// ~120 and are not in their own stacking context; the HUD is z-index 1000, isolated). The root ignores pointer
// events so empty areas pass clicks to the scene; panels opt back in (.hud-auto).

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
  const view = useGalaxy((state) => state.view);
  const stage = useUi((state) => state.reportStage);
  const reportOpen = stage === "open";
  useShortcuts();

  useEffect(() => {
    const title = view?.ok ? view.goal?.title : null;
    document.title = title ? `${title} · PiResearch Galaxy` : "PiResearch Galaxy";
  }, [view]);

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
