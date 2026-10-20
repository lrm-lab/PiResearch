// Tiny path router: /galaxy/ → home, /galaxy/study/<id...> → study.
// The study page (three.js and friends) loads as its own chunk.

import { lazy, Suspense } from "react";
import { HomePage } from "./pages/HomePage";
import { studyIdFromPath } from "./lib/api";

const StudyPage = lazy(() => import("./pages/StudyPage").then((module) => ({ default: module.StudyPage })));

export function App() {
  const studyId = studyIdFromPath(window.location.pathname);
  if (!studyId) return <HomePage />;
  return (
    <Suspense fallback={<div className="h-dvh bg-space" />}>
      <StudyPage studyId={studyId} />
    </Suspense>
  );
}
