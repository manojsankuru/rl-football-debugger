// reward.ts — shaped reward for the LEFT (agent) team.
// SCORING (+goal/−concede) plus optional shaping components, all weighted by the
// live-editable RewardWeights. Returns a per-component breakdown for the panel.
import type { SimState, RewardWeights, RewardBreakdown } from "../types";

export interface StepEvents {
  goalFor: "left" | "right" | null;
  ownGoalByLeft: boolean;
  passCompletedByLeft: boolean;
  shotOnTargetByLeft: boolean;
  interceptionByLeft: boolean; // left took the ball off right
  turnoverByLeft: boolean; // left lost the ball to right
}

export function emptyEvents(): StepEvents {
  return {
    goalFor: null,
    ownGoalByLeft: false,
    passCompletedByLeft: false,
    shotOnTargetByLeft: false,
    interceptionByLeft: false,
    turnoverByLeft: false,
  };
}

export function computeReward(
  prev: SimState,
  next: SimState,
  ev: StepEvents,
  w: RewardWeights,
): RewardBreakdown {
  const leftHad = prev.ball.owner?.side === "left";
  const leftHas = next.ball.owner?.side === "left";

  // Checkpoint-style progress: forward movement of the ball while we hold it.
  const progressDelta = leftHas ? Math.max(0, next.ball.pos.x - prev.ball.pos.x) : 0;

  const b: RewardBreakdown = {
    goalScored: ev.goalFor === "left" ? w.goalScored : 0,
    goalConceded: ev.goalFor === "right" ? -w.goalConceded : 0,
    progress: w.progress * progressDelta * 4, // scale to a useful magnitude
    successfulPass: ev.passCompletedByLeft ? w.successfulPass : 0,
    possession: leftHas ? w.possession * 0.02 : 0,
    shotOnTarget: ev.shotOnTargetByLeft ? w.shotOnTarget : 0,
    interception: ev.interceptionByLeft ? w.interception : 0,
    turnover: ev.turnoverByLeft ? -w.turnover : 0,
    ownGoal: ev.ownGoalByLeft ? -w.ownGoal : 0,
    total: 0,
  };
  void leftHad;
  b.total =
    b.goalScored +
    b.goalConceded +
    b.progress +
    b.successfulPass +
    b.possession +
    b.shotOnTarget +
    b.interception +
    b.turnover +
    b.ownGoal;
  return b;
}

export const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
  goalScored: 1.0,
  goalConceded: 1.0,
  progress: 1.0,
  successfulPass: 0.1,
  possession: 0.05,
  shotOnTarget: 0.3,
  interception: 0.2,
  turnover: 0.2,
  ownGoal: 1.0,
};

export const REWARD_FIELDS: { key: keyof RewardWeights; label: string; sign: 1 | -1 }[] = [
  { key: "goalScored", label: "Goal scored", sign: 1 },
  { key: "goalConceded", label: "Goal conceded", sign: -1 },
  { key: "progress", label: "Progress to goal", sign: 1 },
  { key: "successfulPass", label: "Successful pass", sign: 1 },
  { key: "possession", label: "Maintain possession", sign: 1 },
  { key: "shotOnTarget", label: "Shot on target", sign: 1 },
  { key: "interception", label: "Interception", sign: 1 },
  { key: "turnover", label: "Bad turnover", sign: -1 },
  { key: "ownGoal", label: "Own goal", sign: -1 },
];
