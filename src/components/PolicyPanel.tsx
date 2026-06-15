// PolicyPanel.tsx — sorted policy distribution, top-3 with football-logic
// rationale, value estimate, feature readout, temperature + epsilon (module 4).
import { ACTIONS, CATEGORY_COLOR } from "../lib/actions";
import type { PolicyOutput, Features, Tweaks } from "../types";
import { Card, Bar, Slider, StatRow, Chip } from "./ui";

interface Props {
  policy: PolicyOutput;
  features: Features;
  tweaks: Tweaks;
  patch: (p: Partial<Tweaks>) => void;
}

const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(0)}°`;
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export default function PolicyPanel({ policy, features: f, tweaks, patch }: Props) {
  const ranked = policy.probs
    .map((p, id) => ({ p, id }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 8);

  return (
    <Card
      title="Policy"
      subtitle={`${tweaks.agent} · π(a|s)`}
      right={
        <span className="num text-[10px] text-ink-3">
          V(s) {policy.value >= 0 ? "+" : ""}
          {policy.value.toFixed(2)}
        </span>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-ink-3">top-3:</span>
        {policy.top3.map((id, i) => (
          <Chip
            key={id}
            color={CATEGORY_COLOR[ACTIONS[id].category]}
            bg="rgba(255,255,255,0.05)"
          >
            {i + 1}. {ACTIONS[id].name} {pct(policy.probs[id])}
          </Chip>
        ))}
      </div>

      <div className="space-y-1">
        {ranked.map(({ p, id }) => {
          const a = ACTIONS[id];
          const c = CATEGORY_COLOR[a.category];
          return (
            <div key={id} className="grid grid-cols-[88px_1fr_34px] items-center gap-2">
              <span className="num truncate text-[10px]" style={{ color: c }}>
                {a.name}
              </span>
              <Bar value={p} color={c} height={7} />
              <span className="num text-right text-[10px] text-ink-2">
                {pct(p)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 border-t border-line/70 pt-2 text-[10px] leading-snug text-ink-2">
        {policy.rationale[policy.top3[0]]}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-x-3 border-t border-line/70 pt-2">
        <StatRow k="possession" v={f.hasPossession ? (f.activeHasBall ? "on ball" : "team") : "out"} />
        <StatRow k="dist→goal" v={f.distToGoal.toFixed(2)} />
        <StatRow k="shot angle" v={deg(f.shootingAngle)} />
        <StatRow k="shot clear" v={pct(f.shotClear)} />
        <StatRow k="pressure" v={pct(f.pressure)} />
        <StatRow k="opp dist" v={f.nearestOpponent.dist.toFixed(2)} />
        <StatRow k="best lane" v={f.bestPass ? pct(f.bestPass.laneOpenness) : "—"} />
        <StatRow k="fwd space" v={pct(f.forwardSpace)} />
        <StatRow k="stamina" v={pct(f.stamina)} />
        <StatRow k="sprint" v={f.sprintActive ? "on" : "off"} />
      </div>

      <div className="mt-3 space-y-2 border-t border-line/70 pt-2">
        <Slider
          label="Temperature τ"
          value={tweaks.temperature}
          min={0.05}
          max={2}
          onChange={(v) => patch({ temperature: v })}
        />
        <Slider
          label="Exploration ε"
          value={tweaks.epsilon}
          min={0}
          max={0.6}
          onChange={(v) => patch({ epsilon: v })}
          accent="var(--select)"
        />
        <p className="text-[10px] leading-snug text-ink-3">
          τ→0 sharpens toward the argmax; higher τ flattens the distribution. ε is
          the probability of overriding the sample with a uniform legal action.
        </p>
      </div>
    </Card>
  );
}
