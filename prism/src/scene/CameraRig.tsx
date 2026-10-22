// drei CameraControls driven by the store's cameraCommand channel (one flight per new nonce).
// Flights are hand-rolled tweens over (target, distance, polar, azimuth, focal offset); no gsap.
//
// Insets: the detail panel (rightInset) and bottom sheet (bottomInset) are handled with a lens
// shift (camera.setViewOffset), not a pan, so the subject sits at the optical centre of the free
// area and is seen head-on: a focused card is never skewed by perspective. The shift eases live as
// the panel slides. Narrow FOV, polar limited to looking down 35°–70°, right-drag pans along the
// desk. A very slow sway drifts the orbit while idle and stops on any input. Also drives the fog.

import { CameraControls, type CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Box3, Fog, PerspectiveCamera, Vector3 } from "three";
import { CORE_DIVE_MS, useStudy, type CameraCommand } from "../study/store";
import { fitOverview, focusDistance, freeArea, wrapAngle, type FitPoint } from "./framing";
import type { Layout } from "./layout";
import { PRISM_TOP } from "./Prism";
import { clock, type SceneRuntime } from "./runtime";
import { clamp01, easeInOutCubic, easeOutCubic } from "./tween";

/** Vertical field of view of the full canvas (degrees). */
export const FOV = 30;
/** Looking down 70° … 35° ⇒ polar (from +Y) 20° … 55°. */
const MIN_POLAR = (20 * Math.PI) / 180;
const MAX_POLAR = (55 * Math.PI) / 180;
const OVERVIEW_POLAR = 0.78;
const FOCUS_POLAR = 0.55;
const CORE_POLAR = 0.86;
const OVERVIEW_FILL = 0.95;
const INTRO_SECONDS = 2.4;
const IDLE_SECONDS = 7;
const DRIFT_AMPLITUDE = 0.18;
const DRIFT_SPEED = 0.05;
/** camera-controls ACTION values (SCREEN_PAN = truck + forward: a pan along the desk). */
const ACTION_SCREEN_PAN = 4;
const ACTION_TOUCH_DOLLY_SCREEN_PAN = 8192;

type Mode = "overview" | "focus" | "core" | "free";

interface Pose {
  target: Vector3;
  distance: number;
  polar: number;
  azimuth: number;
  /** Small pan that centres the overview's bounds; zero for focus / core. */
  focal: { x: number; y: number };
}

interface Flight {
  from: Pose;
  to: Pose;
  start: number;
  duration: number;
  ease: (t: number) => number;
  hop: number;
}

function readPose(rig: CameraControlsImpl): Pose {
  const focal = rig.getFocalOffset(new Vector3());
  return { target: rig.getTarget(new Vector3()), distance: rig.distance, polar: rig.polarAngle, azimuth: rig.azimuthAngle, focal: { x: focal.x, y: focal.y } };
}

export function CameraRig({ layout, rt, rightInset, bottomInset, reduced }: { layout: Layout; rt: SceneRuntime; rightInset: number; bottomInset: number; reduced: boolean }) {
  const controls = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  const mode = useRef<Mode>("overview");
  const flight = useRef<Flight | null>(null);
  const focal = useRef({ x: 0, y: 0 });
  const restFocal = useRef({ x: 0, y: 0 });
  /** Azimuth of the last overview fit: focus flights keep it unless the user has turned the desk. */
  const baseAzimuth = useRef(0);
  /** Current (eased) lens shift in CSS px. */
  const shift = useRef({ right: rightInset, bottom: bottomInset });
  const overviewDistance = useRef(40);
  // A command already pending at mount only replays when it frames the current selection.
  const handled = useRef(
    (() => {
      const { cameraCommand, selectedId } = useStudy.getState();
      if (!cameraCommand) return 0;
      return cameraCommand.kind === "focus" && cameraCommand.id === selectedId ? 0 : cameraCommand.nonce;
    })(),
  );
  const introSeq = useRef(-1);
  const introDone = useRef(false);
  const lastInput = useRef(clock());
  const drift = useRef({ phase: 0, applied: 0 });

  const live = useRef({ layout, rightInset, bottomInset, width: size.width, height: size.height, reduced });
  live.current = { layout, rightInset, bottomInset, width: size.width, height: size.height, reduced };

  /** The free area as a viewport of its own: size and vertical FOV (same world-per-pixel). */
  function freeView() {
    const v = live.current;
    const area = freeArea(v.width, v.height, v.rightInset, v.bottomInset);
    const fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * (area.freeH / area.height)) * 180) / Math.PI;
    return { width: area.freeW, height: area.freeH, fov };
  }

  function framePoints(): FitPoint[] {
    const points: FitPoint[] = [];
    for (const node of live.current.layout.nodes.values()) {
      if (node.goal) continue;
      for (const sx of [-0.5, 0.5]) {
        for (const sz of [-0.5, 0.5]) {
          points.push({ x: node.x + sx * node.w, y: 0, z: node.z + sz * node.d, padX: 0, padTop: 0, padBottom: 0 });
          points.push({ x: node.x + sx * node.w, y: 0.45, z: node.z + sz * node.d, padX: 0, padTop: 0, padBottom: 0 });
        }
      }
    }
    // The prism and its question card.
    points.push({ x: 0, y: PRISM_TOP + 0.4, z: 0, padX: 130, padTop: 72, padBottom: 0 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      points.push({ x: Math.cos(a) * 2, y: 0, z: Math.sin(a) * 2, padX: 0, padTop: 0, padBottom: 0 });
    }
    return points;
  }

  function overviewPose(): Pose {
    const view = freeView();
    const points = framePoints();
    const portrait = view.width < view.height * 0.8;
    // Portrait screens have height to spare: look down more steeply so the desk is not foreshortened.
    const polar = portrait ? 0.5 : OVERVIEW_POLAR;
    const base = { polar, fov: view.fov, width: view.width, height: view.height, right: 0, bottom: 0, fill: OVERVIEW_FILL };
    let azimuth = 0;
    let fit = fitOverview(points, { ...base, azimuth });
    // Portrait screens: a quarter turn may frame the desk much tighter.
    if (portrait) {
      for (const candidate of [Math.PI / 2, -Math.PI / 2]) {
        const next = fitOverview(points, { ...base, azimuth: candidate });
        if (next.distance < fit.distance * 0.95) {
          fit = next;
          azimuth = candidate;
        }
      }
    }
    overviewDistance.current = fit.distance;
    restFocal.current = { x: fit.focalX, y: fit.focalY };
    baseAzimuth.current = azimuth;
    return { target: new Vector3(0, 0, 0), distance: fit.distance, polar, azimuth, focal: { x: fit.focalX, y: fit.focalY } };
  }

  function applyLimits(rig: CameraControlsImpl, intro: boolean) {
    rig.minPolarAngle = intro ? 0 : MIN_POLAR;
    rig.maxPolarAngle = MAX_POLAR;
    rig.minDistance = 2.2;
    rig.maxDistance = Math.max(30, overviewDistance.current * 2.2);
    const l = live.current.layout;
    const margin = 4;
    void rig.setBoundary(new Box3(new Vector3(l.minX - margin, -0.5, l.minZ - margin), new Vector3(l.maxX + margin, 3, l.maxZ + margin)));
  }

  function applyPose(rig: CameraControlsImpl, pose: Pose) {
    void rig.setTarget(pose.target.x, pose.target.y, pose.target.z, false);
    void rig.rotateTo(pose.azimuth, pose.polar, false);
    void rig.dollyTo(pose.distance, false);
    focal.current = { ...pose.focal };
  }

  function fly(to: Pose, duration: number, nextMode: Mode, ease: (t: number) => number = easeInOutCubic, hop = 0) {
    const rig = controls.current;
    if (!rig) return;
    mode.current = nextMode;
    lastInput.current = clock();
    drift.current = { phase: 0, applied: 0 };
    if (live.current.reduced || duration <= 0) {
      flight.current = null;
      applyPose(rig, to);
      return;
    }
    const from = readPose(rig);
    from.focal = { ...focal.current };
    flight.current = { from, to, start: clock(), duration, ease, hop };
  }

  /** Where flights face: the user's own angle once they turned the desk, else the overview's. */
  function viewAzimuth(rig: CameraControlsImpl): number {
    return mode.current === "free" && introDone.current ? rig.azimuthAngle : baseAzimuth.current;
  }

  function focus(id: string) {
    const rig = controls.current;
    const v = live.current;
    const node = v.layout.nodes.get(id);
    if (!rig || !node) return;
    if (node.goal) {
      core();
      return;
    }
    const distance = focusDistance(node.w, FOV, v.width, v.height, v.rightInset, v.bottomInset);
    const target = new Vector3(node.x, 0.25, node.z);
    const travel = rig.getTarget(new Vector3()).distanceTo(target);
    fly({ target, distance, polar: FOCUS_POLAR, azimuth: viewAzimuth(rig), focal: { x: 0, y: 0 } }, 1.15, "focus", easeInOutCubic, Math.min(0.45, travel / 30));
  }

  function core() {
    const rig = controls.current;
    if (!rig) return;
    const v = live.current;
    const area = freeArea(v.width, v.height, v.rightInset, v.bottomInset);
    // Prism plus its question card at ~60% of the free height.
    const span = PRISM_TOP + 1.4;
    const distance = (span * area.height) / (2 * Math.tan((FOV * Math.PI) / 360) * area.freeH * 0.6);
    fly({ target: new Vector3(0, PRISM_TOP * 0.6, 0), distance, polar: CORE_POLAR, azimuth: viewAzimuth(rig), focal: { x: 0, y: 0 } }, CORE_DIVE_MS / 1000, "core");
  }

  function zoom(step: 1 | -1) {
    const rig = controls.current;
    if (!rig) return;
    takeOver();
    const next = Math.min(rig.maxDistance, Math.max(rig.minDistance, rig.distance * (step > 0 ? 0.72 : 1 / 0.72)));
    void rig.dollyTo(next, !live.current.reduced);
  }

  /** The user (or a zoom) took over: stop flights and the drift; the pan stays where it is. */
  function takeOver() {
    flight.current = null;
    lastInput.current = clock();
    drift.current = { phase: 0, applied: 0 };
    mode.current = "free";
  }

  function handle(command: CameraCommand) {
    handled.current = command.nonce;
    if (command.kind === "focus") focus(command.id);
    else if (command.kind === "core") core();
    else if (command.kind === "overview") fly(overviewPose(), 1.1, "overview");
    else zoom(command.step);
  }

  useEffect(() => {
    const rig = controls.current;
    if (!rig) return;
    rig.mouseButtons.right = ACTION_SCREEN_PAN;
    rig.touches.two = ACTION_TOUCH_DOLLY_SCREEN_PAN as typeof rig.touches.two;
  }, []);

  // User input stops flights and the drift.
  useEffect(() => {
    const rig = controls.current;
    const element = gl.domElement;
    const onStart = () => takeOver();
    const onInput = () => {
      lastInput.current = clock();
      drift.current = { phase: 0, applied: 0 };
    };
    rig?.addEventListener("controlstart", onStart);
    element.addEventListener("pointerdown", onInput);
    element.addEventListener("wheel", onInput, { passive: true });
    return () => {
      rig?.removeEventListener("controlstart", onStart);
      element.removeEventListener("pointerdown", onInput);
      element.removeEventListener("wheel", onInput);
    };
  }, [gl]);

  // Resized or panel toggled while resting at the overview: refit.
  useEffect(() => {
    if (!introDone.current || mode.current !== "overview" || flight.current) return;
    fly(overviewPose(), 0.6, "overview", easeOutCubic);
  }, [size.width, size.height, rightInset, bottomInset]);

  // New tasks changed the overview frame noticeably: refit while resting there.
  useEffect(() => {
    const rig = controls.current;
    if (!rig) return;
    if (!introDone.current) {
      applyLimits(rig, true);
      return;
    }
    if (mode.current !== "overview" || flight.current) {
      applyLimits(rig, false);
      return;
    }
    const before = overviewDistance.current;
    const pose = overviewPose();
    applyLimits(rig, false);
    if (pose.distance > before * 1.08 || pose.distance < before * 0.8) fly(pose, 1.1, "overview");
  }, [layout]);

  useFrame((_, dt) => {
    const rig = controls.current;
    if (!rig) return;
    const t = clock();
    const v = live.current;

    // Lens shift toward the current insets.
    const k = v.reduced ? 1 : 1 - Math.exp(-8 * Math.min(dt, 0.1));
    const area = freeArea(v.width, v.height, v.rightInset, v.bottomInset);
    shift.current.right += (area.right - shift.current.right) * k;
    shift.current.bottom += (area.bottom - shift.current.bottom) * k;
    if (camera instanceof PerspectiveCamera) {
      const r = Math.abs(shift.current.right) < 0.25 ? 0 : shift.current.right;
      const b = Math.abs(shift.current.bottom) < 0.25 ? 0 : shift.current.bottom;
      const fullW = area.width + r;
      const fullH = area.height + b;
      camera.aspect = fullW / fullH;
      camera.fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * (fullH / area.height)) * 180) / Math.PI;
      if (r || b) camera.setViewOffset(fullW, fullH, r, b, area.width, area.height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }

    // Intro: on each new study, from high above down to the overview.
    if (rt.introSeq !== introSeq.current && rt.introAt <= t) {
      introSeq.current = rt.introSeq;
      introDone.current = false;
      applyLimits(rig, true);
      const end = overviewPose();
      if (v.reduced) {
        fly(end, 0, "overview");
        introDone.current = true;
        applyLimits(rig, false);
      } else {
        applyPose(rig, { target: new Vector3(0, 0, 0), distance: end.distance * 1.9, polar: 0.06, azimuth: end.azimuth - 0.6, focal: { x: 0, y: 0 } });
        fly(end, INTRO_SECONDS, "overview");
      }
    }

    // Camera commands (one pending from before the mount runs once the intro starts).
    const command = useStudy.getState().cameraCommand;
    if (command && command.nonce !== handled.current && introSeq.current >= 0) handle(command);

    const f = flight.current;
    if (f) {
      const p = clamp01((t - f.start) / f.duration);
      const e = f.ease(p);
      const target = new Vector3().lerpVectors(f.from.target, f.to.target, e);
      const logD = Math.log(f.from.distance) + (Math.log(f.to.distance) - Math.log(f.from.distance)) * e;
      const distance = Math.exp(logD) * (1 + f.hop * Math.sin(Math.PI * e));
      const polar = f.from.polar + (f.to.polar - f.from.polar) * e;
      const azimuth = f.from.azimuth + wrapAngle(f.to.azimuth - f.from.azimuth) * e;
      focal.current = { x: f.from.focal.x + (f.to.focal.x - f.from.focal.x) * e, y: f.from.focal.y + (f.to.focal.y - f.from.focal.y) * e };
      void rig.setTarget(target.x, target.y, target.z, false);
      void rig.rotateTo(azimuth, polar, false);
      void rig.dollyTo(distance, false);
      if (p >= 1) {
        flight.current = null;
        lastInput.current = t;
        if (!introDone.current) {
          introDone.current = true;
          applyLimits(rig, false);
        }
      }
    } else {
      // Overview keeps its centring pan (refits update it); focus / core rest at zero.
      if (mode.current === "overview" || mode.current === "focus" || mode.current === "core") {
        const desired = mode.current === "overview" ? restFocal.current : { x: 0, y: 0 };
        focal.current = { x: focal.current.x + (desired.x - focal.current.x) * k, y: focal.current.y + (desired.y - focal.current.y) * k };
      }
      // Idle sway around the goal (never while a card is selected or under reduced motion).
      const selected = useStudy.getState().selectedId;
      if (!v.reduced && introDone.current && !selected && t - lastInput.current > IDLE_SECONDS && mode.current !== "focus") {
        const d = drift.current;
        d.phase += dt * DRIFT_SPEED;
        const offset = DRIFT_AMPLITUDE * Math.sin(d.phase * Math.PI * 2);
        void rig.rotate(offset - d.applied, 0, false);
        d.applied = offset;
      }
    }
    void rig.setFocalOffset(focal.current.x, focal.current.y, 0, false);

    // Fog: the desk melts into the page well beyond the content, whatever the zoom.
    const fog = scene.fog;
    if (fog instanceof Fog) {
      const r = v.layout.radius;
      fog.near = rig.distance + r * 0.9;
      fog.far = rig.distance * 1.6 + r * 2.6;
    }
  }, -3);

  useEffect(
    () => () => {
      if (camera instanceof PerspectiveCamera) {
        camera.clearViewOffset();
        camera.fov = FOV;
        camera.updateProjectionMatrix();
      }
    },
    [camera],
  );

  return <CameraControls ref={controls} makeDefault smoothTime={reduced ? 0 : 0.28} draggingSmoothTime={reduced ? 0 : 0.12} dollyToCursor={false} />;
}
