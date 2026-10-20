// Launch sequence after a successful submit: a new star is born at the
// composer's launch button, rises along an arc into the first 调研中 slot
// (the row makes room), ignites into a proto-galaxy with a shock ring, and
// hands over to the director, which dives in and navigates.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  MathUtils,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import { splitRows } from "../format";
import { buildGalaxy } from "../geometry";
import { slotPose, slotX } from "../layout";
import { gallery, updateGalleryLayout } from "../motion";
import { useHome, type Launch } from "../store";
import { fx } from "./fx";
import { discFragment, discVertex, galaxyFragment, galaxyVertex, glowFragment, glowVertex, shared } from "./shaders";

const TRAIL = 56;
const BIRTH = 0.35;
const TRAVEL = 1.15;
const IGNITE = 0.7;
const CYAN = new Color("#8fe9ff");

const ndc = new Vector2();
const ray = new Vector3();
const head = new Vector3();
const control = new Vector3();
const slot = new Vector3();

function bezier(out: Vector3, a: Vector3, c: Vector3, b: Vector3, t: number): Vector3 {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
}

export function LaunchStar() {
  const launch = useHome((state) => state.launch);
  useEffect(() => {
    if (launch) return;
    gallery.launchSlot = false;
  }, [launch]);
  return launch ? <Star key={launch.href} launch={launch} /> : null;
}

function Star({ launch }: { launch: Launch }) {
  const camera = useThree((state) => state.camera);
  const root = useRef<Group>(null!);
  const glow = useRef<Mesh>(null!);
  const shock = useRef<Mesh>(null!);
  const start = useRef(-1);
  const origin = useRef(new Vector3());
  const handed = useRef(false);

  const assets = useMemo(() => {
    const data = buildGalaxy(null, launch.href, { radius: 1.25, dust: 640 });
    const galaxy = new BufferGeometry();
    galaxy.setAttribute("position", new BufferAttribute(data.position, 3));
    galaxy.setAttribute("color", new BufferAttribute(data.color, 3));
    galaxy.setAttribute("aSize", new BufferAttribute(data.size, 1));
    galaxy.setAttribute("aKind", new BufferAttribute(data.kind, 1));
    galaxy.setAttribute("aPhase", new BufferAttribute(data.phase, 1));
    galaxy.setAttribute("aState", new BufferAttribute(data.state, 1));
    const galaxyMaterial = new ShaderMaterial({
      vertexShader: galaxyVertex,
      fragmentShader: galaxyFragment,
      uniforms: {
        uTime: shared.uTime,
        uScale: shared.uScale,
        uMotion: shared.uMotion,
        uPulse: { value: 1 },
        uImplode: { value: 0 },
        uIgnite: { value: 0 },
        uBright: { value: 1.3 },
        uSat: { value: 1 },
        uFade: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const disc = new PlaneGeometry(3.1, 3.1);
    const discMaterial = new ShaderMaterial({
      vertexShader: discVertex,
      fragmentShader: discFragment,
      uniforms: {
        uTime: shared.uTime,
        uTwist: { value: 3 },
        uArms: { value: 2 },
        uBright: { value: 1.2 },
        uSat: { value: 1 },
        uFade: { value: 1 },
        uImplode: { value: 0 },
        uIgnite: { value: 0.001 },
        uInner: { value: new Color("#d9f6ff") },
        uOuter: { value: new Color("#6d9cff") },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const trail = new BufferGeometry();
    const trailPos = new Float32Array(TRAIL * 3);
    const trailColor = new Float32Array(TRAIL * 3);
    const trailSize = new Float32Array(TRAIL);
    const trailKind = new Float32Array(TRAIL).fill(1);
    const trailPhase = new Float32Array(TRAIL);
    const trailState = new Float32Array(TRAIL).fill(3);
    for (let i = 0; i < TRAIL; i += 1) {
      const f = 1 - i / TRAIL;
      trailColor.set([0.55 + 0.45 * f, 0.8 + 0.2 * f, 1], i * 3);
      trailSize[i] = 0.06 + 0.3 * Math.pow(f, 2.2);
      trailPhase[i] = i / TRAIL;
    }
    trail.setAttribute("position", new BufferAttribute(trailPos, 3));
    trail.setAttribute("color", new BufferAttribute(trailColor, 3));
    trail.setAttribute("aSize", new BufferAttribute(trailSize, 1));
    trail.setAttribute("aKind", new BufferAttribute(trailKind, 1));
    trail.setAttribute("aPhase", new BufferAttribute(trailPhase, 1));
    trail.setAttribute("aState", new BufferAttribute(trailState, 1));
    const trailMaterial = galaxyMaterial.clone();
    trailMaterial.uniforms = { ...galaxyMaterial.uniforms, uIgnite: { value: 1 }, uPulse: { value: 0 }, uFade: { value: 1 }, uBright: { value: 1 } };
    const glowGeometry = new PlaneGeometry(1, 1);
    const glowMaterial = new ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      uniforms: { uColor: { value: CYAN }, uIntensity: { value: 1 }, uRing: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const shockMaterial = glowMaterial.clone();
    shockMaterial.uniforms = { uColor: { value: new Color("#bfefff") }, uIntensity: { value: 0 }, uRing: { value: 1 } };
    return { galaxy, galaxyMaterial, disc, discMaterial, trail, trailMaterial, glowGeometry, glowMaterial, shockMaterial };
  }, [launch.href]);

  useEffect(
    () => () => {
      for (const value of Object.values(assets)) value.dispose();
    },
    [assets],
  );

  // Make room in the 调研中 row and bring its first slot into view.
  useEffect(() => {
    const rows = splitRows(useHome.getState().rows ?? []);
    gallery.launchSlot = true;
    updateGalleryLayout(gallery.width, gallery.height, Math.max(rows.running.length + 1, rows.done.length));
    gallery.velocity = 0;
    gallery.target = gallery.bounds.min;
    return () => {
      gallery.launchSlot = false;
      const now = splitRows(useHome.getState().rows ?? []);
      updateGalleryLayout(gallery.width, gallery.height, Math.max(now.running.length, now.done.length));
    };
  }, []);

  useFrame(() => {
    const now = shared.uTime.value;
    if (start.current < 0) {
      start.current = now;
      // Birth point: the launch button, a few units in front of the gallery.
      ndc.set((launch.from.x / gallery.width) * 2 - 1, -(launch.from.y / gallery.height) * 2 + 1);
      ray.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
      const distance = (5 - camera.position.z) / ray.z;
      origin.current.copy(camera.position).addScaledVector(ray, distance);
    }
    const t = now - start.current;
    const params = gallery.params;
    const rows = splitRows(useHome.getState().rows ?? []);
    const pose = slotPose(slotX(0, rows.running.length + 1, params.spacing, gallery.bounds.fits) - gallery.scroll, 0, params);
    slot.set(pose.x, pose.y, pose.z + 0.4);
    control.set(origin.current.x * 0.4 + slot.x * 0.6, slot.y + 2.6, 3.4);

    const travel = MathUtils.clamp((t - BIRTH) / TRAVEL, 0, 1);
    const eased = travel < 0.5 ? 2 * travel * travel : 1 - Math.pow(-2 * travel + 2, 2) / 2;
    bezier(head, origin.current, control, slot, eased);
    root.current.position.copy(slot);
    root.current.rotation.set(0.95, 0, 0.12);

    // Trail: shift positions back, put the head first.
    const attr = assets.trail.getAttribute("position") as BufferAttribute;
    const array = attr.array as Float32Array;
    array.copyWithin(3, 0, (TRAIL - 1) * 3);
    if (t < BIRTH) for (let i = 0; i < TRAIL; i += 1) array.set([head.x, head.y, head.z], i * 3);
    else array.set([head.x, head.y, head.z], 0);
    attr.needsUpdate = true;
    const birth = MathUtils.smoothstep(t, 0, BIRTH);
    const igniteT = MathUtils.clamp((t - BIRTH - TRAVEL) / IGNITE, 0, 1);
    assets.trailMaterial.uniforms.uFade!.value = birth * (1 - igniteT);

    glow.current.position.copy(head);
    glow.current.quaternion.copy(camera.quaternion);
    shock.current.quaternion.copy(camera.quaternion);
    const pulse = 1 + Math.sin(now * 14) * 0.08;
    glow.current.scale.setScalar((0.6 + birth * 1.1 + igniteT * 2.4 * (1 - igniteT)) * pulse);
    assets.glowMaterial.uniforms.uIntensity!.value = birth * (1.4 - igniteT * 0.6);

    const ignite = 1 - Math.pow(1 - igniteT, 3);
    assets.galaxyMaterial.uniforms.uIgnite!.value = ignite;
    assets.discMaterial.uniforms.uIgnite!.value = Math.max(0.001, ignite);
    shock.current.position.copy(slot);
    shock.current.scale.setScalar(0.2 + igniteT * 6.5);
    assets.shockMaterial.uniforms.uIntensity!.value = igniteT > 0 ? (1 - igniteT) * 1.6 : 0;

    if (igniteT >= 1 && !handed.current) {
      handed.current = true;
      fx.dive = { target: slot.clone(), href: launch.href };
    }
  });

  return (
    <>
      <group ref={root}>
        <mesh geometry={assets.disc} material={assets.discMaterial} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5} />
        <points geometry={assets.galaxy} material={assets.galaxyMaterial} renderOrder={6} />
      </group>
      <points geometry={assets.trail} material={assets.trailMaterial} frustumCulled={false} renderOrder={7} />
      <mesh ref={glow} geometry={assets.glowGeometry} material={assets.glowMaterial} renderOrder={8} />
      <mesh ref={shock} geometry={assets.glowGeometry} material={assets.shockMaterial} renderOrder={8} />
    </>
  );
}
