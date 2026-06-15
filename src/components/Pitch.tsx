// Pitch.tsx — the signature element: a live tactical "scope" rendered on canvas.
//
// Runs its own requestAnimationFrame loop decoupled from the logical step rate.
// Each frame it eases every player's render position (rpos) toward its logical
// position (pos), then draws the field, the educational overlays, and the actors.
import { useEffect, useRef } from "react";
import type { SimState, Overlays, Tweaks, RewardWeights, Player, Vec2 } from "../types";
import { FIELD, toPx, goalCenter, dist, norm, sub, scale, add, len } from "../lib/pitch";
import { computeFeatures, pitchValue, laneOpenness, shootingAngle } from "../lib/features";
import { evaluatePolicy } from "../lib/agents";
import { DIR_VECTORS } from "../lib/pitch";

const PAL = {
  void: "#070a0f",
  grass: "#0a1f17",
  grassLine: "#15392b",
  signal: "#3dd7c9",
  away: "#ff7a59",
  select: "#c77dff",
  warn: "#ffd166",
  ink: "#e7eef5",
  ink3: "#5d6f80",
  good: "#7ee787",
  bad: "#ff6b6b",
};

const PAD = 16;
const EASE = 0.2;

interface Props {
  stateRef: React.MutableRefObject<SimState>;
  overlays: Overlays;
  tweaks: Tweaks;
  weights: RewardWeights;
}

export default function Pitch({ stateRef, overlays, tweaks, weights }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Keep latest props in refs so the single rAF loop never goes stale.
  const oRef = useRef(overlays);
  const tRef = useRef(tweaks);
  const wRef = useRef(weights);
  oRef.current = overlays;
  tRef.current = tweaks;
  wRef.current = weights;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let W = 0;
    let H = 0;

    const resize = () => {
      const wrap = wrapRef.current!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current!);

    const P = (p: Vec2) => toPx(p, W, H, PAD);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const s = stateRef.current;
      const ov = oRef.current;
      if (W === 0 || H === 0) return;

      // --- ease render positions ---------------------------------------------
      const ease = (e: { pos: Vec2; rpos: Vec2 }) => {
        if (reduce) {
          e.rpos.x = e.pos.x;
          e.rpos.y = e.pos.y;
        } else {
          e.rpos.x += (e.pos.x - e.rpos.x) * EASE;
          e.rpos.y += (e.pos.y - e.rpos.y) * EASE;
        }
      };
      s.left.forEach(ease);
      s.right.forEach(ease);
      s.ball.rpos.x += (s.ball.pos.x - s.ball.rpos.x) * (reduce ? 1 : 0.28);
      s.ball.rpos.y += (s.ball.pos.y - s.ball.rpos.y) * (reduce ? 1 : 0.28);

      ctx.clearRect(0, 0, W, H);
      drawField(ctx, P);

      const me = s.left[s.activePlayer];
      const f = computeFeatures(s);

      if (ov.valueHeatmap) drawHeatmap(ctx, s, W, H);
      drawField(ctx, P, true); // re-stroke lines over heatmap

      if (ov.fieldOfView && me) drawFOV(ctx, P, me, f.desiredHeading);
      if (ov.pressureRadius) drawPressure(ctx, P, s);
      if (ov.passingLanes && me && s.ball.owner?.side === "left")
        drawLanes(ctx, P, s, me);
      if (ov.shootingCone && f.activeHasBall) drawShootingCone(ctx, P, me);
      if (ov.ballTrajectory) drawTrail(ctx, P, s);
      if (ov.nearestLinks && me) drawLinks(ctx, P, s, me, f);

      drawPlayers(ctx, P, s);
      drawBall(ctx, P, s);

      if (ov.actionArrows && me) {
        const policy = evaluatePolicy(s, f, tRef.current, wRef.current);
        drawActionArrows(ctx, P, me, policy, f);
      }
      if (ov.rewardExplain) drawRewardHUD(ctx, s, W);
      drawScopeFrame(ctx, W, H);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [stateRef]);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
type Proj = (p: Vec2) => Vec2;

function drawField(ctx: CanvasRenderingContext2D, P: Proj, linesOnly = false) {
  const tl = P({ x: FIELD.xMin, y: FIELD.yMin });
  const br = P({ x: FIELD.xMax, y: FIELD.yMax });
  const w = br.x - tl.x;
  const h = br.y - tl.y;
  if (!linesOnly) {
    // grass with subtle vertical stripes
    ctx.fillStyle = PAL.grass;
    ctx.fillRect(tl.x, tl.y, w, h);
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      if (i % 2 === 0) continue;
      ctx.fillStyle = "rgba(255,255,255,0.014)";
      ctx.fillRect(tl.x + (w / stripes) * i, tl.y, w / stripes, h);
    }
  }
  ctx.strokeStyle = PAL.grassLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(tl.x, tl.y, w, h);
  // center line + circle
  const cx = (tl.x + br.x) / 2;
  ctx.beginPath();
  ctx.moveTo(cx, tl.y);
  ctx.lineTo(cx, br.y);
  ctx.stroke();
  const cy = (tl.y + br.y) / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, h * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fillStyle = PAL.grassLine;
  ctx.fill();
  // penalty boxes + goals at both ends
  const boxW = w * 0.12;
  const boxH = h * 0.46;
  const sixW = w * 0.05;
  const sixH = h * 0.24;
  // left
  ctx.strokeRect(tl.x, cy - boxH / 2, boxW, boxH);
  ctx.strokeRect(tl.x, cy - sixH / 2, sixW, sixH);
  // right
  ctx.strokeRect(br.x - boxW, cy - boxH / 2, boxW, boxH);
  ctx.strokeRect(br.x - sixW, cy - sixH / 2, sixW, sixH);
  // goals
  const goalH = (FIELD.goalHalf / (FIELD.yMax - FIELD.yMin)) * h * 2;
  ctx.strokeStyle = "rgba(231,238,245,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tl.x, cy - goalH / 2);
  ctx.lineTo(tl.x, cy + goalH / 2);
  ctx.moveTo(br.x, cy - goalH / 2);
  ctx.lineTo(br.x, cy + goalH / 2);
  ctx.stroke();
}

function valueColor(v: number): string {
  // v in [-1,1]; teal for positive (good for us), amber for negative.
  const a = Math.min(0.5, Math.abs(v) * 0.5);
  if (v >= 0) return `rgba(61,215,201,${a})`;
  return `rgba(255,122,89,${a})`;
}

function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  W: number,
  H: number,
) {
  const cols = 28;
  const rows = 14;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const cw = innerW / cols;
  const ch = innerH / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const fx = FIELD.xMin + ((i + 0.5) / cols) * (FIELD.xMax - FIELD.xMin);
      const fy = FIELD.yMin + ((j + 0.5) / rows) * (FIELD.yMax - FIELD.yMin);
      const v = pitchValue(s, { x: fx, y: fy });
      ctx.fillStyle = valueColor(v);
      ctx.fillRect(PAD + i * cw, PAD + j * ch, cw + 0.5, ch + 0.5);
    }
  }
}

function drawTrail(ctx: CanvasRenderingContext2D, P: Proj, s: SimState) {
  if (s.ballTrail.length < 2) return;
  ctx.lineWidth = 1.5;
  for (let i = 1; i < s.ballTrail.length; i++) {
    const a = P(s.ballTrail[i - 1]);
    const b = P(s.ballTrail[i]);
    const alpha = (i / s.ballTrail.length) * 0.5;
    ctx.strokeStyle = `rgba(255,209,102,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function laneColor(open: number): string {
  // green when open, red when blocked
  const r = Math.round(255 * (1 - open));
  const g = Math.round(231 * open + 90 * (1 - open));
  return `rgba(${r},${g},120,0.8)`;
}

function drawLanes(
  ctx: CanvasRenderingContext2D,
  P: Proj,
  s: SimState,
  me: Player,
) {
  ctx.lineWidth = 1.5;
  for (const mate of s.left) {
    if (mate.id === me.id || mate.role === "GK") continue;
    if (dist(me.pos, mate.pos) < 0.06) continue;
    const open = laneOpenness(me.pos, mate.pos, s.right);
    const a = P(me.rpos);
    const b = P(mate.rpos);
    ctx.strokeStyle = laneColor(open);
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawShootingCone(
  ctx: CanvasRenderingContext2D,
  P: Proj,
  me: Player,
) {
  const goal = goalCenter("left"); // left team attacks +x
  const postT = { x: goal.x, y: -FIELD.goalHalf };
  const postB = { x: goal.x, y: FIELD.goalHalf };
  const o = P(me.rpos);
  const a = P(postT);
  const b = P(postB);
  const ang = shootingAngle(me.pos, goal.x);
  const wide = ang > 0.18;
  ctx.fillStyle = wide ? "rgba(126,231,135,0.1)" : "rgba(255,107,107,0.1)";
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = wide ? "rgba(126,231,135,0.5)" : "rgba(255,107,107,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPressure(ctx: CanvasRenderingContext2D, P: Proj, s: SimState) {
  const R = 0.12;
  const rpx = (R / (FIELD.xMax - FIELD.xMin)) * (P({ x: 1, y: 0 }).x - P({ x: -1, y: 0 }).x);
  for (const opp of s.right) {
    if (opp.role === "GK") continue;
    const c = P(opp.rpos);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rpx);
    g.addColorStop(0, "rgba(255,122,89,0.16)");
    g.addColorStop(1, "rgba(255,122,89,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rpx, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFOV(
  ctx: CanvasRenderingContext2D,
  P: Proj,
  me: Player,
  heading: Vec2,
) {
  const h = len(heading) > 0.01 ? norm(heading) : { x: 1, y: 0 };
  const base = Math.atan2(h.y, h.x);
  const half = Math.PI / 4;
  const o = P(me.rpos);
  const far = P(add(me.rpos, scale(h, 0.35)));
  const r = Math.hypot(far.x - o.x, far.y - o.y);
  ctx.fillStyle = "rgba(61,215,201,0.08)";
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.arc(o.x, o.y, r, base - half, base + half);
  ctx.closePath();
  ctx.fill();
}

function drawLinks(
  ctx: CanvasRenderingContext2D,
  P: Proj,
  s: SimState,
  me: Player,
  f: ReturnType<typeof computeFeatures>,
) {
  const o = P(me.rpos);
  const mate = s.left[f.nearestTeammate.idx];
  const opp = s.right[f.nearestOpponent.idx];
  if (mate) {
    const m = P(mate.rpos);
    ctx.strokeStyle = "rgba(61,215,201,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
  }
  if (opp) {
    const p = P(opp.rpos);
    ctx.strokeStyle = "rgba(255,122,89,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

function drawPlayers(ctx: CanvasRenderingContext2D, P: Proj, s: SimState) {
  const drawTeam = (team: Player[], color: string, isLeft: boolean) => {
    for (const p of team) {
      const c = P(p.rpos);
      // velocity vector
      if (len(p.vel) > 0.0015) {
        const tip = P(add(p.rpos, scale(norm(p.vel), 0.05)));
        ctx.strokeStyle = "rgba(231,238,245,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
      const r = p.role === "GK" ? 5.5 : 6.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (p.role === "GK") {
        ctx.lineWidth = 2;
        ctx.strokeStyle = PAL.warn;
        ctx.stroke();
      }
      // jersey index
      ctx.fillStyle = "rgba(7,10,15,0.9)";
      ctx.font = "700 8px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(p.id), c.x, c.y + 0.5);
    }
    void isLeft;
  };
  drawTeam(s.right, PAL.away, false);
  drawTeam(s.left, PAL.signal, true);

  // active player ring
  const me = s.left[s.activePlayer];
  if (me) {
    const c = P(me.rpos);
    ctx.strokeStyle = PAL.select;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    // little tick marks
    ctx.beginPath();
    ctx.arc(c.x, c.y, 13, -0.3, 0.3);
    ctx.stroke();
  }
}

function drawBall(ctx: CanvasRenderingContext2D, P: Proj, s: SimState) {
  const c = P(s.ball.rpos);
  const lift = Math.min(8, s.ball.z * 120);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 3.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // ball (lifted)
  ctx.beginPath();
  ctx.arc(c.x, c.y - lift, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = PAL.ink;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(7,10,15,0.7)";
  ctx.stroke();
  // possession marker
  if (s.ball.owner) {
    const team = s.ball.owner.side === "left" ? s.left : s.right;
    const owner = team[s.ball.owner.player];
    if (owner) {
      const oc = P(owner.rpos);
      ctx.strokeStyle =
        s.ball.owner.side === "left" ? PAL.signal : PAL.away;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(oc.x, oc.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawActionArrows(
  ctx: CanvasRenderingContext2D,
  P: Proj,
  me: Player,
  policy: { probs: number[]; top3: number[] },
  f: ReturnType<typeof computeFeatures>,
) {
  const o = P(me.rpos);
  for (const id of policy.top3) {
    const p = policy.probs[id] ?? 0;
    if (p < 0.02) continue;
    let dir: Vec2 | null = null;
    let color = PAL.signal;
    if (id >= 1 && id <= 8) {
      dir = DIR_VECTORS[id - 1];
      color = PAL.signal;
    } else if (id === 12) {
      dir = norm(sub(goalCenter("left"), me.pos));
      color = PAL.warn;
    } else if (id === 9 || id === 10 || id === 11) {
      if (f.bestPass) dir = norm(sub(f.bestPass.pos, me.pos));
      color = PAL.good;
    }
    if (!dir) continue;
    const reach = 0.06 + p * 0.16;
    const tip = P(add(me.rpos, scale(dir, reach)));
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35 + p * 0.65;
    ctx.lineWidth = 1.5 + p * 3;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    // arrowhead
    const ang = Math.atan2(tip.y - o.y, tip.x - o.x);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(
      tip.x - 5 * Math.cos(ang - 0.4),
      tip.y - 5 * Math.sin(ang - 0.4),
    );
    ctx.lineTo(
      tip.x - 5 * Math.cos(ang + 0.4),
      tip.y - 5 * Math.sin(ang + 0.4),
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawRewardHUD(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  W: number,
) {
  const r = s.reward;
  const lines = [
    `step r ${r.total >= 0 ? "+" : ""}${r.total.toFixed(3)}`,
    `Σ ${s.cumulativeReward.toFixed(2)}`,
  ];
  ctx.font = "600 10px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  lines.forEach((ln, i) => {
    ctx.fillStyle = i === 0 ? (r.total >= 0 ? PAL.good : PAL.bad) : PAL.ink;
    ctx.fillText(ln, W - PAD - 4, PAD + 4 + i * 13);
  });
}

function drawScopeFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
) {
  // subtle vignette + corner ticks for the "instrument" feel
  ctx.strokeStyle = "rgba(61,215,201,0.18)";
  ctx.lineWidth = 1;
  const t = 8;
  const corners: [number, number, number, number][] = [
    [PAD, PAD, 1, 1],
    [W - PAD, PAD, -1, 1],
    [PAD, H - PAD, 1, -1],
    [W - PAD, H - PAD, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * t);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * t, y);
    ctx.stroke();
  }
}
