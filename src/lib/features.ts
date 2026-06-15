// features.ts — derive tactical features from raw sim state. These features are
// the single source of truth used by (a) the agent policies, (b) reward shaping,
// and (c) the educational overlays, so what the panels explain is exactly what
// drives behaviour.
import type { SimState, Features, PassOption, Vec2, Player } from "../types";
import {
  goalCenter,
  ownGoalCenter,
  dist,
  norm,
  sub,
  add,
  scale,
  pointToSegment,
  FIELD,
} from "./pitch";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Angular width (radians) of the goal mouth as seen from `from`. */
export function shootingAngle(from: Vec2, attackGoalX: number): number {
  const top = { x: attackGoalX, y: -FIELD.goalHalf };
  const bot = { x: attackGoalX, y: FIELD.goalHalf };
  const a = norm(sub(top, from));
  const b = norm(sub(bot, from));
  const cos = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return Math.acos(cos);
}

/** Openness of the segment a→b w.r.t. a set of defenders (0 blocked … 1 clear). */
export function laneOpenness(a: Vec2, b: Vec2, defenders: Player[], tol = 0.12): number {
  let min = Infinity;
  for (const d of defenders) {
    const dd = pointToSegment(d.pos, a, b);
    if (dd < min) min = dd;
  }
  return clamp01(min / tol);
}

function nearest(from: Vec2, players: Player[], exclude = -1) {
  let idx = -1;
  let best = Infinity;
  for (const p of players) {
    if (p.id === exclude) continue;
    const d = dist(from, p.pos);
    if (d < best) {
      best = d;
      idx = p.id;
    }
  }
  return { idx, dist: best === Infinity ? 1 : best };
}

/**
 * Heuristic "how good is it for the LEFT team to hold the ball at `p`".
 * Used for the value heatmap and as the spatial part of V(s).
 * Range roughly [-1, 1].
 */
export function pitchValue(state: SimState, p: Vec2): number {
  const oppGoal = goalCenter("left"); // {x:1,y:0}
  const own = ownGoalCenter("left");
  // Field progression: -1 at own goal → +1 at opponent goal.
  const progress = p.x; // x already in [-1,1]
  // Goal proximity bonus (sharp near the opponent goal, weighted by angle).
  const dGoal = dist(p, oppGoal);
  const ang = shootingAngle(p, 1);
  const threat = clamp01((0.45 - dGoal) / 0.45) * clamp01(ang / 0.6);
  // Penalty for opponents crowding the spot.
  let press = 0;
  for (const o of state.right) press += Math.max(0, 0.18 - dist(p, o.pos)) / 0.18;
  press = Math.min(1, press * 0.5);
  // Danger near own goal.
  const danger = clamp01((0.35 - dist(p, own)) / 0.35) * 0.4;
  return Math.max(-1, Math.min(1, 0.55 * progress + 0.6 * threat - 0.5 * press - danger));
}

export function computeFeatures(state: SimState): Features {
  const me = state.left[state.activePlayer];
  const oppGoal = goalCenter("left");
  const owner = state.ball.owner;
  const hasPossession = owner?.side === "left";
  const activeHasBall = hasPossession && owner!.player === state.activePlayer;

  const distToGoal = dist(me.pos, oppGoal);
  const angle = shootingAngle(me.pos, 1);
  const shotClear = laneOpenness(me.pos, oppGoal, state.right, 0.14);
  const attackingThird = me.pos.x > 0.33;

  // Pressure on the ball-carrier (or on the active player when defending).
  const carrier =
    hasPossession && owner!.player !== state.activePlayer
      ? state.left[owner!.player]
      : me;
  const nearOppToCarrier = nearest(carrier.pos, state.right);
  const pressure = clamp01(1 - nearOppToCarrier.dist / 0.18);

  const nearestOpponent = nearest(me.pos, state.right);
  const nearestTeammate = nearest(me.pos, state.left, state.activePlayer);

  // Evaluate every passable teammate.
  let bestPass: PassOption | null = null;
  for (const t of state.left) {
    if (t.id === state.activePlayer) continue;
    const open = laneOpenness(me.pos, t.pos, state.right, 0.1);
    const forwardGain = clamp01((t.pos.x - me.pos.x + 0.2) / 0.6);
    const d = dist(me.pos, t.pos);
    // Desirability: open lane + progress, slight penalty for very long/backward.
    const score =
      0.5 * open + 0.4 * forwardGain - 0.15 * clamp01(d / 1.2) + (t.role === "FWD" ? 0.05 : 0);
    if (!bestPass || score > bestPass.score) {
      bestPass = { player: t.id, pos: t.pos, laneOpenness: open, forwardGain, distance: d, score };
    }
  }

  // Heading the controlled player "wants" this step.
  let desiredHeading: Vec2;
  if (activeHasBall) {
    // Toward goal, nudged away from the nearest opponent.
    const toGoal = norm(sub(oppGoal, me.pos));
    const opp = state.right[nearestOpponent.idx] ?? me;
    const away = norm(sub(me.pos, opp.pos));
    desiredHeading = norm(add(scale(toGoal, 1), scale(away, 0.35 * pressure)));
  } else if (hasPossession) {
    desiredHeading = norm(sub(oppGoal, me.pos)); // make a supporting run upfield
  } else {
    desiredHeading = norm(sub(state.ball.pos, me.pos)); // chase / intercept
  }

  // Clear room directly ahead toward goal.
  const probe = add(me.pos, scale(desiredHeading, 0.18));
  const fwd = nearest(probe, state.right);
  const forwardSpace = clamp01(fwd.dist / 0.16);

  return {
    hasPossession,
    activeHasBall,
    distToGoal,
    shootingAngle: angle,
    shotClear,
    attackingThird,
    pressure,
    nearestOpponent,
    nearestTeammate,
    bestPass,
    forwardSpace,
    sprintActive: state.sticky[8],
    dribbleActive: state.sticky[9],
    stamina: me.stamina,
    desiredHeading,
  };
}

/** Critic estimate V(s) for the left team, in [-1, 1]. */
export function stateValue(state: SimState, f: Features): number {
  const me = state.left[state.activePlayer];
  const base = pitchValue(state, state.ball.pos);
  const possBonus = f.hasPossession ? 0.18 : -0.12;
  const carrierVal = f.hasPossession ? 0.15 * pitchValue(state, me.pos) : 0;
  const pressPenalty = f.hasPossession ? -0.15 * f.pressure : 0;
  return Math.max(-1, Math.min(1, base + possBonus + carrierVal + pressPenalty));
}
