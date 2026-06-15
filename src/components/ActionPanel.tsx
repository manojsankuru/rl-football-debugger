// ActionPanel.tsx — all 19 discrete actions with legality, probability,
// advantage, explanation, and manual force-action (module 2).
import { ACTIONS, CATEGORY_COLOR } from "../lib/actions";
import type { PolicyOutput } from "../types";
import { Card, Bar } from "./ui";

interface Props {
  policy: PolicyOutput;
  legal: boolean[];
  useful: boolean[];
  lastAction: number;
  onForce: (id: number) => void;
}

export default function ActionPanel({
  policy,
  legal,
  useful,
  lastAction,
  onForce,
}: Props) {
  return (
    <Card
      title="Action space"
      subtitle="19 discrete actions · click to force"
      right={
        <span className="num text-[10px] text-ink-3">
          taken: {ACTIONS[lastAction]?.name ?? "—"}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-1.5">
        {ACTIONS.map((a) => {
          const p = policy.probs[a.id] ?? 0;
          const adv = policy.advantage ? policy.advantage[a.id] : null;
          const isLegal = legal[a.id];
          const isChosen = policy.chosen === a.id;
          const isTop = policy.top3.includes(a.id);
          const cat = CATEGORY_COLOR[a.category];
          return (
            <button
              key={a.id}
              onClick={() => onForce(a.id)}
              title={a.help + (isLegal ? "" : " · (currently illegal)")}
              className={`group relative rounded border px-2 py-1.5 text-left transition-all ${
                isChosen
                  ? "border-select/70 bg-select/10"
                  : isTop
                    ? "border-line-2 bg-white/[0.03]"
                    : "border-line bg-panel-2 hover:border-line-2"
              }`}
              style={{ opacity: isLegal ? 1 : 0.4 }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="num grid h-4 w-4 place-items-center rounded text-[9px]"
                  style={{ background: "rgba(255,255,255,0.06)", color: cat }}
                >
                  {a.id}
                </span>
                <span style={{ color: cat }} className="text-[12px] leading-none">
                  {a.short}
                </span>
                <span className="truncate text-[10px] text-ink">{a.name}</span>
                {useful[a.id] && isLegal && (
                  <span
                    className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--good)" }}
                    title="useful here"
                  />
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="flex-1">
                  <Bar value={p} color={cat} height={4} />
                </div>
                <span className="num w-9 shrink-0 text-right text-[9px] text-ink-2">
                  {(p * 100).toFixed(0)}%
                </span>
              </div>
              {adv != null && isLegal && (
                <div className="num mt-0.5 text-[9px]" style={{
                  color: adv >= 0 ? "var(--good)" : "var(--bad)",
                }}>
                  A {adv >= 0 ? "+" : ""}{adv.toFixed(2)}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-ink-3">
        Bars are policy probability; green dot marks a contextually useful action;
        A is the advantage estimate (critic-equipped agents only). The magenta
        card is the action the agent took.
      </p>
    </Card>
  );
}
