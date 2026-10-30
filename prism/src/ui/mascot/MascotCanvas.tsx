// One mascot's Rive canvas on the file every mascot shares (copied from CoForge's
// mascot-rive.tsx): its own view model instance, activity / hovered / lookX / lookY driven from
// outside, and a still picture underneath until the first frame draws.

import { EventType, RiveFile, RuntimeLoader } from "@rive-app/canvas-lite";
import riveWasmUrl from "@rive-app/canvas-lite/rive.wasm?url";
import { useRive, useViewModel, useViewModelInstance, useViewModelInstanceBoolean, useViewModelInstanceEnum } from "@rive-app/react-canvas-lite";
import { useEffect, useState } from "react";
import { followPointer } from "./tracker";
import { MASCOT_RIVE, mascotArtboard, mascotRivUrl, type MascotActivity, type MascotId } from "./contract";

RuntimeLoader.setWasmUrl(riveWasmUrl);
RuntimeLoader.setWasmFallbackUrl(null);

let sharedFile: Promise<RiveFile> | undefined;

function mascotFile(): Promise<RiveFile> {
  sharedFile ??= new Promise<RiveFile>((resolve, reject) => {
    const file = new RiveFile({ src: mascotRivUrl() });
    file.on(EventType.Load, () => {
      file.getInstance();
      resolve(file);
    });
    file.on(EventType.LoadError, () => reject(new Error("mascots did not load")));
    void file.init();
  });
  return sharedFile;
}

export function MascotCanvas({
  mascot,
  activity,
  hovered,
  onReady,
  onFailed,
}: {
  mascot: MascotId;
  activity: MascotActivity;
  hovered: boolean;
  onReady: () => void;
  onFailed: () => void;
}) {
  const [file, setFile] = useState<RiveFile | null>(null);
  useEffect(() => {
    let current = true;
    mascotFile().then(
      (loaded) => current && setFile(loaded),
      () => current && onFailed(),
    );
    return () => {
      current = false;
    };
  }, [onFailed]);
  return file ? <BoundMascot key={mascot} {...{ file, mascot, activity, hovered, onReady, onFailed }} /> : null;
}

function BoundMascot({
  file,
  mascot,
  activity,
  hovered,
  onReady,
  onFailed,
}: {
  file: RiveFile;
  mascot: MascotId;
  activity: MascotActivity;
  hovered: boolean;
  onReady: () => void;
  onFailed: () => void;
}) {
  const { rive, canvas, RiveComponent } = useRive({
    riveFile: file,
    artboard: mascotArtboard(mascot),
    stateMachine: MASCOT_RIVE.stateMachine,
    autoplay: true,
    autoBind: false,
    shouldDisableRiveListeners: true,
    onLoadError: onFailed,
  });
  const viewModel = useViewModel(rive, { name: MASCOT_RIVE.viewModel });
  const instance = useViewModelInstance(viewModel, { useNew: true, rive });
  const { setValue: setActivity } = useViewModelInstanceEnum(MASCOT_RIVE.activityProperty, instance);
  const { setValue: setHovered } = useViewModelInstanceBoolean(MASCOT_RIVE.hoveredProperty, instance);
  useEffect(() => setActivity(activity), [setActivity, activity]);
  useEffect(() => setHovered(hovered), [setHovered, hovered]);
  useEffect(() => {
    const lookX = instance?.number(MASCOT_RIVE.lookXProperty);
    const lookY = instance?.number(MASCOT_RIVE.lookYProperty);
    if (!canvas || !lookX || !lookY) return;
    return followPointer(canvas, (look) => {
      lookX.value = look.x;
      lookY.value = look.y;
    });
  }, [instance, canvas]);
  const [bound, setBound] = useState(false);
  useEffect(() => {
    if (!instance || bound) return;
    const frame = requestAnimationFrame(() => {
      setBound(true);
      onReady();
    });
    return () => cancelAnimationFrame(frame);
  }, [instance, bound, onReady]);
  return <RiveComponent className="size-full" />;
}
