// observation.ts — turn sim state into the representations a GRF agent sees,
// and compute the discrete action mask (legal / useful).
import type { SimState, Observation, Features, Player } from "../types";
import { dist } from "./pitch";
import { N_ACTIONS } from "./actions";

export function buildObservation(state: SimState): Observation {
  const owner = state.ball.owner;
  const ownedTeam: -1 | 0 | 1 = !owner ? -1 : owner.side === "left" ? 0 : 1;
  const pos = (ps: Player[]) => ps.map((p) => ({ x: p.pos.x, y: p.pos.y }));
  const vel = (ps: Player[]) => ps.map((p) => ({ x: p.vel.x, y: p.vel.y }));
  return {
    ballPos: { ...state.ball.pos },
    ballZ: state.ball.z,
    ballVel: { ...state.ball.vel },
    ballOwnedTeam: ownedTeam,
    ballOwnedPlayer: owner ? owner.player : -1,
    leftTeam: pos(state.left),
    rightTeam: pos(state.right),
    leftTeamVel: vel(state.left),
    rightTeamVel: vel(state.right),
    activePlayer: state.activePlayer,
    stickyActions: state.sticky.slice(),
    score: [state.score[0], state.score[1]],
    stepsLeft: state.stepsLeft,
    gameMode: state.gameMode,
  };
}

// ---------------------------------------------------------------------------
// Action legality mask (used by action_masking) + "useful right now" hint.
// ---------------------------------------------------------------------------
export function legalActions(f: Features, state: SimState): boolean[] {
  const m = new Array<boolean>(N_ACTIONS).fill(false);
  const sticky = state.sticky;
  const dirSticky = sticky.slice(0, 8).some(Boolean);
  const ballDist = dist(state.left[state.activePlayer].pos, state.ball.pos);

  m[0] = true; // idle
  for (let i = 1; i <= 8; i++) m[i] = true; // movement always legal
  m[9] = f.activeHasBall; // long pass
  m[10] = f.activeHasBall; // high pass
  m[11] = f.activeHasBall; // short pass
  m[12] = f.activeHasBall; // shot
  m[13] = !f.sprintActive; // sprint
  m[14] = dirSticky; // release direction
  m[15] = f.sprintActive; // release sprint
  m[16] = !f.activeHasBall && (f.nearestOpponent.dist < 0.14 || ballDist < 0.12); // slide
  m[17] = f.activeHasBall && !f.dribbleActive; // dribble
  m[18] = f.dribbleActive; // release dribble
  return m;
}

/** Heuristic "this action accomplishes something meaningful in the current state". */
export function usefulActions(f: Features, legal: boolean[]): boolean[] {
  const u = new Array<boolean>(N_ACTIONS).fill(false);
  // Movement toward the desired heading is useful.
  for (let i = 1; i <= 8; i++) u[i] = legal[i];
  u[9] = legal[9] && !!f.bestPass && f.bestPass.distance > 0.4;
  u[10] = legal[10] && f.pressure > 0.4 && !!f.bestPass;
  u[11] = legal[11] && !!f.bestPass && f.bestPass.laneOpenness > 0.4;
  u[12] = legal[12] && f.attackingThird && f.shootingAngle > 0.25;
  u[13] = legal[13] && (f.forwardSpace > 0.5 || !f.hasPossession) && f.stamina > 0.25;
  u[15] = legal[15] && f.stamina < 0.3;
  u[16] = legal[16] && f.pressure > 0.3;
  u[17] = legal[17] && f.pressure > 0.45;
  u[18] = legal[18] && f.pressure < 0.2;
  u[14] = legal[14] && f.activeHasBall && f.pressure > 0.6;
  u[0] = !f.hasPossession && f.nearestTeammate.dist < 0.1; // hold shape
  return u;
}

// ---------------------------------------------------------------------------
// Simple115v2 — 115-float fixed vector (GRF layout).
//   [0..21]   left team (x,y) ×11
//   [22..43]  left team direction (x,y) ×11
//   [44..65]  right team (x,y) ×11
//   [66..87]  right team direction (x,y) ×11
//   [88..90]  ball (x,y,z)
//   [91..93]  ball direction (x,y,z)
//   [94..96]  ball ownership one-hot (none, left, right)
//   [97..107] active player one-hot ×11
//   [108..114] game mode one-hot ×7
// ---------------------------------------------------------------------------
export function buildSimple115(obs: Observation): number[] {
  const out: number[] = [];
  for (const p of obs.leftTeam) out.push(p.x, p.y);
  for (const d of obs.leftTeamVel) out.push(d.x, d.y);
  for (const p of obs.rightTeam) out.push(p.x, p.y);
  for (const d of obs.rightTeamVel) out.push(d.x, d.y);
  out.push(obs.ballPos.x, obs.ballPos.y, obs.ballZ);
  out.push(obs.ballVel.x, obs.ballVel.y, 0);
  out.push(
    obs.ballOwnedTeam === -1 ? 1 : 0,
    obs.ballOwnedTeam === 0 ? 1 : 0,
    obs.ballOwnedTeam === 1 ? 1 : 0,
  );
  for (let i = 0; i < 11; i++) out.push(i === obs.activePlayer ? 1 : 0);
  for (let i = 0; i < 7; i++) out.push(i === (obs.gameMode as number) ? 1 : 0);
  return out; // length 115
}

export const SIMPLE115_SECTIONS: { label: string; start: number; len: number }[] = [
  { label: "left positions (x,y)×11", start: 0, len: 22 },
  { label: "left directions (x,y)×11", start: 22, len: 22 },
  { label: "right positions (x,y)×11", start: 44, len: 22 },
  { label: "right directions (x,y)×11", start: 66, len: 22 },
  { label: "ball (x,y,z)", start: 88, len: 3 },
  { label: "ball direction (x,y,z)", start: 91, len: 3 },
  { label: "ball owned (none,L,R)", start: 94, len: 3 },
  { label: "active one-hot ×11", start: 97, len: 11 },
  { label: "game mode one-hot ×7", start: 108, len: 7 },
];

// ---------------------------------------------------------------------------
// SMM — Super Mini Map (4 binary channels on a coarse grid).
// ---------------------------------------------------------------------------
export interface SMM {
  width: number;
  height: number;
  channels: { left: number[]; right: number[]; ball: number[]; active: number[] };
}

export function buildSMM(obs: Observation, width = 48, height = 32): SMM {
  const cell = (px: number, py: number) => {
    const u = (px + 1) / 2; // x in [-1,1] → [0,1]
    const t = (py + 0.42) / 0.84; // y in [-0.42,0.42] → [0,1]
    const c = Math.max(0, Math.min(width - 1, Math.round(u * (width - 1))));
    const r = Math.max(0, Math.min(height - 1, Math.round(t * (height - 1))));
    return r * width + c;
  };
  const blank = () => new Array<number>(width * height).fill(0);
  const left = blank();
  const right = blank();
  const ball = blank();
  const active = blank();
  obs.leftTeam.forEach((p) => (left[cell(p.x, p.y)] = 1));
  obs.rightTeam.forEach((p) => (right[cell(p.x, p.y)] = 1));
  ball[cell(obs.ballPos.x, obs.ballPos.y)] = 1;
  const a = obs.leftTeam[obs.activePlayer];
  if (a) active[cell(a.x, a.y)] = 1;
  return { width, height, channels: { left, right, ball, active } };
}
