// ============================================================================
// types.ts — Domain model for the RL football agent debugger.
//
// Coordinate system follows Google Research Football conventions:
//   x in [-1, 1]  (left goal at x=-1, right goal at x=+1)
//   y in [-0.42, 0.42]
//   The LEFT team is the agent's team and attacks toward +x.
// ============================================================================

export type Side = "left" | "right";

export interface Vec2 {
  x: number;
  y: number;
}

export type PlayerRole = "GK" | "DEF" | "MID" | "FWD";

export interface Player {
  id: number; // index within its own team [0..10]
  side: Side;
  role: PlayerRole;
  pos: Vec2;
  vel: Vec2;
  home: Vec2; // formation anchor; team shape slides around this
  /** Rendered (interpolated) position; sim only mutates pos/vel. */
  rpos: Vec2;
  stamina: number; // 0..1
  tiredFactor: number; // GRF-style fatigue multiplier on speed
  yellow: boolean;
}

export type BallOwner = { side: Side; player: number } | null;

export interface Ball {
  pos: Vec2;
  vel: Vec2;
  z: number; // height (0 = ground); high passes/shots lift it
  vz: number;
  rpos: Vec2; // rendered position
  owner: BallOwner;
  /** Frames a pass/shot is "in flight" and uncatchable by the passer. */
  flightLock: number;
}

// Game modes — matches GRF's 7-way one-hot ordering.
export enum GameMode {
  Normal = 0,
  KickOff = 1,
  GoalKick = 2,
  FreeKick = 3,
  Corner = 4,
  ThrowIn = 5,
  Penalty = 6,
}

export const GAME_MODE_NAMES: Record<GameMode, string> = {
  [GameMode.Normal]: "Normal",
  [GameMode.KickOff]: "KickOff",
  [GameMode.GoalKick]: "GoalKick",
  [GameMode.FreeKick]: "FreeKick",
  [GameMode.Corner]: "Corner",
  [GameMode.ThrowIn]: "ThrowIn",
  [GameMode.Penalty]: "Penalty",
};

// ---------------------------------------------------------------------------
// Sticky actions (10-dim, GRF order). The 8 directions are mutually exclusive
// among themselves; sprint and dribble are independent toggles.
// ---------------------------------------------------------------------------
export const STICKY_NAMES = [
  "left",
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "sprint",
  "dribble",
] as const;
export type StickyVector = boolean[]; // length 10

// ---------------------------------------------------------------------------
// Raw observation (the quantities a GRF "raw" obs exposes).
// ---------------------------------------------------------------------------
export interface Observation {
  ballPos: Vec2;
  ballZ: number;
  ballVel: Vec2;
  ballOwnedTeam: -1 | 0 | 1; // -1 none, 0 left, 1 right
  ballOwnedPlayer: number; // -1 if none
  leftTeam: Vec2[]; // 11 positions
  rightTeam: Vec2[];
  leftTeamVel: Vec2[];
  rightTeamVel: Vec2[];
  activePlayer: number; // index into leftTeam
  stickyActions: StickyVector;
  score: [number, number]; // [left, right]
  stepsLeft: number;
  gameMode: GameMode;
}

// ---------------------------------------------------------------------------
// Reward shaping weights (module 5). All editable live.
// ---------------------------------------------------------------------------
export interface RewardWeights {
  goalScored: number;
  goalConceded: number;
  progress: number; // checkpoint-style progress toward opponent goal
  successfulPass: number;
  possession: number; // per-step possession bonus
  shotOnTarget: number;
  interception: number;
  turnover: number; // penalty (stored positive, applied negative)
  ownGoal: number; // penalty
}

export interface RewardBreakdown {
  goalScored: number;
  goalConceded: number;
  progress: number;
  successfulPass: number;
  possession: number;
  shotOnTarget: number;
  interception: number;
  turnover: number;
  ownGoal: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Agent + policy
// ---------------------------------------------------------------------------
export type AgentMode =
  | "random"
  | "beginner"
  | "expert"
  | "imitation"
  | "ppo"
  | "hybrid";

export interface PolicyOutput {
  logits: number[]; // length 19, pre-softmax (after masking → -Inf for illegal)
  probs: number[]; // length 19, sums to 1
  /** Per-action advantage estimate, or null if the agent type has no critic. */
  advantage: number[] | null;
  value: number; // V(s)
  /** Indices of top-3 actions by probability. */
  top3: number[];
  /** Per-action one-line rationale grounded in features. */
  rationale: string[];
  chosen: number; // sampled / argmax action id actually taken
}

// ---------------------------------------------------------------------------
// Tweakable knobs (module 7)
// ---------------------------------------------------------------------------
export interface Tweaks {
  agent: AgentMode;
  temperature: number; // softmax temperature
  epsilon: number; // epsilon-greedy exploration
  passAggressiveness: number; // 0..1
  shotAggressiveness: number;
  dribbleAggressiveness: number;
  defensivePressure: number;
  sprintTendency: number;
  riskTolerance: number;
  possessionPreference: number;
  actionMasking: boolean;
  stickyActionsEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Educational overlays (module 8)
// ---------------------------------------------------------------------------
export interface Overlays {
  passingLanes: boolean;
  shootingCone: boolean;
  pressureRadius: boolean;
  nearestLinks: boolean;
  ballTrajectory: boolean;
  fieldOfView: boolean;
  valueHeatmap: boolean;
  actionArrows: boolean;
  rewardExplain: boolean;
}

// ---------------------------------------------------------------------------
// Derived tactical features (shared by policy, reward, overlays)
// ---------------------------------------------------------------------------
export interface PassOption {
  player: number; // teammate index
  pos: Vec2;
  laneOpenness: number; // 0..1, min opponent distance to the pass segment
  forwardGain: number; // how much closer to goal vs current ball carrier
  distance: number;
  score: number; // combined desirability
}

export interface Features {
  hasPossession: boolean; // left team owns ball
  activeHasBall: boolean; // the controlled player owns ball
  distToGoal: number; // active player → opponent goal center
  shootingAngle: number; // radians subtended by the goal mouth
  shotClear: number; // 0..1 path-to-goal openness
  attackingThird: boolean;
  pressure: number; // 0..1 opponent pressure on the carrier
  nearestOpponent: { idx: number; dist: number };
  nearestTeammate: { idx: number; dist: number };
  bestPass: PassOption | null;
  forwardSpace: number; // 0..1 clear room directly ahead toward goal
  sprintActive: boolean;
  dribbleActive: boolean;
  stamina: number;
  // Heading the agent "wants" given the phase of play (unit vector).
  desiredHeading: Vec2;
}

// ---------------------------------------------------------------------------
// Full simulation state
// ---------------------------------------------------------------------------
export type Phase =
  | "attack"
  | "defend"
  | "pass"
  | "shoot"
  | "dribble"
  | "press"
  | "idle";

export interface SimState {
  frame: number;
  left: Player[];
  right: Player[];
  ball: Ball;
  score: [number, number];
  stepsLeft: number;
  gameMode: GameMode;
  sticky: StickyVector;
  activePlayer: number; // index into `left`
  phase: Phase;
  reward: RewardBreakdown; // immediate (last step)
  cumulativeReward: number;
  rng: { s: number }; // mutable PRNG state for determinism
  /** Trail of recent ball positions for the trajectory overlay. */
  ballTrail: Vec2[];
  /** History for the reward sparkline. */
  rewardHistory: number[];
  /** The action the agent took on the previous step (for the panel). */
  lastAction: number;
  /** Set when the user forces an action on the next step. */
  forcedAction: number | null;
  lastEvent: string | null;
}

export interface ScenarioDef {
  id: string;
  name: string;
  description: string;
  build: (seed: number) => SimState;
}
