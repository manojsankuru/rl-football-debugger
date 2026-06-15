// TransportControls.tsx — play / pause / step / reset / speed (module 1).
import { Play, Pause, Step, Reset } from "./Icons";
import type { Simulation } from "../hooks/useSimulation";

const SPEEDS = [0.5, 1, 2, 4];

export default function TransportControls({ sim }: { sim: Simulation }) {
  const btn =
    "flex h-8 items-center justify-center gap-1.5 rounded border border-line bg-panel-2 px-3 text-[11px] text-ink transition-colors hover:border-line-2 hover:bg-white/5 active:translate-y-px";
  return (
    <div className="flex items-center gap-2">
      <button className={btn} onClick={sim.togglePlay} style={{ minWidth: 78 }}>
        {sim.playing ? <Pause size={13} /> : <Play size={13} />}
        {sim.playing ? "Pause" : "Play"}
      </button>
      <button className={btn} onClick={sim.step} disabled={sim.playing}
        style={{ opacity: sim.playing ? 0.45 : 1 }}>
        <Step size={13} /> Step
      </button>
      <button className={btn} onClick={sim.reset}>
        <Reset size={13} /> Reset
      </button>
      <div className="ml-auto flex items-center gap-1 rounded border border-line bg-panel-2 p-0.5">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            onClick={() => sim.setSpeed(sp)}
            className={`num rounded px-2 py-1 text-[11px] transition-colors ${
              sim.speed === sp
                ? "bg-signal/15 text-signal"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {sp}×
          </button>
        ))}
      </div>
    </div>
  );
}
