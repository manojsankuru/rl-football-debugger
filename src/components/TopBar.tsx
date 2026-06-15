// TopBar.tsx — identity, scenario + agent selectors, live score/phase readout.
import type { Simulation } from "../hooks/useSimulation";
import type { AgentMode, Phase } from "../types";
import { SCENARIOS } from "../lib/scenarios";
import { Chip } from "./ui";

const AGENTS: { id: AgentMode; label: string }[] = [
  { id: "random", label: "Random" },
  { id: "beginner", label: "Rule · Beginner" },
  { id: "expert", label: "Rule · Expert" },
  { id: "imitation", label: "Imitation" },
  { id: "ppo", label: "PPO (mock)" },
  { id: "hybrid", label: "Hybrid RL+rules" },
];

const PHASE_COLOR: Record<Phase, string> = {
  attack: "var(--signal)",
  pass: "var(--good)",
  shoot: "var(--warn)",
  dribble: "var(--select)",
  defend: "var(--ink-2)",
  press: "var(--away)",
  idle: "var(--ink-3)",
};

export default function TopBar({ sim }: { sim: Simulation }) {
  const s = sim.snapshot;
  const selStyle =
    "h-8 rounded border border-line bg-panel-2 px-2 text-[11px] text-ink outline-none focus:border-signal/60";
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel/80 px-4 py-2.5 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold tracking-tight text-ink">
          RL Football Debugger
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider text-ink-3">
          Scenario
        </label>
        <select
          className={selStyle}
          value={sim.scenarioId}
          onChange={(e) => sim.loadScenario(e.target.value)}
        >
          {SCENARIOS.map((sc) => (
            <option key={sc.id} value={sc.id}>
              {sc.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider text-ink-3">
          Agent
        </label>
        <select
          className={selStyle}
          value={sim.tweaks.agent}
          onChange={(e) =>
            sim.patchTweaks({ agent: e.target.value as AgentMode })
          }
        >
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Chip color="var(--ink)">
          {s.score[0]} : {s.score[1]}
        </Chip>
        <span
          className="num rounded px-2 py-0.5 text-[11px]"
          style={{ color: PHASE_COLOR[s.phase], background: "rgba(255,255,255,0.05)" }}
        >
          {s.phase.toUpperCase()}
        </span>
        <Chip color="var(--ink-2)">f{s.frame}</Chip>
        <Chip color="var(--ink-3)">steps {s.stepsLeft}</Chip>
      </div>
    </header>
  );
}
