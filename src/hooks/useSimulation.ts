// useSimulation.ts — owns the logical step loop, scenario lifecycle, and all
// live controls. Rendering interpolation lives in <Pitch/>; this hook only
// advances the environment and publishes a snapshot for the panels.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SimState, Tweaks, Overlays, RewardWeights } from "../types";
import { stepOnce } from "../lib/sim";
import { DEFAULT_REWARD_WEIGHTS } from "../lib/reward";
import { SCENARIOS, DEFAULT_SCENARIO } from "../lib/scenarios";

export const DEFAULT_TWEAKS: Tweaks = {
  agent: "expert",
  temperature: 0.7,
  epsilon: 0.05,
  passAggressiveness: 0.5,
  shotAggressiveness: 0.5,
  dribbleAggressiveness: 0.5,
  defensivePressure: 0.5,
  sprintTendency: 0.5,
  riskTolerance: 0.5,
  possessionPreference: 0.5,
  actionMasking: true,
  stickyActionsEnabled: true,
};

export const DEFAULT_OVERLAYS: Overlays = {
  passingLanes: true,
  shootingCone: true,
  pressureRadius: false,
  nearestLinks: false,
  ballTrajectory: true,
  fieldOfView: false,
  valueHeatmap: false,
  actionArrows: true,
  rewardExplain: false,
};

// Logical step interval at 1× (ms). Speed multiplies the rate.
const BASE_STEP_MS = 135;
const SEED = 0x9e3779b9;

export interface Simulation {
  /** Always the newest state object; read by <Pitch/> in its rAF loop. */
  stateRef: React.MutableRefObject<SimState>;
  /** Snapshot that re-renders panels each logical step / control change. */
  snapshot: SimState;
  playing: boolean;
  speed: number;
  scenarioId: string;
  tweaks: Tweaks;
  weights: RewardWeights;
  overlays: Overlays;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  step: () => void;
  reset: () => void;
  setSpeed: (s: number) => void;
  loadScenario: (id: string) => void;
  forceAction: (id: number) => void;
  setTweaks: (t: Tweaks) => void;
  patchTweaks: (p: Partial<Tweaks>) => void;
  setWeights: (w: RewardWeights) => void;
  patchWeights: (p: Partial<RewardWeights>) => void;
  setOverlays: (o: Overlays) => void;
  patchOverlays: (p: Partial<Overlays>) => void;
}

export function useSimulation(): Simulation {
  const stateRef = useRef<SimState>(DEFAULT_SCENARIO.build(SEED));
  const [snapshot, setSnapshot] = useState<SimState>(stateRef.current);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO.id);
  const [tweaks, setTweaksState] = useState<Tweaks>(DEFAULT_TWEAKS);
  const [weights, setWeightsState] = useState<RewardWeights>(DEFAULT_REWARD_WEIGHTS);
  const [overlays, setOverlaysState] = useState<Overlays>(DEFAULT_OVERLAYS);

  // Refs the rAF loop reads so it never closes over stale tweak/weight state.
  const tweaksRef = useRef(tweaks);
  const weightsRef = useRef(weights);
  const speedRef = useRef(speed);
  const playingRef = useRef(playing);
  tweaksRef.current = tweaks;
  weightsRef.current = weights;
  speedRef.current = speed;
  playingRef.current = playing;

  const publish = useCallback(() => setSnapshot(stateRef.current), []);

  const doStep = useCallback(() => {
    stateRef.current = stepOnce(stateRef.current, tweaksRef.current, weightsRef.current);
    publish();
  }, [publish]);

  // Single rAF loop with a time accumulator; advances 0..n logical steps/frame.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      last = now;
      if (!playingRef.current) {
        acc = 0;
        return;
      }
      acc += dt;
      const interval = BASE_STEP_MS / speedRef.current;
      let guard = 0;
      while (acc >= interval && guard < 6) {
        stateRef.current = stepOnce(
          stateRef.current,
          tweaksRef.current,
          weightsRef.current,
        );
        acc -= interval;
        guard++;
      }
      if (guard > 0) publish();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [publish]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  const step = useCallback(() => {
    setPlaying(false);
    doStep();
  }, [doStep]);

  const reset = useCallback(() => {
    setPlaying(false);
    const sc = SCENARIOS.find((s) => s.id === scenarioId) ?? DEFAULT_SCENARIO;
    stateRef.current = sc.build(SEED);
    publish();
  }, [scenarioId, publish]);

  const setSpeed = useCallback((s: number) => setSpeedState(s), []);

  const loadScenario = useCallback(
    (id: string) => {
      const sc = SCENARIOS.find((s) => s.id === id) ?? DEFAULT_SCENARIO;
      setScenarioId(sc.id);
      setPlaying(false);
      stateRef.current = sc.build(SEED);
      publish();
    },
    [publish],
  );

  const forceAction = useCallback(
    (id: number) => {
      stateRef.current = { ...stateRef.current, forcedAction: id };
      doStep();
    },
    [doStep],
  );

  const patchTweaks = useCallback(
    (p: Partial<Tweaks>) => setTweaksState((t) => ({ ...t, ...p })),
    [],
  );
  const patchWeights = useCallback(
    (p: Partial<RewardWeights>) => setWeightsState((w) => ({ ...w, ...p })),
    [],
  );
  const patchOverlays = useCallback(
    (p: Partial<Overlays>) => setOverlaysState((o) => ({ ...o, ...p })),
    [],
  );

  return {
    stateRef,
    snapshot,
    playing,
    speed,
    scenarioId,
    tweaks,
    weights,
    overlays,
    play,
    pause,
    togglePlay,
    step,
    reset,
    setSpeed,
    loadScenario,
    forceAction,
    setTweaks: setTweaksState,
    patchTweaks,
    setWeights: setWeightsState,
    patchWeights,
    setOverlays: setOverlaysState,
    patchOverlays,
  };
}
