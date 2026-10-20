// Study page: starts polling and composes the scene and the HUD.
// Scene and HUD own their folders (src/scene/**, src/ui/**); keep this file small.

import { useEffect, useState } from "react";
import { GalaxyCanvas } from "../scene/GalaxyCanvas";
import { Hud } from "../ui/Hud";
import { classicStudyHref, studyApiPrefix } from "../lib/api";
import { hasWebGL2 } from "../lib/webgl";
import { useGalaxy } from "../store";

export function StudyPage({ studyId }: { studyId: string }) {
  const startStudy = useGalaxy((state) => state.startStudy);
  const [webgl] = useState(hasWebGL2);

  useEffect(() => startStudy(studyId, studyApiPrefix(studyId)), [startStudy, studyId]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-space">
      {webgl ? <GalaxyCanvas /> : <NoWebGL studyId={studyId} />}
      <Hud />
    </div>
  );
}

function NoWebGL({ studyId }: { studyId: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6" role="alert">
      <div className="glass max-w-md rounded-2xl p-6 text-center">
        <p className="mb-2 text-lg text-white">这个浏览器无法显示 3D 星图</p>
        <p className="mb-4 text-sm text-slate-400">需要 WebGL2。可以改用平面星图查看同一项研究。</p>
        <a className="text-tone-origin underline" href={classicStudyHref(studyId)}>
          打开平面星图
        </a>
      </div>
    </div>
  );
}
