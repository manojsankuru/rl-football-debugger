// App.tsx — dashboard layout. Owns the simulation hook and derives the
// per-frame analysis (features / observation / legality / policy) once, then
// fans it out to the panels. Derivations are memoized on the snapshot plus the
// live tweak/weight state, so dragging a slider while paused updates every panel.
import { useMemo } from "react";
import { useSimulation } from "./hooks/useSimulation";
import { computeFeatures } from "./lib/features";
import { buildObservation, legalActions, usefulActions } from "./lib/observation";
import { evaluatePolicy } from "./lib/agents";
import { SCENARIOS } from "./lib/scenarios";

import TopBar from "./components/TopBar";
import Pitch from "./components/Pitch";
import TransportControls from "./components/TransportControls";
import OverlayToggles from "./components/OverlayToggles";
import ActionPanel from "./components/ActionPanel";
import PolicyPanel from "./components/PolicyPanel";
import ObservationInspector from "./components/ObservationInspector";
import RewardPanel from "./components/RewardPanel";
import TweakPanel from "./components/TweakPanel";

export default function App() {
  const sim = useSimulation();
  const s = sim.snapshot;

  const features = useMemo(() => computeFeatures(s), [s]);
  const obs = useMemo(() => buildObservation(s), [s]);
  const legal = useMemo(() => legalActions(features, s), [features, s]);
  const useful = useMemo(() => usefulActions(features, legal), [features, legal]);
  const policy = useMemo(
    () => evaluatePolicy(s, features, sim.tweaks, sim.weights),
    [s, features, sim.tweaks, sim.weights],
  );

  const scenario = SCENARIOS.find((sc) => sc.id === sim.scenarioId);

  return (
    <div className="flex h-full flex-col">
      <TopBar sim={sim} />

      <main className="grid flex-1 grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Column A — the scope */}
        <div className="flex flex-col gap-3">
          <div className="panel overflow-hidden rounded-lg">
            <div className="aspect-[2.2/1] w-full">
              <Pitch
                stateRef={sim.stateRef}
                overlays={sim.overlays}
                tweaks={sim.tweaks}
                weights={sim.weights}
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1 text-ink-3">
                  <i className="h-2 w-2 rounded-full" style={{ background: "var(--signal)" }} /> agent
                </span>
                <span className="inline-flex items-center gap-1 text-ink-3">
                  <i className="h-2 w-2 rounded-full" style={{ background: "var(--away)" }} /> opponent
                </span>
                <span className="inline-flex items-center gap-1 text-ink-3">
                  <i className="h-2 w-2 rounded-full ring-1 ring-select" /> controlled
                </span>
              </div>
              {s.lastEvent && (
                <span className="num text-[10px] text-warn">{s.lastEvent}</span>
              )}
            </div>
          </div>

          <TransportControls sim={sim} />

          {scenario && (
            <div className="panel rounded-lg px-3 py-2">
              <div className="text-[11px] font-semibold text-ink">{scenario.name}</div>
              <p className="mt-0.5 text-[10px] leading-snug text-ink-2">
                {scenario.description}
              </p>
            </div>
          )}

          <OverlayToggles overlays={sim.overlays} patch={sim.patchOverlays} />
        </div>

        {/* Column B — decision */}
        <div className="flex flex-col gap-3">
          <ActionPanel
            policy={policy}
            legal={legal}
            useful={useful}
            lastAction={s.lastAction}
            onForce={sim.forceAction}
          />
          <PolicyPanel
            policy={policy}
            features={features}
            tweaks={sim.tweaks}
            patch={sim.patchTweaks}
          />
        </div>

        {/* Column C — observation + learning */}
        <div className="flex flex-col gap-3">
          <ObservationInspector state={s} obs={obs} />
          <RewardPanel state={s} weights={sim.weights} patch={sim.patchWeights} />
          <TweakPanel tweaks={sim.tweaks} patch={sim.patchTweaks} />
        </div>
      </main>
    </div>
  );
}
