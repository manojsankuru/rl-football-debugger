// agents.ts — policy logic for the six agent modes.
//
// Pipeline:  features ─► per-action logits (agent-specific) ─► action mask
//            ─► softmax(temperature) ─► probs ;  argmax = displayed choice.
// A reward-coupling term mixes the (editable) reward weights into the logits so
// that changing reward shaping visibly changes the agent's action preference.
import type {
  SimState,
  Features,
  Tweaks,
  RewardWeights,
  PolicyOutput,
  AgentMode,
} from "../types";
import { ACTIONS, N_ACTIONS } from "./actions";
import { DIR_VECTORS, dot } from "./pitch";
import { legalActions } from "./observation";
import { stateValue } from "./features";
import { rand } from "./prng";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const REWARD_COUPLING = 1.6;

// Agents with a value/critic head expose advantage estimates; pure heuristics don't.
const HAS_CRITIC: Record<AgentMode, boolean> = {
  random: false,
  beginner: false,
  expert: false,
  imitation: true,
  ppo: true,
  hybrid: true,
};

// A fixed pseudo-"learned" bias vector that gives the PPO mock agent some
// idiosyncratic quirks (deterministic, so behaviour is reproducible).
const PPO_BIAS = [
  -0.3, 0.05, 0.0, 0.1, 0.2, 0.35, 0.1, 0.0, // idle + 8 moves (slight +x lean)
  0.15, 0.1, 0.45, 0.55, 0.25, -0.1, 0.05, 0.1, 0.4, -0.05, // pass/shot/tempo
];

/** Expected immediate shaped reward of each action (couples weights → policy). */
export function expectedRewardVector(
  f: Features,
  w: RewardWeights,
): number[] {
  const r = new Array<number>(N_ACTIONS).fill(0);
  const angleN = clamp01(f.shootingAngle / 0.6);
  const distN = clamp01(f.distToGoal / 0.8);
  const pShot = clamp01(angleN * f.shotClear * (1 - distN));
  const goalProb = pShot * 0.55;

  // Shot
  r[12] = w.shotOnTarget * pShot * 0.3 + w.goalScored * goalProb - w.turnover * (1 - pShot) * 0.18;

  // Passes (use best available lane/target)
  const open = f.bestPass?.laneOpenness ?? 0;
  const fwd = f.bestPass?.forwardGain ?? 0;
  const passBase = (succ: number) =>
    w.successfulPass * succ * 0.3 +
    w.possession * succ * 0.2 +
    w.progress * fwd * 0.3 -
    w.turnover * (1 - succ) * 0.22;
  r[11] = f.bestPass ? passBase(clamp01(open * 1.0)) : 0; // short — needs lane
  r[9] = f.bestPass ? passBase(clamp01(open * 0.7)) + w.progress * fwd * 0.15 : 0; // long — more progress, riskier
  r[10] = f.bestPass ? passBase(clamp01(open * 0.6 + f.pressure * 0.3)) : 0; // high — beats pressure

  // Forward movement with the ball earns progress.
  for (let i = 1; i <= 8; i++) {
    const align = dot(DIR_VECTORS[i - 1], { x: 1, y: 0 }); // +x = toward goal
    if (f.activeHasBall) r[i] = w.progress * Math.max(0, align) * 0.18 + w.possession * 0.05;
  }

  // Defensive recovery when out of possession.
  if (!f.hasPossession) {
    const near = clamp01(1 - f.nearestOpponent.dist / 0.2);
    r[16] = w.interception * near * 0.25; // slide
    for (let i = 1; i <= 8; i++) r[i] += w.interception * 0.05; // close down
  }
  return r;
}

/** Well-tuned "expert" base preferences over the 19 actions. */
function baseHeuristicLogits(f: Features, t: Tweaks, exp: number[]): number[] {
  const L = new Array<number>(N_ACTIONS).fill(0);
  const angleN = clamp01(f.shootingAngle / 0.6);
  const distN = clamp01(f.distToGoal / 0.8);

  // Movement: align with the desired heading.
  for (let i = 1; i <= 8; i++) {
    L[i] = 1.7 * dot(DIR_VECTORS[i - 1], f.desiredHeading);
  }

  if (f.activeHasBall) {
    const open = f.bestPass?.laneOpenness ?? 0;
    const fwd = f.bestPass?.forwardGain ?? 0;
    const d = f.bestPass?.distance ?? 1;
    const near = clamp01(1 - d / 0.6);
    const far = clamp01(d / 0.5);
    // Passing
    L[11] = t.passAggressiveness * (1.3 * open + 0.5 * fwd) * (0.4 + near) - 0.2; // short
    L[9] = t.passAggressiveness * (0.8 * open + 0.9 * fwd) * (0.3 + far) - 0.4; // long
    L[10] = t.passAggressiveness * (0.7 * open + 0.6 * fwd + 1.0 * f.pressure) - 0.4; // high
    // Shooting
    L[12] =
      t.shotAggressiveness * (2.0 * angleN + 1.2 * f.shotClear - 1.0 * distN) +
      (f.attackingThird ? 0.6 : -1.6);
    // Dribble / shield under pressure
    L[17] = t.dribbleAggressiveness * (0.6 + 1.4 * f.pressure);
    L[14] = f.pressure > 0.6 ? -0.3 : -1.2;
    // Possession preference biases toward keeping the ball.
    L[11] += t.possessionPreference * 0.4;
    L[17] += t.possessionPreference * 0.3;
    L[12] -= t.possessionPreference * 0.3;
    L[9] -= t.possessionPreference * 0.3;
  } else {
    // Out of possession: press / tackle.
    const closeOpp = clamp01(1 - f.nearestOpponent.dist / 0.14);
    L[16] = t.defensivePressure * (0.8 + 1.2 * t.riskTolerance) * closeOpp - 0.3; // slide
    L[0] = f.nearestTeammate.dist < 0.1 ? 0.3 : -0.4; // hold shape when covered
  }

  // Sprint / stamina management (both phases).
  const staminaGate = clamp01(f.stamina * 2);
  L[13] = t.sprintTendency * (0.8 + 0.7 * f.forwardSpace) * staminaGate + (!f.hasPossession ? 0.4 : 0);
  L[15] = f.sprintActive ? 1.5 * clamp01((0.35 - f.stamina) / 0.35) : 0;
  L[18] = f.dribbleActive ? (f.pressure < 0.2 ? 1.0 : -0.3) : 0;
  if (L[0] === 0) L[0] = -0.5; // idle baseline

  // Couple reward weights into the policy.
  for (let i = 0; i < N_ACTIONS; i++) L[i] += REWARD_COUPLING * exp[i];
  return L;
}

function agentLogits(agent: AgentMode, f: Features, t: Tweaks, exp: number[]): number[] {
  const base = baseHeuristicLogits(f, t, exp);
  switch (agent) {
    case "random":
      return new Array<number>(N_ACTIONS).fill(0);
    case "expert":
      return base;
    case "beginner": {
      // Trigger-happy and lane-blind: overrates shooting, ignores pass safety.
      const b = base.slice();
      b[12] += 1.0; // shoots too early
      if ((f.bestPass?.laneOpenness ?? 0) < 0.5) {
        b[11] += 0.6; // passes into traffic anyway
        b[9] += 0.4;
      }
      b[17] -= 0.4; // rarely shields
      return b;
    }
    case "imitation": {
      // Human-like: favours short passes, ball retention, close control.
      const b = base.slice();
      b[11] += 0.5;
      b[17] += 0.3;
      b[9] -= 0.3;
      b[12] -= 0.2;
      return b.map((x) => x * 1.1);
    }
    case "ppo": {
      // Sharper distribution + idiosyncratic learned biases.
      return base.map((x, i) => x * 1.2 + PPO_BIAS[i]);
    }
    case "hybrid": {
      // 50/50 blend of rule-based and PPO-mock, with rules dominating masking.
      const ppo = base.map((x, i) => x * 1.2 + PPO_BIAS[i]);
      return base.map((x, i) => 0.5 * x + 0.5 * ppo[i]);
    }
  }
}

function softmax(logits: number[], temperature: number): number[] {
  const T = Math.max(0.05, temperature);
  let max = -Infinity;
  for (const l of logits) if (l > max && isFinite(l)) max = l;
  const exps = logits.map((l) => (isFinite(l) ? Math.exp((l - max) / T) : 0));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function rationaleFor(id: number, f: Features): string {
  const a = ACTIONS[id];
  switch (a.category) {
    case "shoot":
      return `angle ${(f.shootingAngle * 57.3).toFixed(0)}°, clear ${(f.shotClear * 100).toFixed(0)}%, dist ${f.distToGoal.toFixed(2)}`;
    case "pass":
      return f.bestPass
        ? `lane ${(f.bestPass.laneOpenness * 100).toFixed(0)}% to #${f.bestPass.player}, +x gain ${(f.bestPass.forwardGain * 100).toFixed(0)}%`
        : "no open teammate";
    case "move":
      return `heading align ${(dot(DIR_VECTORS[id - 1], f.desiredHeading) * 100).toFixed(0)}%`;
    case "tempo":
      if (id === 13) return `space ${(f.forwardSpace * 100).toFixed(0)}%, stamina ${(f.stamina * 100).toFixed(0)}%`;
      if (id === 16) return `nearest opp ${f.nearestOpponent.dist.toFixed(2)}, pressure ${(f.pressure * 100).toFixed(0)}%`;
      return `pressure ${(f.pressure * 100).toFixed(0)}%`;
    case "release":
      if (id === 15) return `stamina ${(f.stamina * 100).toFixed(0)}%`;
      return "clear sticky state";
    default:
      return f.hasPossession ? "hold shape / keep possession" : "off the ball";
  }
}

/**
 * PURE policy evaluation (no RNG, safe to call every render). Returns everything
 * except `chosen`, which is filled with the argmax for display. Sampling for the
 * actually-executed action happens separately in the sim step.
 */
export function evaluatePolicy(
  state: SimState,
  f: Features,
  t: Tweaks,
  w: RewardWeights,
): PolicyOutput {
  const exp = expectedRewardVector(f, w);
  const raw = agentLogits(t.agent, f, t, exp);
  const legal = legalActions(f, state);

  // Apply action mask (→ -Inf) if enabled; hybrid always masks (rule safety).
  const masked = raw.slice();
  if (t.actionMasking || t.agent === "hybrid") {
    for (let i = 0; i < N_ACTIONS; i++) if (!legal[i]) masked[i] = -Infinity;
  }

  const probs = softmax(masked, t.temperature);
  const value = stateValue(state, f);

  let advantage: number[] | null = null;
  if (HAS_CRITIC[t.agent]) {
    const meanL = masked
      .filter((x) => isFinite(x))
      .reduce((a, b, _i, arr) => a + b / arr.length, 0);
    advantage = masked.map((l, i) =>
      isFinite(l) ? 0.6 * exp[i] + 0.25 * (l - meanL) : -1,
    );
  }

  const order = probs
    .map((p, i) => [p, i] as [number, number])
    .sort((a, b) => b[0] - a[0]);
  const top3 = order.slice(0, 3).map(([, i]) => i);
  const chosen = order[0][1];

  const rationale = ACTIONS.map((a) => rationaleFor(a.id, f));
  return { logits: masked, probs, advantage, value, top3, rationale, chosen };
}

/** Sample the action to actually execute (uses & advances the sim PRNG). */
export function selectAction(
  policy: PolicyOutput,
  legal: boolean[],
  t: Tweaks,
  rng: { s: number },
): number {
  // epsilon-greedy exploration over legal actions.
  const r1 = rand(rng);
  if (r1 < t.epsilon) {
    const legalIds = legal.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    return legalIds[Math.floor(rand(rng) * legalIds.length)] ?? 0;
  }
  // Sample from the (already temperature-shaped) policy distribution.
  const u = rand(rng);
  let acc = 0;
  for (let i = 0; i < policy.probs.length; i++) {
    acc += policy.probs[i];
    if (u <= acc) return i;
  }
  return policy.chosen;
}
