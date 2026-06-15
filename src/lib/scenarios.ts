// scenarios.ts — 10 deterministic preset situations (module 9).
//
// Each preset starts from makeBaseState (a settled 4-3-3) and then overrides the
// handful of positions that define the situation. Everything else — AI, policy,
// rewards — runs identically on top, so a scenario is just an initial condition.
import type { SimState, Side, BallOwner } from "../types";
import { GameMode } from "../types";
import { makeBaseState } from "./sim";
import type { ScenarioDef } from "../types";

function set(s: SimState, side: Side, idx: number, x: number, y: number) {
  const team = side === "left" ? s.left : s.right;
  team[idx].pos = { x, y };
  team[idx].home = { x, y };
  team[idx].rpos = { x, y };
  team[idx].vel = { x: 0, y: 0 };
}

function ball(s: SimState, x: number, y: number, owner: BallOwner) {
  s.ball.pos = { x, y };
  s.ball.rpos = { x, y };
  s.ball.vel = { x: 0, y: 0 };
  s.ball.z = 0;
  s.ball.vz = 0;
  s.ball.owner = owner;
  s.ball.flightLock = 0;
  if (owner) s.activePlayer = owner.side === "left" ? owner.player : s.activePlayer;
}

/** Push the whole right (defending) team back toward their own goal. */
function parkBus(s: SimState) {
  s.right.forEach((p) => {
    if (p.role === "GK") return;
    const x = Math.min(-0.45, p.home.x); // their own half is x<0
    set(s, "right", p.id, x, p.home.y * 0.8);
  });
}
void parkBus; // retained as a scenario-authoring helper

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "kickoff",
    name: "Kickoff (default)",
    description: "Settled 4-3-3 vs 4-3-3 at kickoff. A neutral starting point.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.KickOff;
      ball(s, 0, 0, { side: "left", player: 6 });
      return s;
    },
  },
  {
    id: "oneVone",
    name: "1v1 to goal",
    description:
      "Lone striker through on the keeper with one covering defender. Tests shoot-vs-dribble timing.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "left", 9, 0.55, 0.02); // striker
      set(s, "right", 0, 0.93, 0.0); // GK
      set(s, "right", 3, 0.7, 0.06); // recovering defender
      // tuck the rest away so the duel is clean
      s.right.forEach((p) => {
        if (p.id !== 0 && p.id !== 3) set(s, "right", p.id, -0.5, p.home.y);
      });
      ball(s, 0.55, 0.02, { side: "left", player: 9 });
      return s;
    },
  },
  {
    id: "counter",
    name: "Counterattack",
    description:
      "Possession won deep with three attackers vs two retreating defenders. Tests long-pass release.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "left", 6, -0.25, 0.0); // ball carrier in midfield
      set(s, "left", 8, 0.3, -0.25);
      set(s, "left", 9, 0.35, 0.05);
      set(s, "left", 10, 0.3, 0.25);
      set(s, "right", 1, 0.1, -0.12);
      set(s, "right", 2, 0.12, 0.12);
      ball(s, -0.25, 0.0, { side: "left", player: 6 });
      return s;
    },
  },
  {
    id: "midfield",
    name: "Crowded midfield",
    description:
      "Ball in a congested center with opponents collapsing. Tests short-pass vs dribble under pressure.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "left", 6, -0.02, 0.0);
      set(s, "left", 5, -0.18, -0.14);
      set(s, "left", 7, -0.16, 0.16);
      set(s, "right", 5, 0.06, -0.06);
      set(s, "right", 6, 0.05, 0.08);
      set(s, "right", 7, -0.12, 0.0);
      ball(s, -0.02, 0.0, { side: "left", player: 6 });
      return s;
    },
  },
  {
    id: "wing",
    name: "Wing attack",
    description:
      "Wide overload on the right touchline with a far-post run. Tests high-pass / cross decisions.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "left", 10, 0.55, 0.33); // wide carrier near the touchline
      set(s, "left", 9, 0.62, -0.02); // near-post run
      set(s, "left", 8, 0.5, 0.18); // trailing support
      set(s, "right", 1, 0.7, 0.28);
      set(s, "right", 0, 0.93, 0.0);
      ball(s, 0.55, 0.33, { side: "left", player: 10 });
      return s;
    },
  },
  {
    id: "highpress",
    name: "High-pressure defense",
    description:
      "Right team has the ball deep in our half; we must press and tackle. Tests defensive actions.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "right", 6, -0.45, 0.0); // their carrier in our half
      set(s, "left", 5, -0.38, -0.05); // our nearest presser
      set(s, "left", 6, -0.34, 0.08);
      set(s, "left", 1, -0.55, -0.1);
      ball(s, -0.45, 0.0, { side: "right", player: 6 });
      s.activePlayer = 5;
      return s;
    },
  },
  {
    id: "openshot",
    name: "Open shot",
    description:
      "Striker unmarked at the top of the box with a clean angle. The textbook shoot state.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "left", 9, 0.72, 0.0);
      set(s, "right", 0, 0.95, 0.0);
      s.right.forEach((p) => {
        if (p.id !== 0) set(s, "right", p.id, -0.3, p.home.y);
      });
      ball(s, 0.72, 0.0, { side: "left", player: 9 });
      return s;
    },
  },
  {
    id: "badlane",
    name: "Bad passing lane",
    description:
      "The obvious forward pass is screened by two opponents. Tests lane reading vs forcing it.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "left", 6, 0.1, 0.0); // carrier
      set(s, "left", 9, 0.5, 0.0); // target directly ahead
      set(s, "right", 5, 0.28, -0.03); // two bodies blocking the lane
      set(s, "right", 6, 0.32, 0.04);
      set(s, "left", 8, 0.2, 0.3); // safer wide outlet
      ball(s, 0.1, 0.0, { side: "left", player: 6 });
      return s;
    },
  },
  {
    id: "backpass",
    name: "Goalkeeper back-pass danger",
    description:
      "Our keeper is on the ball with a forward closing down. A loose touch here is an own-goal risk.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "left", 0, -0.9, 0.0); // our GK on the ball
      set(s, "right", 9, -0.72, 0.04); // their forward pressing
      set(s, "left", 2, -0.7, -0.18); // outlet defender
      set(s, "left", 3, -0.7, 0.18);
      ball(s, -0.9, 0.0, { side: "left", player: 0 });
      s.activePlayer = 0;
      return s;
    },
  },
  {
    id: "recovery",
    name: "Possession recovery",
    description:
      "A loose ball in midfield owned by nobody, contested 1v1. Tests reading a 50/50.",
    build: (seed) => {
      const s = makeBaseState(seed);
      s.gameMode = GameMode.Normal;
      set(s, "left", 6, -0.06, -0.02);
      set(s, "right", 6, 0.06, 0.02);
      ball(s, 0.0, 0.0, null); // loose ball
      s.activePlayer = 6;
      return s;
    },
  },
];

export const DEFAULT_SCENARIO = SCENARIOS[0];
