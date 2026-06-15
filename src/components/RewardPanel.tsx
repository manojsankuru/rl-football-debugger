// RewardPanel.tsx — immediate / cumulative / shaped components, a reward
// sparkline, and editable weights that feed back into the policy (module 5).
import { useRef, useEffect } from "react";
import type { SimState, RewardWeights } from "../types";
import { REWARD_FIELDS } from "../lib/reward";
import { Card, Slider, StatRow } from "./ui";

interface Props {
  state: SimState;
  weights: RewardWeights;
  patch: (p: Partial<RewardWeights>) => void;
}

export default function RewardPanel({ state, weights, patch }: Props) {
  const r = state.reward;
  return (
    <Card
      title="Reward & shaping"
      subtitle="components feed the policy's value term"
      right={
        <span
          className="num text-[11px]"
          style={{ color: r.total >= 0 ? "var(--good)" : "var(--bad)" }}
        >
          r {r.total >= 0 ? "+" : ""}
          {r.total.toFixed(3)}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-x-3">
        <StatRow k="immediate" v={r.total.toFixed(3)} />
        <StatRow k="cumulative" v={state.cumulativeReward.toFixed(2)} />
      </div>

      <Sparkline data={state.rewardHistory} />

      <div className="mt-2 border-t border-line/70 pt-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-3">
          step components
        </div>
        {REWARD_FIELDS.map((rf) => {
          const val = r[rf.key];
          const active = Math.abs(val) > 1e-6;
          return (
            <div
              key={rf.key}
              className="flex items-center justify-between py-[2px]"
              style={{ opacity: active ? 1 : 0.5 }}
            >
              <span className="text-[10px] text-ink-2">{rf.label}</span>
              <span
                className="num text-[10px]"
                style={{
                  color:
                    val > 0 ? "var(--good)" : val < 0 ? "var(--bad)" : "var(--ink-3)",
                }}
              >
                {val >= 0 ? "+" : ""}
                {val.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-line/70 pt-2">
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-3">
          weights (live)
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {REWARD_FIELDS.map((rf) => (
            <Slider
              key={rf.key}
              label={`${rf.label}${rf.sign < 0 ? " (−)" : ""}`}
              value={weights[rf.key]}
              min={0}
              max={rf.key === "successfulPass" || rf.key === "possession" ? 0.5 : 2}
              onChange={(v) => patch({ [rf.key]: v } as Partial<RewardWeights>)}
              accent={rf.sign < 0 ? "var(--bad)" : "var(--good)"}
            />
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-ink-3">
          Raising e.g. “Shot on target” or “Progress” pushes the policy’s
          expected-reward term toward shooting / driving forward — watch the
          action probabilities shift as you drag.
        </p>
      </div>
    </Card>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = 40;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // zero line
    const mid = H / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(W, mid);
    ctx.stroke();
    if (data.length < 2) return;
    const maxAbs = Math.max(0.05, ...data.map((d) => Math.abs(d)));
    const stepX = W / Math.max(1, data.length - 1);
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = i * stepX;
      const y = mid - (d / maxAbs) * (H / 2 - 3);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#3dd7c9";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data]);
  return (
    <canvas ref={ref} className="mt-2 w-full" style={{ height: 40 }} />
  );
}
