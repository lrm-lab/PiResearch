// Tiny path router: /prism/ → home, /prism/study/<id...> → study.
// The study page (three.js and friends) loads as its own chunk.

import { lazy, Suspense } from "react";
import { HomePage } from "./home/HomePage";
import { studyIdFromPath } from "./lib/api";

const StudyPage = lazy(() => import("./study/StudyPage").then((module) => ({ default: module.StudyPage })));
// Dev-only scene harness (/prism/dev/scene?study=<id>); never part of a production route.
const SceneHarness = import.meta.env.DEV ? lazy(() => import("./scene/dev/SceneHarness")) : null;

export function App() {
  if (SceneHarness && window.location.pathname.startsWith("/prism/dev/scene")) {
    return (
      <Suspense fallback={null}>
        <SceneHarness />
      </Suspense>
    );
  }
  const studyId = studyIdFromPath(window.location.pathname);
  if (!studyId) return <HomePage />;
  return (
    <Suspense fallback={<div className="h-dvh bg-primary" />}>
      <StudyPage studyId={studyId} />
    </Suspense>
  );
}
