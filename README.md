# RL Football Agent Debugger

An interactive, browser-based debugger for visually inspecting how a
reinforcement-learning agent perceives and acts in a
[Google Research Football](https://github.com/google-research/football)-style
environment. It renders the pitch as a live tactical *scope*, decodes the
agent's observation in three formats, exposes the full 19-action policy with
per-action probabilities/advantages, and lets you edit reward weights and
behavioral knobs and watch the policy respond in real time.

Everything runs on a deterministic mock simulation with mock policies — there
is **no Python and no trained model required**. The seams for plugging in a real
saved policy or real GRF logs are documented under *Integration* below.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check (strict) + production bundle to dist/
```

Requires Node 18+. Zero runtime dependencies beyond `react` / `react-dom`
(no chart or icon libraries — all charts, icons, and the pitch are hand-drawn
SVG/Canvas), so the dependency surface stays small and the build is reliable.

## What you can do

- **Drive the sim** — play / pause / single-step / reset, at 0.5–4× speed.
- **Switch agents** — random, rule-based beginner, rule-based expert, imitation,
  PPO (mock), and a hybrid RL+rules policy. Only the latter three expose a critic
  (advantage/value).
- **Force any action** — click a card in the Action panel to override the policy
  for the next step (bypasses masking so its effect is visible).
- **Edit reward weights live** — the weights feed the policy's expected-reward
  term, so raising "Shot on target" or "Progress" visibly shifts action
  probabilities even while paused.
- **Toggle nine overlays** — passing lanes, shooting cone, pressure radius,
  nearest links, ball trajectory, field of view, value heatmap, top-3 action
  arrows, and an on-pitch reward HUD.
- **Inspect the observation** — raw GRF fields, the 115-float `Simple115`
  vector (grouped by section), and the 4-channel `SMM` minimap.
- **Load 10 scenarios** — 1v1, counterattack, crowded midfield, wing attack,
  high press, open shot, blocked lane, GK back-pass danger, and possession
  recovery.

## Architecture

```
src/
├─ types.ts                 Domain model (GRF-normalized coords: x∈[-1,1], y∈[-0.42,0.42])
├─ lib/
│  ├─ prng.ts               mulberry32 deterministic RNG (reproducible scenarios)
│  ├─ pitch.ts              FIELD constants, vector ops, field↔pixel projection, 8 directions
│  ├─ actions.ts            The 19 discrete GRF actions + categories + help text
│  ├─ features.ts           computeFeatures(state) — single source of truth for
│  │                        policy, reward, and overlays; also pitchValue / stateValue
│  ├─ observation.ts        buildObservation, Simple115 + SMM encoders, legal/useful masks
│  ├─ agents.ts             evaluatePolicy (pure) + selectAction (samples; uses PRNG)
│  ├─ reward.ts             computeReward + weights + UI field metadata
│  ├─ sim.ts                stepOnce(state, tweaks, weights) — the environment transition
│  └─ scenarios.ts          10 preset initial conditions
├─ hooks/
│  └─ useSimulation.ts      Owns the rAF step loop, snapshot, and all controls
├─ components/
│  ├─ Pitch.tsx             Canvas scope with its own rAF draw loop + all overlays
│  ├─ ActionPanel / PolicyPanel / ObservationInspector / RewardPanel / TweakPanel
│  ├─ TopBar / TransportControls / OverlayToggles
│  ├─ ui.tsx                Styling-only primitives (Card, Slider, Toggle, Tabs, Bar…)
│  └─ Icons.tsx             Inline SVG glyphs
└─ App.tsx                  Layout; derives features/obs/policy once and fans out
```

### Two decoupled clocks

The **logical clock** lives in `useSimulation`: a single `requestAnimationFrame`
loop with a time accumulator advances 0..n environment steps per frame at a
speed-controlled interval, then publishes an immutable `SimState` snapshot that
re-renders the panels.

The **render clock** lives inside `<Pitch/>`: its own rAF loop eases each
actor's render position (`rpos`) toward its logical position (`pos`) every frame,
so motion stays smooth and independent of the (coarser) step rate. `rpos` is
render scratch — `stepOnce` only ever writes `pos`/`vel`, and `cloneState`
carries `rpos` forward so interpolation survives the state swap.

### One feature pipeline, three consumers

`computeFeatures(state)` produces the tactical features (possession, distance and
angle to goal, pressure, best pass, forward space, desired heading, …). The
**policy**, the **reward**, and the **overlays** all read from this same struct,
which is what keeps the visualization honest: the arrow you see is computed from
the same numbers the policy acted on.

### Reward → policy coupling

`agents.expectedRewardVector(features, weights)` turns the editable reward
weights into a per-action expected-reward vector that is mixed into the heuristic
logits (`REWARD_COUPLING`). That is the mechanism behind "drag a weight, watch
the distribution move." `App` memoizes `evaluatePolicy` on
`[snapshot, tweaks, weights]`, so the panels recompute the instant a knob
changes — even with the sim paused.

### Determinism

All stochasticity flows through a single seeded `mulberry32` state threaded on
`SimState.rng`. `evaluatePolicy` is **pure** (safe to call every render);
only `selectAction`, called once per real step, advances the RNG. A given
scenario + seed therefore replays identically.

## Integration (replacing the mocks)

The code is structured so a real policy or real environment slots in at three
clearly marked seams:

1. **Real policy** — replace `evaluatePolicy` in `lib/agents.ts`. Keep the
   `PolicyOutput` shape (`logits`, `probs`, `advantage`, `value`, `top3`,
   `rationale`, `chosen`). In practice you would export your model's logits to a
   small JSON/ONNX endpoint or run it in-browser (e.g. `onnxruntime-web` /
   `tfjs`) and feed it the encoded observation from step 2.

2. **Real observation** — `lib/observation.ts` already emits `Simple115` and
   `SMM` in GRF's exact layouts (documented inline). Point your model at
   `buildSimple115(obs)` or `buildSMM(obs)` so the network sees precisely what
   the inspector displays. To go the other way (replay real GRF episodes),
   implement a `ScenarioDef.build` that loads logged `raw` observations into a
   `SimState` and have `stepOnce` index frames instead of simulating.

3. **Real dynamics** — swap `stepOnce` in `lib/sim.ts` for a thin client over a
   running GRF instance (or a recorded trace). Nothing in the UI depends on the
   mock physics; it only depends on receiving successive `SimState` snapshots.

The mock `RewardBreakdown` mirrors GRF's `scoring` + `checkpoints` shaping, so
the reward panel stays meaningful against the real environment with no
UI changes.

## Notes & limitations

- The simulation is a deliberately simple kinematic toy (one controlled player
  + a lightweight chase/shape/carry AI for the other 21). It is built to make
  agent *behavior* legible, not to be a faithful football engine.
- "PPO (mock)" and "imitation" are hand-tuned logit biases standing in for
  learned policies; they exist to populate the critic/advantage views.
- Respects `prefers-reduced-motion` (disables positional easing).
