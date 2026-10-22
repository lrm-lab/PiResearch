// Shared three.js geometry and textures for the scene (built once, reused by every card).

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Texture,
} from "three";
import { CARD_ASPECT, CARD_BASE_W, CARD_THICKNESS } from "./layout";
import { ribbon, roundedRectOutline, type DeskPath } from "./paths";

/** Base card (k = 1). Cards scale uniformly by their layout `k`. */
export const CARD_W = CARD_BASE_W;
export const CARD_D = CARD_BASE_W / CARD_ASPECT;
export const CARD_R = 0.075;
const BEVEL = 0.012;
/** Height of the face plane above the card bottom. */
export const FACE_Y = CARD_THICKNESS + 0.002;
/** Edge strip extent around the face (world): inside / outside the edge. */
export const EDGE_IN = 0.02;
export const EDGE_OUT = 0.16;

function roundedShape(w: number, d: number, r: number): Shape {
  const shape = new Shape();
  const x = -w / 2;
  const y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

let slab: BufferGeometry | null = null;
let face: BufferGeometry | null = null;
let edge: BufferGeometry | null = null;
let plane: BufferGeometry | null = null;

/** Rounded slab, bottom at y = 0, top at CARD_THICKNESS. */
export function slabGeometry(): BufferGeometry {
  if (slab) return slab;
  const g = new ExtrudeGeometry(roundedShape(CARD_W - BEVEL * 2, CARD_D - BEVEL * 2, CARD_R - BEVEL), {
    depth: CARD_THICKNESS - BEVEL * 2,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 5,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, BEVEL, 0);
  g.computeVertexNormals();
  slab = g;
  return g;
}

/** Face plane with the card outline; uv (0,0) bottom-left of the canvas, canvas top toward −z. */
export function faceGeometry(): BufferGeometry {
  if (face) return face;
  const g = new ShapeGeometry(roundedShape(CARD_W, CARD_D, CARD_R), 6);
  const pos = g.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / CARD_W + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / CARD_D + 0.5;
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.rotateX(-Math.PI / 2);
  g.translate(0, FACE_Y, 0);
  face = g;
  return g;
}

/**
 * Flat strip around the card outline for the border beam, selection outline and glows.
 * aU = share of the perimeter (0…1), aDist = signed distance from the edge (world, + outside).
 */
export function edgeGeometry(): BufferGeometry {
  if (edge) return edge;
  const outline = roundedRectOutline(CARD_W, CARD_D, CARD_R, 8);
  const n = outline.length;
  const position: number[] = [];
  const u: number[] = [];
  const dist: number[] = [];
  const index: number[] = [];
  let total = 0;
  const lengths = [0];
  for (let i = 1; i <= n; i++) {
    const a = outline[i - 1]!;
    const b = outline[i % n]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
    lengths.push(total);
  }
  for (let i = 0; i <= n; i++) {
    const p = outline[i % n]!;
    const share = lengths[i]! / total;
    position.push(p.x - p.nx * EDGE_IN, FACE_Y + 0.0015, p.z - p.nz * EDGE_IN);
    position.push(p.x + p.nx * EDGE_OUT, FACE_Y + 0.0015, p.z + p.nz * EDGE_OUT);
    u.push(share, share);
    dist.push(-EDGE_IN, EDGE_OUT);
    if (i < n) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(position, 3));
  g.setAttribute("aU", new Float32BufferAttribute(u, 1));
  g.setAttribute("aDist", new Float32BufferAttribute(dist, 1));
  g.setIndex(index);
  edge = g;
  return g;
}

/** Unit plane lying on the desk (xz), facing up. */
export function deskPlane(): BufferGeometry {
  if (plane) return plane;
  const g = new PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  plane = g;
  return g;
}

/** Ribbon geometry from a desk path (position = centre line, aSide = sideways, uv = along/across). */
export function ribbonGeometry(path: DeskPath): BufferGeometry {
  const data = ribbon(path);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(data.position, 3));
  g.setAttribute("aSide", new BufferAttribute(data.side, 3));
  g.setAttribute("uv", new BufferAttribute(data.uv, 2));
  g.setIndex(new BufferAttribute(data.index, 1));
  g.computeBoundingSphere();
  // The vertex shader widens the ribbon; pad the bounds so it is never culled early.
  if (g.boundingSphere) g.boundingSphere.radius += 0.5;
  return g;
}

let shadowTex: Texture | null = null;
let glowTex: Texture | null = null;
let starTex: Texture | null = null;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Soft rounded-rectangle shadow: black with a blurred alpha falloff (a mask; tinted by the material). */
export function shadowTexture(): Texture {
  if (shadowTex) return shadowTex;
  shadowTex = canvasTexture(256, 192, (ctx) => {
    // Draw the shape far off-canvas and keep only its blurred shadow.
    ctx.shadowColor = "rgba(0, 0, 0, 1)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetX = 1000;
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    const w = 168;
    const h = 108;
    const x = (256 - w) / 2 - 1000;
    const y = (192 - h) / 2;
    const r = 14;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  });
  return shadowTex;
}

/** Radial white glow (sprites: prism core, caustic pool, bead halo). */
export function glowTexture(): Texture {
  if (glowTex) return glowTex;
  glowTex = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255, 255, 255, 1)");
    g.addColorStop(0.35, "rgba(255, 255, 255, 0.45)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  return glowTex;
}

/** Four-point star for the prism glint. */
export function starTexture(): Texture {
  if (starTex) return starTex;
  starTex = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 20);
    g.addColorStop(0, "rgba(255, 255, 255, 1)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    for (const [w, h] of [
      [3, 60],
      [60, 3],
    ] as const) {
      const lg = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
      lg.addColorStop(0, "rgba(255, 255, 255, 1)");
      lg.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(64, 64, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return starTex;
}
