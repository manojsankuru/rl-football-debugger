// TweakPanel.tsx — behavioral knobs that bias the heuristic logits, plus the
// action-masking and sticky-action switches (module 7).
import type { Tweaks } from "../types";
import { Card, Slider, Toggle } from "./ui";

interface Props {
  tweaks: Tweaks;
  patch: (p: Partial<Tweaks>) => void;
}

export default function TweakPanel({ tweaks: t, patch }: Props) {
  return (
    <Card title="Agent tuning" subtitle="bias the policy's preferences">
      <div className="space-y-2">
        <Slider label="Pass aggressiveness" value={t.passAggressiveness}
          onChange={(v) => patch({ passAggressiveness: v })} />
        <Slider label="Shot aggressiveness" value={t.shotAggressiveness}
          onChange={(v) => patch({ shotAggressiveness: v })} accent="var(--warn)" />
        <Slider label="Dribble aggressiveness" value={t.dribbleAggressiveness}
          onChange={(v) => patch({ dribbleAggressiveness: v })} accent="var(--select)" />
        <Slider label="Defensive pressure" value={t.defensivePressure}
          onChange={(v) => patch({ defensivePressure: v })} accent="var(--away)" />
        <Slider label="Sprint tendency" value={t.sprintTendency}
          onChange={(v) => patch({ sprintTendency: v })} />
        <Slider label="Risk tolerance" value={t.riskTolerance}
          onChange={(v) => patch({ riskTolerance: v })} accent="var(--warn)" />
        <Slider label="Possession preference" value={t.possessionPreference}
          onChange={(v) => patch({ possessionPreference: v })} accent="var(--good)" />
      </div>
      <div className="mt-3 space-y-0.5 border-t border-line/70 pt-2">
        <Toggle
          label="Action masking"
          checked={t.actionMasking}
          onChange={(v) => patch({ actionMasking: v })}
          hint="Set illegal actions to −∞ before softmax"
        />
        <Toggle
          label="Sticky actions"
          checked={t.stickyActionsEnabled}
          onChange={(v) => patch({ stickyActionsEnabled: v })}
          hint="GRF-style persistent direction/sprint/dribble state"
        />
      </div>
      <p className="mt-2 text-[10px] leading-snug text-ink-3">
        These scale the corresponding terms in the heuristic logits, so their
        effect depends on the active agent (the random agent ignores them; hybrid
        always re-masks for rule safety).
      </p>
    </Card>
  );
}
