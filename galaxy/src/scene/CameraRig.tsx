// drei CameraControls driven by the store's cameraCommand channel.
// Flights are GSAP tweens over (target, distance, polar, azimuth, focal offset)
// so they have exact durations: intro 1.8 s, focus 1.1 s, core 0.9 s.
// Idle auto-rotate at 0.04 rad/s stops on any input and resumes after 8 s.

import { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { gsap } from "gsap";
import { useEffect, useRef, type ComponentRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { CORE_DIVE_MS, useGalaxy } from "../store";
import { fitOverview, shouldRefit, type FitPoint } from "./framing";
import type { SceneFx } from "./fx";
import type { SceneGraph } from "./graph";

type Controls = ComponentRef<typeof CameraControls>;

interface Pose {
  target: Vector3;
  distance: number;
  /** From +Y, radians. */
  polar: number;
  azimuth: number;
  focal: Vector3;
}

const OVERVIEW_POLAR = Math.acos(0.62);
/** Overview azimuth on landscape screens; portrait screens search for the tightest fit. */
const OVERVIEW_AZIMUTH = 0.35;
const PORTRAIT_STEPS = 24;
const FOCUS_POLAR = 1.08;
const IDLE_RESUME = 8;
const AUTO_ROTATE = 0.04;
/** Right-hand detail panel (desktop) and bottom sheet (≤ 900 px). */
const PANEL_WIDTH = 380;
const NARROW = 900;
/** Overview: share of the free viewport (each axis) the galaxy fills. */
const OVERVIEW_FILL = 0.8;
/** Fallback height of the HUD top bar when it cannot be measured. */
const TOP_BAR = 76;
/** Rough label box around its anchor (px): height above, half-width either side. */
const LABEL_HEIGHT = 26;
const LABEL_HALF = 64;
/** Tiny graphs still frame at least this radius around the core. */
const MIN_FRAME = 6;
/** Goal focus: the core's diameter as a share of the viewport height. */
const GOAL_SHARE = 0.18;

const scratch = new Vector3();

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function readPose(rig: Controls): Pose {
  return {
    target: rig.getTarget(new Vector3()),
    distance: rig.distance,
    polar: rig.polarAngle,
    azimuth: rig.azimuthAngle,
    focal: rig.getFocalOffset(new Vector3()),
  };
}

function applyPose(rig: Controls, pose: Pose) {
  void rig.setTarget(pose.target.x, pose.target.y, pose.target.z, false);
  void rig.rotateTo(pose.azimuth, pose.polar, false);
  void rig.dollyTo(pose.distance, false);
  void rig.setFocalOffset(pose.focal.x, pose.focal.y, pose.focal.z, false);
}

/** Pixels the HUD top bar covers over the canvas (it may be taller on phones). */
function topBarHeight(canvas: HTMLCanvasElement): number {
  const bar = document.querySelector("header.topbar");
  if (!bar) return TOP_BAR;
  const bottom = bar.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top;
  return Number.isFinite(bottom) && bottom > 0 ? bottom + 8 : TOP_BAR;
}

/** Body anchors and label boxes the overview has to fit. */
function framePoints(graph: SceneGraph, labelHalf: number): FitPoint[] {
  const points: FitPoint[] = [];
  for (const node of graph.nodes) {
    const { x, y, z, r } = node.p;
    points.push({ x, y: y + node.lift, z, padX: node.node.goal ? 0 : labelHalf, padTop: LABEL_HEIGHT, padBottom: 0 });
    points.push({ x, y: y - r, z, padX: 0, padTop: 0, padBottom: 4 });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    points.push({ x: Math.cos(a) * MIN_FRAME, y: 0, z: Math.sin(a) * MIN_FRAME, padX: 0, padTop: 0, padBottom: 0 });
  }
  return points;
}

export function CameraRig({ graph, fx }: { graph: SceneGraph; fx: SceneFx }) {
  const controls = useRef<Controls>(null);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const command = useGalaxy((state) => state.cameraCommand);
  const reducedMotion = useGalaxy((state) => state.reducedMotion);
  const selectedId = useGalaxy((state) => state.selectedId);
  const studyId = useGalaxy((state) => state.studyId);
  const loadState = useGalaxy((state) => state.loadState);

  const tween = useRef<gsap.core.Tween | null>(null);
  const lastInput = useRef(performance.now() / 1000);
  const introFor = useRef<string | null>(null);
  /** Focal offset of the last flight with no panel: the overview's pan, or zero. */
  const restFocal = useRef(new Vector3());
  /** The camera rests at (or flies to) the overview and the user has not moved it since. */
  const atOverview = useRef(false);
  /** Node count of the graph the overview was last fitted to. */
  const fittedCount = useRef(0);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const fovTan = () => Math.tan(((camera instanceof PerspectiveCamera ? camera.fov : 45) * Math.PI) / 360);

  /**
   * Focal offset that centres a body in the area left free by the HUD: beside
   * the detail panel (desktop) or above the bottom sheet (≤ 900 px), and below
   * the top bar. camera-controls moves the camera by +x right and by -y up, so
   * a positive y lifts the content.
   */
  function panelOffset(distance: number, panelOpen: boolean): Vector3 {
    if (!panelOpen) return new Vector3();
    const worldPerPx = (2 * distance * fovTan()) / Math.max(1, size.height);
    const top = topBarHeight(gl.domElement);
    if (size.width > NARROW) return new Vector3((PANEL_WIDTH / 2) * worldPerPx, -(top / 2) * worldPerPx, 0);
    const sheet = Math.min(size.height * 0.56, 480);
    return new Vector3(0, ((sheet - top) / 2) * worldPerPx, 0);
  }

  function fly(to: Pose, duration: number, ease: string, hop = 0) {
    const rig = controls.current;
    if (!rig) return;
    tween.current?.kill();
    tween.current = null;
    lastInput.current = performance.now() / 1000;
    if (reducedMotion || duration <= 0) {
      applyPose(rig, to);
      return;
    }
    const from = readPose(rig);
    const dAz = wrapAngle(to.azimuth - from.azimuth);
    const logFrom = Math.log(from.distance);
    const logTo = Math.log(to.distance);
    const pose: Pose = { target: new Vector3(), distance: 1, polar: 0, azimuth: 0, focal: new Vector3() };
    const proxy = { t: 0 };
    tween.current = gsap.to(proxy, {
      t: 1,
      duration,
      ease,
      onUpdate: () => {
        const t = proxy.t;
        pose.target.lerpVectors(from.target, to.target, t);
        pose.distance = Math.exp(logFrom + (logTo - logFrom) * t) * (1 + hop * Math.sin(Math.PI * t));
        pose.polar = from.polar + (to.polar - from.polar) * t;
        pose.azimuth = from.azimuth + dAz * t;
        pose.focal.lerpVectors(from.focal, to.focal, t);
        applyPose(rig, pose);
      },
      onComplete: () => {
        tween.current = null;
        lastInput.current = performance.now() / 1000;
      },
    });
  }

  /**
   * Fit every body and its label into OVERVIEW_FILL of the area below the top
   * bar, panning with the focal offset. Portrait screens are width-bound, so
   * there the azimuth that fits tightest (long axis running up the screen) wins.
   * Intro, the overview command and R all land on this same pose. With
   * `keepAzimuth` (refits on landscape screens) it fits at that angle instead.
   * No side effects; see overviewPose.
   */
  function fitPose(keepAzimuth?: number): Pose {
    const points = framePoints(graphRef.current, Math.min(LABEL_HALF, size.width * 0.06));
    const view = {
      polar: OVERVIEW_POLAR,
      azimuth: OVERVIEW_AZIMUTH,
      fov: camera instanceof PerspectiveCamera ? camera.fov : 45,
      width: size.width,
      height: size.height,
      top: topBarHeight(gl.domElement),
      fill: OVERVIEW_FILL,
    };
    let azimuth = keepAzimuth ?? OVERVIEW_AZIMUTH;
    let fit = fitOverview(points, { ...view, azimuth });
    if (keepAzimuth === undefined && size.width < size.height) {
      for (let i = 1; i < PORTRAIT_STEPS; i++) {
        const candidate = OVERVIEW_AZIMUTH + (i / PORTRAIT_STEPS) * Math.PI * 2;
        const next = fitOverview(points, { ...view, azimuth: candidate });
        // Only switch for a clear gain, so near-ties keep the canonical angle.
        if (next.distance < fit.distance * 0.95) {
          fit = next;
          azimuth = wrapAngle(candidate);
        }
      }
    }
    // camera-controls moves the camera by -focal.y along its up axis.
    const focal = new Vector3(fit.focalX, -fit.focalY, 0);
    return { target: new Vector3(), distance: fit.distance, polar: OVERVIEW_POLAR, azimuth, focal };
  }

  /** The overview pose, recorded as the rest pose the camera is about to fly to. */
  function overviewPose(keepAzimuth?: number): Pose {
    const pose = fitPose(keepAzimuth);
    fx.overviewDistance = pose.distance;
    fittedCount.current = graphRef.current.nodes.length;
    restFocal.current.copy(pose.focal);
    atOverview.current = true;
    return pose;
  }

  /** Refits keep the auto-rotated azimuth on settled landscape screens; portrait searches again. */
  function refitAzimuth(): number | undefined {
    const rig = controls.current;
    return rig && !tween.current && size.width >= size.height ? rig.azimuthAngle : undefined;
  }

  function focus(id: string) {
    const rig = controls.current;
    const node = graphRef.current.byId.get(id);
    if (!rig || !node) return;
    const target = new Vector3(node.p.x, node.p.y, node.p.z);
    // The goal sits back far enough that its core is ~GOAL_SHARE of the view
    // height; CoreStar also tones its glare down at this range.
    const distance = node.node.goal ? node.p.r / (GOAL_SHARE * fovTan()) : Math.max(3.4, node.p.r * 10 + 2.4);
    const current = rig.getTarget(scratch);
    const travel = current.distanceTo(target);
    const hop = Math.min(0.5, travel / 40);
    restFocal.current.set(0, 0, 0);
    atOverview.current = false;
    fly(
      { target, distance, polar: FOCUS_POLAR, azimuth: rig.azimuthAngle, focal: panelOffset(distance, true) },
      1.1,
      "power3.inOut",
      hop,
    );
  }

  function core() {
    const rig = controls.current;
    if (!rig) return;
    const r = graphRef.current.goal?.p.r ?? 0.8;
    restFocal.current.set(0, 0, 0);
    atOverview.current = false;
    fly({ target: new Vector3(), distance: r * 3.4, polar: 1.18, azimuth: rig.azimuthAngle, focal: new Vector3() }, CORE_DIVE_MS / 1000, "power2.in");
  }

  // Intro flight on the first data of a study: far and steep → overview.
  useEffect(() => {
    const rig = controls.current;
    if (!rig || !studyId || loadState === "loading" || introFor.current === studyId) return;
    introFor.current = studyId;
    const end = overviewPose();
    if (reducedMotion) {
      fly(end, 0, "none");
      return;
    }
    applyPose(rig, { target: new Vector3(), distance: end.distance * 3.2, polar: 0.12, azimuth: end.azimuth - 1.75, focal: new Vector3() });
    fly(end, 1.8, "power2.inOut");
  }, [studyId, loadState, graph]);

  // The intro may have framed an empty graph (no snapshot yet, ok:false, a
  // first-load error): when tasks arrive or outgrow the frame, refit while
  // the camera still rests at the overview with nothing selected.
  useEffect(() => {
    if (!controls.current || introFor.current !== studyId || !atOverview.current || selectedId) return;
    const azimuth = refitAzimuth();
    const next = fitPose(azimuth);
    const fitted = { count: fittedCount.current, distance: fx.overviewDistance };
    if (!shouldRefit(fitted, { count: graph.nodes.length, distance: next.distance })) return;
    fly(overviewPose(azimuth), 1.1, "power3.inOut");
  }, [graph]);

  // Resized while resting at the overview: refit to the new viewport.
  useEffect(() => {
    if (!controls.current || introFor.current !== studyId || !atOverview.current || selectedId) return;
    fly(overviewPose(refitAzimuth()), tween.current ? 0.6 : 0, "power2.out");
  }, [size.width, size.height]);

  useEffect(() => {
    if (!command) return;
    if (command.kind === "focus") focus(command.id);
    else if (command.kind === "core") core();
    else {
      if (controls.current) fly(overviewPose(), 1.1, "power3.inOut");
    }
    // Only a new nonce triggers a flight.
  }, [command?.nonce]);

  // Panel closed: glide the focal offset back to rest (centre, or the
  // overview's pan when the panel was open over the overview, e.g. after R).
  useEffect(() => {
    const rig = controls.current;
    if (selectedId || !rig || tween.current) return;
    const pose = readPose(rig);
    if (pose.focal.distanceToSquared(restFocal.current) < 1e-8) return;
    fly({ ...pose, focal: restFocal.current.clone() }, 0.6, "power2.out");
  }, [selectedId]);

  // Any input stops a flight and the auto-rotate; it resumes after 8 s idle.
  useEffect(() => {
    const rig = controls.current;
    const element = gl.domElement;
    const onInput = () => {
      lastInput.current = performance.now() / 1000;
    };
    const onGrab = () => {
      tween.current?.kill();
      tween.current = null;
      atOverview.current = false;
      onInput();
    };
    rig?.addEventListener("controlstart", onGrab);
    element.addEventListener("pointerdown", onGrab);
    element.addEventListener("wheel", onGrab, { passive: true });
    element.addEventListener("touchstart", onGrab, { passive: true });
    window.addEventListener("keydown", onInput);
    return () => {
      rig?.removeEventListener("controlstart", onGrab);
      element.removeEventListener("pointerdown", onGrab);
      element.removeEventListener("wheel", onGrab);
      element.removeEventListener("touchstart", onGrab);
      window.removeEventListener("keydown", onInput);
    };
  }, [gl]);

  useEffect(() => () => void tween.current?.kill(), []);

  useFrame((_, delta) => {
    const rig = controls.current;
    if (!rig || reducedMotion || tween.current || selectedId || introFor.current === null) return;
    if (performance.now() / 1000 - lastInput.current < IDLE_RESUME) return;
    void rig.rotate(AUTO_ROTATE * Math.min(delta, 0.1), 0, false);
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      smoothTime={reducedMotion ? 0 : 0.3}
      draggingSmoothTime={reducedMotion ? 0 : 0.12}
      minDistance={0.8}
      maxDistance={240}
    />
  );
}
