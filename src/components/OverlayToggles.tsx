// OverlayToggles.tsx — the educational overlay switches (module 8).
import type { Overlays } from "../types";
import { Card, Toggle } from "./ui";

const ITEMS: { key: keyof Overlays; label: string; hint: string }[] = [
  { key: "passingLanes", label: "Passing lanes", hint: "Lane openness to each teammate (green=open)" },
  { key: "shootingCone", label: "Shooting cone", hint: "Angle subtended by the goal mouth" },
  { key: "pressureRadius", label: "Pressure radius", hint: "Opponent influence fields" },
  { key: "nearestLinks", label: "Nearest links", hint: "Nearest teammate / opponent to the carrier" },
  { key: "ballTrajectory", label: "Ball trajectory", hint: "Recent ball path" },
  { key: "fieldOfView", label: "Field of view", hint: "Active player's facing cone" },
  { key: "valueHeatmap", label: "Value heatmap", hint: "V(x,y) field — teal good, amber bad" },
  { key: "actionArrows", label: "Action arrows", hint: "Top-3 policy actions as vectors" },
  { key: "rewardExplain", label: "Reward HUD", hint: "On-pitch step/cumulative reward" },
];

interface Props {
  overlays: Overlays;
  patch: (p: Partial<Overlays>) => void;
}

export default function OverlayToggles({ overlays, patch }: Props) {
  return (
    <Card title="Overlays" subtitle="annotate the scope">
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {ITEMS.map((it) => (
          <Toggle
            key={it.key}
            label={it.label}
            checked={overlays[it.key]}
            onChange={(v) => patch({ [it.key]: v } as Partial<Overlays>)}
            hint={it.hint}
          />
        ))}
      </div>
    </Card>
  );
}
