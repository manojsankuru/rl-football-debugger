// pitch.ts — GRF-normalised pitch geometry + small vector utilities.
import type { Vec2, Side } from "../types";

// Field extents (GRF normalised units).
export const FIELD = {
  xMin: -1,
  xMax: 1,
  yMin: -0.42,
  yMax: 0.42,
  goalHalf: 0.044, // half-height of the goal mouth (posts at y = ±0.044)
  penAreaX: 0.7, // |x| beyond which it's "the box-ish" zone
  penAreaY: 0.27,
};

export function goalCenter(attackingSide: Side): Vec2 {
  // The goal a given side attacks toward.
  return attackingSide === "left" ? { x: 1, y: 0 } : { x: -1, y: 0 };
}

export function ownGoalCenter(side: Side): Vec2 {
  return side === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
}

// --- vector ops ---
export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function clampToField(p: Vec2): Vec2 {
  return {
    x: Math.max(FIELD.xMin, Math.min(FIELD.xMax, p.x)),
    y: Math.max(FIELD.yMin, Math.min(FIELD.yMax, p.y)),
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Shortest distance from point p to segment ab (used for passing lanes). */
export function pointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-12) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/**
 * Map normalised field coords → pixel coords inside a [width × height] box,
 * with `pad` margin. The left goal is on the left of the screen.
 */
export function toPx(
  p: Vec2,
  width: number,
  height: number,
  pad: number,
): Vec2 {
  const w = width - pad * 2;
  const h = height - pad * 2;
  const u = (p.x - FIELD.xMin) / (FIELD.xMax - FIELD.xMin);
  const t = (p.y - FIELD.yMin) / (FIELD.yMax - FIELD.yMin);
  return { x: pad + u * w, y: pad + t * h };
}

// 8 discrete movement directions in action-index order (action ids 1..8).
// 1 left, 2 top-left, 3 top, 4 top-right, 5 right, 6 bottom-right, 7 bottom, 8 bottom-left.
// Screen "top" = smaller y = -y in field space.
export const DIR_VECTORS: Vec2[] = [
  { x: -1, y: 0 }, // 1 left
  { x: -1, y: -1 }, // 2 top-left
  { x: 0, y: -1 }, // 3 top
  { x: 1, y: -1 }, // 4 top-right
  { x: 1, y: 0 }, // 5 right
  { x: 1, y: 1 }, // 6 bottom-right
  { x: 0, y: 1 }, // 7 bottom
  { x: -1, y: 1 }, // 8 bottom-left
].map(norm);

/** Closest of the 8 discrete directions to an arbitrary heading → action id (1..8). */
export function headingToActionId(heading: Vec2): number {
  let best = 1;
  let bestDot = -Infinity;
  for (let i = 0; i < 8; i++) {
    const d = dot(DIR_VECTORS[i], heading);
    if (d > bestDot) {
      bestDot = d;
      best = i + 1;
    }
  }
  return best;
}
