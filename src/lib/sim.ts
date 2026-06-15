// sim.ts — deterministic football micro-simulation + one-step transition.
//
// The active (controlled) player follows the agent's chosen action; the other 21
// players run a lightweight chase/shape/carry AI. The on-ball or nearest left
// player is auto-selected as "active" each step (GRF-style control switching).
import type {
  SimState,
  Player,
  Ball,
  Side,
  PlayerRole,
  Tweaks,
  RewardWeights,
  Vec2,
  Phase,
  Features,
} from "../types";
import { GameMode } from "../types";
import {
  FIELD,
  goalCenter,
  ownGoalCenter,
  dist,
  norm,
  sub,
  add,
  scale,
  clampToField,
  DIR_VECTORS,
} from "./pitch";
import { rand, chance } from "./prng";
import { computeFeatures } from "./features";
import { evaluatePolicy, selectAction } from "./agents";
import { legalActions } from "./observation";
import { computeReward, emptyEvents, type StepEvents } from "./reward";

// ---- tunable physics constants (normalised units / step) -------------------
const RUN_SPEED = 0.013;
const SPRINT_SPEED = 0.021;
const TEAM_SPEED = 0.011; // off-ball AI a touch slower than a sprinting human
const ACCEL = 0.4; // velocity lerp toward intent
const FRICTION = 0.965; // loose-ball ground friction
const PASS_SHORT = 0.045;
const PASS_LONG = 0.065;
const PASS_HIGH = 0.05;
const SHOT_SPEED = 0.075;
const GRAVITY = 0.012;
const CAPTURE_R = 0.035; // pick up a loose ball within this radius
const TACKLE_R = 0.045;
const DRIBBLE_OFFSET = 0.03;

// ---------------------------------------------------------------------------
// Formation (4-3-3) and team construction
// ---------------------------------------------------------------------------
const HOME_LEFT: { role: PlayerRole; x: number; y: number }[] = [
  { role: "GK", x: -0.92, y: 0 },
  { role: "DEF", x: -0.6, y: -0.27 },
  { role: "DEF", x: -0.62, y: -0.09 },
  { role: "DEF", x: -0.62, y: 0.09 },
  { role: "DEF", x: -0.6, y: 0.27 },
  { role: "MID", x: -0.22, y: -0.2 },
  { role: "MID", x: -0.25, y: 0 },
  { role: "MID", x: -0.22, y: 0.2 },
  { role: "FWD", x: 0.25, y: -0.22 },
  { role: "FWD", x: 0.3, y: 0 },
  { role: "FWD", x: 0.25, y: 0.22 },
];

export function makeTeam(side: Side): Player[] {
  return HOME_LEFT.map((h, i) => {
    const x = side === "left" ? h.x : -h.x;
    const home = { x, y: h.y };
    return {
      id: i,
      side,
      role: h.role,
      pos: { ...home },
      vel: { x: 0, y: 0 },
      home,
      rpos: { ...home },
      stamina: 1,
      tiredFactor: 1,
      yellow: false,
    };
  });
}

export function makeBall(pos: Vec2, owner: Ball["owner"] = null): Ball {
  return {
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    z: 0,
    vz: 0,
    rpos: { ...pos },
    owner,
    flightLock: 0,
  };
}

const ZERO_REWARD = {
  goalScored: 0, goalConceded: 0, progress: 0, successfulPass: 0,
  possession: 0, shotOnTarget: 0, interception: 0, turnover: 0, ownGoal: 0, total: 0,
};

export function makeBaseState(seed: number, stepsLeft = 3000): SimState {
  const left = makeTeam("left");
  const right = makeTeam("right");
  const ball = makeBall({ x: 0, y: 0 }, { side: "left", player: 6 });
  return {
    frame: 0,
    left,
    right,
    ball,
    score: [0, 0],
    stepsLeft,
    gameMode: GameMode.KickOff,
    sticky: new Array<boolean>(10).fill(false),
    activePlayer: 6,
    phase: "attack",
    reward: { ...ZERO_REWARD },
    cumulativeReward: 0,
    rng: { s: (seed >>> 0) || 1 },
    ballTrail: [],
    rewardHistory: [],
    lastAction: 0,
    forcedAction: null,
    lastEvent: null,
  };
}

// ---------------------------------------------------------------------------
// Cloning — render scratch (rpos) carried forward for smooth interpolation.
// ---------------------------------------------------------------------------
function clonePlayer(p: Player): Player {
  return {
    ...p,
    pos: { ...p.pos },
    vel: { ...p.vel },
    home: { ...p.home },
    rpos: { ...p.rpos },
  };
}
export function cloneState(s: SimState): SimState {
  return {
    ...s,
    left: s.left.map(clonePlayer),
    right: s.right.map(clonePlayer),
    ball: {
      ...s.ball,
      pos: { ...s.ball.pos },
      vel: { ...s.ball.vel },
      rpos: { ...s.ball.rpos },
      owner: s.ball.owner ? { ...s.ball.owner } : null,
    },
    score: [s.score[0], s.score[1]],
    sticky: s.sticky.slice(),
    reward: { ...s.reward },
    rng: { s: s.rng.s },
    ballTrail: s.ballTrail.map((p) => ({ ...p })),
    rewardHistory: s.rewardHistory.slice(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function teamOf(s: SimState, side: Side): Player[] {
  return side === "left" ? s.left : s.right;
}
function nearestIdxTo(p: Vec2, team: Player[]): number {
  let idx = 0;
  let best = Infinity;
  for (const pl of team) {
    const d = dist(p, pl.pos);
    if (d < best) { best = d; idx = pl.id; }
  }
  return idx;
}

function moveToward(p: Player, target: Vec2, speed: number) {
  const dir = norm(sub(target, p.pos));
  const desired = scale(dir, speed * p.tiredFactor);
  p.vel.x += (desired.x - p.vel.x) * ACCEL;
  p.vel.y += (desired.y - p.vel.y) * ACCEL;
}

function resetForKickoff(s: SimState, kickoffSide: Side) {
  const L = makeTeam("left");
  const R = makeTeam("right");
  s.left.forEach((p, i) => { p.pos = { ...L[i].home }; p.vel = { x: 0, y: 0 }; });
  s.right.forEach((p, i) => { p.pos = { ...R[i].home }; p.vel = { x: 0, y: 0 }; });
  s.ball.pos = { x: 0, y: 0 };
  s.ball.vel = { x: 0, y: 0 };
  s.ball.z = 0; s.ball.vz = 0;
  s.ball.owner = { side: kickoffSide, player: 6 };
  s.ball.flightLock = 0;
  s.sticky = new Array<boolean>(10).fill(false);
  s.gameMode = GameMode.KickOff;
  s.ballTrail = [];
}

// ---------------------------------------------------------------------------
// One environment step.
// ---------------------------------------------------------------------------
export function stepOnce(prev: SimState, t: Tweaks, w: RewardWeights): SimState {
  const s = cloneState(prev);
  const ev: StepEvents = emptyEvents();
  if (s.gameMode === GameMode.KickOff) s.gameMode = GameMode.Normal;

  // --- GRF-style control switching: control the on-ball / nearest left player.
  if (s.ball.owner?.side === "left") s.activePlayer = s.ball.owner.player;
  else s.activePlayer = nearestIdxTo(s.ball.pos, s.left);

  const me = s.left[s.activePlayer];
  const f = computeFeatures(s);
  const legal = legalActions(f, s);
  const policy = evaluatePolicy(s, f, t, w);

  // Forced action overrides the policy (and bypasses masking so its effect is visible).
  let action: number;
  if (s.forcedAction != null) { action = s.forcedAction; s.forcedAction = null; }
  else action = selectAction(policy, legal, t, s.rng);

  const leftOwnedBefore = s.ball.owner?.side === "left";

  // --- apply the action to the active player + sticky state -----------------
  const setDirSticky = (dirId: number) => {
    if (!t.stickyActionsEnabled) return;
    for (let i = 0; i < 8; i++) s.sticky[i] = i === dirId - 1;
  };
  let intentDir: Vec2 | null = null;

  if (action >= 1 && action <= 8) {
    intentDir = DIR_VECTORS[action - 1];
    setDirSticky(action);
  } else if (action === 13) {
    if (t.stickyActionsEnabled) s.sticky[8] = true;
  } else if (action === 15) {
    if (t.stickyActionsEnabled) s.sticky[8] = false;
  } else if (action === 14) {
    if (t.stickyActionsEnabled) for (let i = 0; i < 8; i++) s.sticky[i] = false;
  } else if (action === 17) {
    if (t.stickyActionsEnabled) s.sticky[9] = true;
  } else if (action === 18) {
    if (t.stickyActionsEnabled) s.sticky[9] = false;
  }

  const sprinting = t.stickyActionsEnabled ? s.sticky[8] : action === 13;
  const speed = sprinting ? SPRINT_SPEED : RUN_SPEED;

  // Continue along a held direction sticky if no fresh movement action.
  if (!intentDir && t.stickyActionsEnabled) {
    const di = s.sticky.slice(0, 8).findIndex(Boolean);
    if (di >= 0) intentDir = DIR_VECTORS[di];
  }

  // --- ball events from the action (pass / shot) ----------------------------
  if (action === 12 && me === s.left[s.activePlayer] && s.ball.owner?.side === "left") {
    // Shot — aim at goal with spread that grows with distance and low stamina.
    const spread = (0.05 + 0.12 * (f.distToGoal / 1.4)) * (1.3 - 0.3 * me.stamina);
    const aimY = (rand(s.rng) - 0.5) * 2 * spread;
    const target = { x: 1.02, y: Math.max(-0.2, Math.min(0.2, aimY)) };
    s.ball.owner = null;
    s.ball.vel = scale(norm(sub(target, s.ball.pos)), SHOT_SPEED);
    s.ball.vz = 0.06;
    s.ball.flightLock = 6;
    ev.shotOnTargetByLeft = Math.abs(aimY) < FIELD.goalHalf * 1.1;
    s.phase = "shoot";
  } else if ((action === 9 || action === 10 || action === 11) && s.ball.owner?.side === "left") {
    // Pass — pick a target teammate.
    let targetIdx = f.bestPass?.player ?? -1;
    if (action === 9) {
      // long: most-forward teammate
      let bx = -Infinity;
      for (const p of s.left) if (p.id !== s.activePlayer && p.pos.x > bx) { bx = p.pos.x; targetIdx = p.id; }
    }
    const tgt = targetIdx >= 0 ? s.left[targetIdx].pos : add(me.pos, { x: 0.2, y: 0 });
    const sp = action === 9 ? PASS_LONG : action === 10 ? PASS_HIGH : PASS_SHORT;
    s.ball.owner = null;
    s.ball.vel = scale(norm(sub(tgt, s.ball.pos)), sp);
    s.ball.vz = action === 10 ? 0.05 : action === 9 ? 0.02 : 0;
    s.ball.flightLock = 5;
    s.phase = "pass";
  }

  // --- integrate the active (controlled) player -----------------------------
  if (intentDir) {
    const desired = scale(intentDir, speed * me.tiredFactor);
    me.vel.x += (desired.x - me.vel.x) * ACCEL;
    me.vel.y += (desired.y - me.vel.y) * ACCEL;
  } else {
    me.vel.x *= 0.6; me.vel.y *= 0.6; // ease to a stop on idle/release
  }
  // stamina dynamics for the controlled player
  if (sprinting && (Math.abs(me.vel.x) + Math.abs(me.vel.y)) > 0.001) {
    me.stamina = Math.max(0, me.stamina - 0.006);
  } else {
    me.stamina = Math.min(1, me.stamina + 0.0025);
  }
  me.tiredFactor = 0.7 + 0.3 * me.stamina;

  // --- off-ball AI for every other player -----------------------------------
  const leftNearBall = nearestIdxTo(s.ball.pos, s.left);
  const rightNearBall = nearestIdxTo(s.ball.pos, s.right);
  const ballX = s.ball.pos.x;
  for (const side of ["left", "right"] as Side[]) {
    const team = teamOf(s, side);
    const owns = s.ball.owner?.side === side;
    const nearBall = side === "left" ? leftNearBall : rightNearBall;
    const atkGoal = goalCenter(side);
    for (const p of team) {
      if (side === "left" && p.id === s.activePlayer) continue; // human-controlled
      if (p.role === "GK") {
        // GK hugs its line, tracks the ball's y a little.
        const gx = ownGoalCenter(side).x * 0.92;
        moveToward(p, { x: gx, y: Math.max(-0.12, Math.min(0.12, s.ball.pos.y * 0.6)) }, TEAM_SPEED * 0.7);
      } else if (s.ball.owner && s.ball.owner.side === side && s.ball.owner.player === p.id) {
        moveToward(p, atkGoal, RUN_SPEED); // carry toward goal
      } else if (!owns && p.id === nearBall) {
        moveToward(p, s.ball.pos, TEAM_SPEED * 1.15); // press the ball
      } else {
        // hold formation, shifted toward the ball's side of the pitch
        const shiftX = (ballX - p.home.x) * (owns ? 0.45 : 0.3);
        const target = { x: p.home.x + shiftX, y: p.home.y + (s.ball.pos.y - p.home.y) * 0.25 };
        moveToward(p, clampToField(target), TEAM_SPEED);
      }
      p.tiredFactor = 0.7 + 0.3 * p.stamina;
    }
  }

  // --- integrate positions --------------------------------------------------
  for (const p of [...s.left, ...s.right]) {
    p.pos = clampToField(add(p.pos, p.vel));
  }

  // --- ball physics ---------------------------------------------------------
  if (s.ball.flightLock > 0) s.ball.flightLock--;
  if (s.ball.owner) {
    // glued to the carrier, nudged forward (dribble)
    const carrier = teamOf(s, s.ball.owner.side)[s.ball.owner.player];
    const facing = norm(carrier.vel.x || carrier.vel.y ? carrier.vel : goalCenter(s.ball.owner.side));
    s.ball.pos = add(carrier.pos, scale(facing, DRIBBLE_OFFSET));
    s.ball.vel = { ...carrier.vel };
    s.ball.z = 0; s.ball.vz = 0;
  } else {
    s.ball.pos = add(s.ball.pos, s.ball.vel);
    s.ball.vel = scale(s.ball.vel, FRICTION);
    s.ball.z = Math.max(0, s.ball.z + s.ball.vz);
    s.ball.vz -= GRAVITY;
    if (s.ball.z <= 0) s.ball.vz = Math.abs(s.ball.vz) < 0.01 ? 0 : -s.ball.vz * 0.4;
  }

  // --- possession changes (capture loose ball / tackle) ---------------------
  if (!s.ball.owner && s.ball.flightLock === 0 && s.ball.z < 0.04) {
    let bestIdxL = nearestIdxTo(s.ball.pos, s.left);
    let bestIdxR = nearestIdxTo(s.ball.pos, s.right);
    const dL = dist(s.ball.pos, s.left[bestIdxL].pos);
    const dR = dist(s.ball.pos, s.right[bestIdxR].pos);
    const winner = dL <= dR ? "left" : "right";
    const wd = Math.min(dL, dR);
    if (wd < CAPTURE_R) {
      const idx = winner === "left" ? bestIdxL : bestIdxR;
      s.ball.owner = { side: winner, player: idx };
      if (leftOwnedBefore && winner === "right") ev.turnoverByLeft = true;
      else if (!leftOwnedBefore && winner === "left") {
        // either a completed left pass or a recovery — treat forward recoveries as pass/interception
        ev.passCompletedByLeft = prev.ball.owner?.side === "left";
        ev.interceptionByLeft = prev.ball.owner?.side === "right";
      }
    }
    void bestIdxL; void bestIdxR;
  } else if (s.ball.owner) {
    // tackling: nearest defender of the other team may steal within tackle range
    const defSide: Side = s.ball.owner.side === "left" ? "right" : "left";
    const defTeam = teamOf(s, defSide);
    const di = nearestIdxTo(s.ball.pos, defTeam);
    const dd = dist(s.ball.pos, defTeam[di].pos);
    if (dd < TACKLE_R) {
      const activeSlide = defSide === "left" && action === 16 && di === s.activePlayer;
      const pSteal = activeSlide ? 0.6 : 0.06 + 0.12 * t.defensivePressure;
      if (chance(s.rng, pSteal)) {
        const stealingLeft = defSide === "left";
        s.ball.owner = { side: defSide, player: di };
        s.ball.flightLock = 2;
        if (stealingLeft) ev.interceptionByLeft = true;
        else ev.turnoverByLeft = true;
      }
    }
  }

  // --- goal detection -------------------------------------------------------
  if (s.ball.pos.x >= FIELD.xMax - 0.005 && Math.abs(s.ball.pos.y) <= FIELD.goalHalf) {
    s.score[0]++; ev.goalFor = "left"; s.lastEvent = "GOAL · left";
    resetForKickoff(s, "right");
  } else if (s.ball.pos.x <= FIELD.xMin + 0.005 && Math.abs(s.ball.pos.y) <= FIELD.goalHalf) {
    s.score[1]++; ev.goalFor = "right"; s.lastEvent = "GOAL · right";
    resetForKickoff(s, "left");
  } else {
    s.lastEvent = null;
  }

  // --- phase label ----------------------------------------------------------
  s.phase = derivePhase(s, action, f);

  // --- trail + bookkeeping --------------------------------------------------
  s.ballTrail.push({ ...s.ball.pos });
  if (s.ballTrail.length > 44) s.ballTrail.shift();

  const reward = computeReward(prev, s, ev, w);
  s.reward = reward;
  s.cumulativeReward += reward.total;
  s.rewardHistory.push(reward.total);
  if (s.rewardHistory.length > 140) s.rewardHistory.shift();

  s.lastAction = action;
  s.stepsLeft = Math.max(0, s.stepsLeft - 1);
  s.frame++;
  return s;
}

function derivePhase(s: SimState, action: number, f: Features): Phase {
  if (f.activeHasBall) {
    if (action === 12) return "shoot";
    if (action === 9 || action === 10 || action === 11) return "pass";
    if (action === 17 || f.dribbleActive) return "dribble";
    return "attack";
  }
  if (action === 16) return "press";
  if (!f.hasPossession) {
    if (s.left[s.activePlayer] && dist(s.left[s.activePlayer].pos, s.ball.pos) < 0.12) return "press";
    return "defend";
  }
  return "idle";
}
