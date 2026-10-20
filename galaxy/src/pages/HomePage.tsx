// PiResearch Galaxy home: a 3D observatory of study galaxies with the question
// composer (spec section 5). Without WebGL it falls back to a 2D card grid.

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CardGrid } from "../home/CardGrid";
import { Captions } from "../home/Captions";
import { Composer } from "../home/Composer";
import { DeleteDialog } from "../home/DeleteDialog";
import { flags, resetNavigation } from "../home/flags";
import { Header } from "../home/Header";
import { startHomePolling } from "../home/polling";
import { useHome } from "../home/store";
import { hasWebGL2 } from "../lib/webgl";
import "../home/home.css";

const HomeScene = lazy(() => import("../home/scene/HomeScene"));

export function HomePage() {
  const [webgl] = useState(() => !flags.noWebGL && hasWebGL2());
  const stage = useRef<HTMLDivElement>(null);
  const rows = useHome((state) => state.rows);
  const loadError = useHome((state) => state.loadError);
  const firstRun = rows !== null && rows.length === 0;
  const flying = useHome((state) => Boolean(state.flight));
  const launching = useHome((state) => Boolean(state.launch));

  useEffect(() => {
    document.title = "PiResearch Galaxy";
    document.documentElement.classList.add("home-doc");
    return () => document.documentElement.classList.remove("home-doc");
  }, []);

  useEffect(() => startHomePolling(), []);

  // prefers-reduced-motion, live.
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => useHome.getState().setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // Back from a study through the bfcache: undo the flight / launch.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      resetNavigation();
      useHome.getState().resetMotion();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return (
    <div className={`home-root${webgl ? " is-3d" : " is-2d"}${flying ? " is-flying" : ""}${launching ? " is-launching" : ""}`}>
      <div className="home-sky" aria-hidden="true" />
      <Header />
      {webgl ? (
        <div ref={stage} className="home-stage">
          <Suspense fallback={null}>
            <HomeScene stage={stage} />
          </Suspense>
          <main className="home-stage-dom">
            <h1 className="sr-only">PiResearch 研究星系</h1>
            <Captions />
            {rows === null && !loadError && <p className="home-status">正在读取</p>}
            {loadError && <p className="home-status is-error">{loadError}</p>}
            {firstRun && (
              <div className="home-first">
                <p className="home-first-title">星空还很安静。</p>
                <p className="home-first-text">在下方写下第一个问题，它会升上夜空，点亮成一片新的星系。</p>
                <span className="home-first-arrow" aria-hidden="true" />
              </div>
            )}
          </main>
        </div>
      ) : (
        <>
          {rows === null && !loadError && <p className="home-status">正在读取</p>}
          {loadError && <p className="home-status is-error">{loadError}</p>}
          <CardGrid />
        </>
      )}
      <Composer firstRun={firstRun} />
      <DeleteDialog />
      {webgl && <div className="home-flash" aria-hidden="true" style={{ opacity: 0 }} />}
    </div>
  );
}
