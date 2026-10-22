// Camera: intro glide, idle sway with the pointer, keyboard-focus reveal,
// and the flight into a study (≈0.9 s, warp streaks, white-blue flash) that
// ends with navigation. The launch star hands over via fx.dive.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, MathUtils, ShaderMaterial, Vector3, type LineSegments, type PerspectiveCamera } from "three";
import { flags, navigate } from "../flags";
import { EXPAND_PX, FOV, scrollToReveal } from "../layout";
import { gallery } from "../motion";
import { useHome } from "../store";
import { splitRows } from "../format";
import { fx } from "./fx";
import { shared, warpFragment, warpVertex } from "./shaders";

const FLIGHT_S = 0.9;
const INTRO_S = 2.0;
const STREAKS = 520;

interface Flight {
  start: number;
  from: Vector3;
  fromLook: Vector3;
  target: Vector3;
  href: string;
  done: boolean;
}

const look = new Vector3();
const basePos = new Vector3();
const baseLook = new Vector3(0, 0, 0);
const tmp = new Vector3();

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeInQuart(t: number) {
  return t * t * t * t;
}

export function Director() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const flight = useRef<Flight | null>(null);
  const intro = useRef({ start: -1 });
  const currentLook = useRef(new Vector3());
  const warp = useRef<LineSegments>(null!);

  const streaks = useMemo(() => {
    const geometry = new BufferGeometry();
    const position = new Float32Array(STREAKS * 2 * 3);
    const seed = new Float32Array(STREAKS * 2);
    const end = new Float32Array(STREAKS * 2);
    for (let i = 0; i < STREAKS; i += 1) {
      const s = (i + 0.5) / STREAKS;
      seed[i * 2] = s;
      seed[i * 2 + 1] = s;
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
    }
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seed, 1));
    geometry.setAttribute("aEnd", new BufferAttribute(end, 1));
    const material = new ShaderMaterial({
      vertexShader: warpVertex,
      fragmentShader: warpFragment,
      uniforms: { uTime: shared.uTime, uWarp: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
    });
    return { geometry, material };
  }, []);
  useEffect(
    () => () => {
      streaks.geometry.dispose();
      streaks.material.dispose();
    },
    [streaks],
  );

  // Keyboard focus scrolls the gallery so the focused study is in view.
  useEffect(
    () =>
      useHome.subscribe((state, previous) => {
        if (!state.focused || state.focused === previous.focused) return;
        const { running, done } = splitRows(state.rows ?? []);
        const section = running.some((r) => r.id === state.focused) ? 0 : 1;
        const index = (section === 0 ? running : done).findIndex((r) => r.id === state.focused);
        if (index < 0) return;
        const shift = section === 0 && gallery.launchSlot ? 1 : 0;
        const slot = gallery.layout.slots[section][index + shift];
        if (!slot) return;
        gallery.velocity = 0;
        // The focused caption expands; keep that in view too.
        const extra = EXPAND_PX / gallery.ppu;
        gallery.target = scrollToReveal(gallery.target, slot.y, gallery.params, gallery.layout, gallery.band, gallery.bounds, extra);
      }),
    [],
  );

  function arrive(href: string) {
    navigate(href);
    // ?navigate=0: come back out after a beat so the run can be repeated.
    if (flags.stay) setTimeout(() => useHome.getState().resetMotion(), 1400);
  }

  /**
   * Start the dive. With reduced motion, or with no galaxy to fly into
   * (`target` null), the flight is recorded as already done and navigates
   * once, so the frame loop does not start it again.
   */
  function startFlight(target: Vector3 | null, href: string) {
    const instant = !target || useHome.getState().reducedMotion;
    flight.current = {
      start: shared.uTime.value,
      from: camera.position.clone(),
      fromLook: currentLook.current.clone(),
      target: (target ?? currentLook.current).clone(),
      href,
      done: instant,
    };
    if (instant) arrive(href);
  }

  useFrame((_state, delta) => {
    const store = useHome.getState();
    const params = gallery.params;
    const now = shared.uTime.value;

    // A flight requested from the DOM or a galaxy click.
    if (store.flight && !flight.current) {
      const object = fx.galaxies.get(store.flight.id);
      startFlight(object ? object.getWorldPosition(tmp) : null, store.flight.href);
    }
    if (fx.dive && !flight.current) {
      startFlight(fx.dive.target, fx.dive.href);
      fx.dive = null;
    }
    if (!store.flight && !store.launch && flight.current?.done) {
      // Back from bfcache: undo the dive.
      flight.current = null;
      if (camera.fov !== FOV) {
        camera.fov = FOV;
        camera.updateProjectionMatrix();
      }
    }

    const active = flight.current;
    if (active && !active.done) {
      const t = Math.min(1, (now - active.start) / FLIGHT_S);
      const move = easeInQuart(t) * 0.82 + easeInOutCubic(t) * 0.18;
      const end = tmp.copy(active.target).add(look.set(0, 0.02, 0.35));
      camera.position.lerpVectors(active.from, end, move);
      currentLook.current.lerpVectors(active.fromLook, active.target, Math.min(1, easeInOutCubic(Math.min(1, t * 1.6))));
      camera.lookAt(currentLook.current);
      camera.fov = FOV - 14 * easeInQuart(t);
      camera.updateProjectionMatrix();
      fx.warp = MathUtils.smoothstep(t, 0.12, 0.75);
      if (fx.flashEl) fx.flashEl.style.opacity = MathUtils.smoothstep(t, 0.6, 1).toFixed(3);
      if (t >= 1) {
        active.done = true;
        arrive(active.href);
      }
    } else if (!active) {
      // Rest pose: gentle sway with the pointer, and the intro glide.
      if (intro.current.start < 0) intro.current.start = now;
      const introT = store.reducedMotion ? 1 : Math.min(1, (now - intro.current.start) / INTRO_S);
      const glide = 1 - easeInOutCubic(introT);
      const motion = store.reducedMotion ? 0 : 1;
      basePos.set(
        gallery.pointer.x * 0.45 * motion,
        0.25 + gallery.pointer.y * 0.25 * motion + glide * 5,
        params.camDist + glide * 12,
      );
      baseLook.set(gallery.pointer.x * 0.12 * motion, 0.05 - glide * 1.5, 0);
      if (store.reducedMotion || introT < 1) camera.position.copy(basePos);
      else camera.position.lerp(basePos, 1 - Math.exp(-delta * 3));
      currentLook.current.lerp(baseLook, store.reducedMotion || introT < 1 ? 1 : 1 - Math.exp(-delta * 3));
      camera.lookAt(currentLook.current);
      fx.warp = MathUtils.damp(fx.warp, 0, 6, delta);
      if (fx.flashEl && fx.flashEl.style.opacity !== "0") fx.flashEl.style.opacity = "0";
    }

    // Warp streaks ride with the camera.
    const lines = warp.current;
    lines.position.copy(camera.position);
    lines.quaternion.copy(camera.quaternion);
    lines.visible = fx.warp > 0.002;
    streaks.material.uniforms.uWarp!.value = fx.warp;
  });

  return <lineSegments ref={warp} geometry={streaks.geometry} material={streaks.material} frustumCulled={false} renderOrder={20} />;
}
