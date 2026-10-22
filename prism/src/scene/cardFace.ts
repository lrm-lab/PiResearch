// The top face of a task card, drawn on a canvas in CoForge's type (DOM canvas, no three.js):
// status ring + state label, a two-line title, the agent avatar tile + name, and `N 次调用` in mono.
// Logical size FACE_W × FACE_H CSS px, drawn at 2x.

import { BRAND, LAVENDER, SURFACE } from "../lib/palette";
import { TONE_RING, type TaskTone } from "../lib/status";
import { agentInitials } from "../ui/AgentAvatar";
import { rgba, type CardLook } from "./colors";
import { MONO, SANS } from "./fonts";
import { FACE_H, FACE_W } from "./layout";
import { wrapText } from "./text";

export const FACE_SCALE = 2;
const PAD = 18;
const RADIUS = 12;
/** Marks and initials on solid tiles stay white in both themes (as StatusIcon / AgentAvatar). */
const ON_SOLID = SURFACE.light.card;

export interface FaceData {
  id: string;
  title: string;
  /** State text as on the 2D tab (进行中, 存在错误, 待分配 …). */
  state: string;
  tone: TaskTone;
  agent: string | null;
  agentHex: string;
  calls: number;
  look: CardLook;
}

/** Changes whenever anything drawn on the face changes. */
export function faceKey(face: FaceData, theme: string, fonts: number): string {
  const l = face.look;
  return [face.id, face.title, face.state, face.tone, face.agent ?? "", face.agentHex, face.calls, l.face, l.faceAlpha, l.title, l.border, l.dashed, theme, fonts].join("|");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** CoForge's TaskStatusIcon at 16 px: ring, pie by progress, full disc with a white mark. */
function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, tone: TaskTone, color: string) {
  const ring = TONE_RING[tone];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 6.25, 0, Math.PI * 2);
  ctx.stroke();
  if (ring.fill > 0 && ring.fill < 1) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 3.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring.fill);
    ctx.closePath();
    ctx.fill();
  }
  if (ring.fill === 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = ON_SOLID;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ring.mark === "check") {
    ctx.moveTo(cx - 2.8, cy + 0.2);
    ctx.lineTo(cx - 0.9, cy + 2.1);
    ctx.lineTo(cx + 2.8, cy - 1.8);
  } else if (ring.mark === "cross") {
    ctx.moveTo(cx - 2, cy - 2);
    ctx.lineTo(cx + 2, cy + 2);
    ctx.moveTo(cx + 2, cy - 2);
    ctx.lineTo(cx - 2, cy + 2);
  } else if (ring.mark === "bang") {
    ctx.lineWidth = 1.6;
    ctx.moveTo(cx, cy - 3.2);
    ctx.lineTo(cx, cy + 0.6);
    ctx.moveTo(cx, cy + 2.9);
    ctx.lineTo(cx, cy + 3);
  }
  ctx.stroke();
  ctx.restore();
}

/** CoForge avatar tile: rounded square on the agent tone with the violet gradient hairline. */
function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, face: FaceData) {
  ctx.save();
  if (!face.agent) {
    ctx.setLineDash([3, 2.5]);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = face.look.muted;
    roundRect(ctx, x + 0.75, y + 0.75, size - 1.5, size - 1.5, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = face.look.muted;
    ctx.font = `normal 600 11px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", x + size / 2, y + size / 2 + 0.5);
    ctx.restore();
    return;
  }
  roundRect(ctx, x, y, size, size, 7);
  ctx.fillStyle = face.agentHex;
  ctx.fill();
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, LAVENDER);
  gradient.addColorStop(1, rgba(BRAND[600], 0.5));
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x + 0.75, y + 0.75, size - 1.5, size - 1.5, 6.25);
  ctx.stroke();
  ctx.fillStyle = ON_SOLID;
  ctx.font = `normal 600 10px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(agentInitials(face.agent), x + size / 2, y + size / 2 + 0.5);
  ctx.restore();
}

export function drawFace(canvas: HTMLCanvasElement, face: FaceData): void {
  const W = FACE_W;
  const H = FACE_H;
  if (canvas.width !== W * FACE_SCALE) canvas.width = W * FACE_SCALE;
  if (canvas.height !== H * FACE_SCALE) canvas.height = H * FACE_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const look = face.look;
  ctx.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Card surface: the geometry clips the corners; the canvas paints edge to edge.
  ctx.fillStyle = rgba(look.face, look.faceAlpha);
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = look.dashed ? 2 : 2.5;
  ctx.strokeStyle = look.border;
  if (look.dashed) ctx.setLineDash([6, 4]);
  roundRect(ctx, 1.25, 1.25, W - 2.5, H - 2.5, RADIUS);
  ctx.stroke();
  ctx.setLineDash([]);

  // Status accent: a short rounded bar along the top edge, legible from the overview.
  ctx.fillStyle = rgba(look.ring, look.dashed ? 0.55 : 0.9);
  roundRect(ctx, PAD, 5, 44, 3, 1.5);
  ctx.fill();

  // Row 1: status ring + state, task id on the right.
  drawRing(ctx, PAD + 8, PAD + 9, face.tone, look.ring);
  ctx.font = `normal 500 14px ${SANS}`;
  ctx.fillStyle = look.label;
  ctx.textBaseline = "middle";
  ctx.fillText(face.state, PAD + 24, PAD + 9.5);
  ctx.font = `normal 500 13px ${MONO}`;
  ctx.fillStyle = rgba(look.muted, 0.8);
  ctx.textAlign = "right";
  ctx.fillText(face.id, W - PAD, PAD + 9.5);
  ctx.textAlign = "left";

  // Title: text-lg semibold, two lines.
  ctx.font = `normal 600 25px ${SANS}`;
  ctx.fillStyle = look.title;
  ctx.textBaseline = "alphabetic";
  const lines = wrapText(face.title || "研究任务", W - PAD * 2, (text) => ctx.measureText(text).width, 2);
  lines.forEach((line, i) => ctx.fillText(line, PAD, 72 + i * 31));

  // Bottom row: avatar + agent, call count in mono.
  const rowY = H - PAD - 24;
  drawAvatar(ctx, PAD, rowY, 24, face);
  ctx.font = `normal 500 12px ${SANS}`;
  ctx.fillStyle = look.muted;
  ctx.textBaseline = "middle";
  const callText = `${face.calls} 次调用`;
  ctx.font = `normal 500 13px ${MONO}`;
  const callWidth = ctx.measureText(callText).width;
  ctx.textAlign = "right";
  ctx.fillText(callText, W - PAD, rowY + 12.5);
  ctx.textAlign = "left";
  ctx.font = `normal 500 13px ${SANS}`;
  const nameMax = W - PAD * 2 - 32 - callWidth - 10;
  const name = wrapText(face.agent ?? "待分配", nameMax, (text) => ctx.measureText(text).width, 1)[0] ?? "";
  ctx.fillText(name, PAD + 32, rowY + 12.5);
}
