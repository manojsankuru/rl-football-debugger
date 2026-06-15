// ObservationInspector.tsx — raw obs, Simple115 vector, and SMM minimap
// channels, summarized with expand-on-demand (module 3).
import { useMemo, useRef, useEffect, useState } from "react";
import type { SimState, Observation } from "../types";
import { STICKY_NAMES, GAME_MODE_NAMES } from "../types";
import {
  buildSimple115,
  SIMPLE115_SECTIONS,
  buildSMM,
  type SMM,
} from "../lib/observation";
import { computeFeatures } from "../lib/features";
import { Card, Tabs, StatRow, Chip } from "./ui";

const TABS = [
  { id: "raw", label: "Raw" },
  { id: "s115", label: "Simple115" },
  { id: "smm", label: "SMM" },
];

export default function ObservationInspector({
  state,
  obs,
}: {
  state: SimState;
  obs: Observation;
}) {
  const [tab, setTab] = useState("raw");
  return (
    <Card title="Observation" subtitle="what the agent sees">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="mt-2">
        {tab === "raw" && <RawView state={state} obs={obs} />}
        {tab === "s115" && <Simple115View obs={obs} />}
        {tab === "smm" && <SMMView obs={obs} />}
      </div>
    </Card>
  );
}

function RawView({ state, obs }: { state: SimState; obs: Observation }) {
  const f = useMemo(() => computeFeatures(state), [state]);
  const [expand, setExpand] = useState(false);
  const own = obs.ballOwnedTeam === 0 ? "left" : obs.ballOwnedTeam === 1 ? "right" : "none";
  const ap = obs.leftTeam[obs.activePlayer];
  return (
    <div className="grid grid-cols-2 gap-x-3">
      <StatRow k="ball pos" v={`${obs.ballPos.x.toFixed(2)}, ${obs.ballPos.y.toFixed(2)}`} />
      <StatRow k="ball vel" v={`${obs.ballVel.x.toFixed(3)}, ${obs.ballVel.y.toFixed(3)}`} />
      <StatRow k="ball z" v={obs.ballZ.toFixed(3)} />
      <StatRow k="owned by" v={`${own}${obs.ballOwnedPlayer >= 0 ? ` #${obs.ballOwnedPlayer}` : ""}`} />
      <StatRow k="active idx" v={`#${obs.activePlayer}`} />
      <StatRow k="active pos" v={ap ? `${ap.x.toFixed(2)}, ${ap.y.toFixed(2)}` : "—"} />
      <StatRow k="nearest mate" v={`#${f.nearestTeammate.idx} · ${f.nearestTeammate.dist.toFixed(2)}`} />
      <StatRow k="nearest opp" v={`#${f.nearestOpponent.idx} · ${f.nearestOpponent.dist.toFixed(2)}`} />
      <StatRow k="score" v={`${obs.score[0]} : ${obs.score[1]}`} />
      <StatRow k="game mode" v={GAME_MODE_NAMES[obs.gameMode]} />
      <StatRow k="steps left" v={obs.stepsLeft} />
      <StatRow k="sticky on" v={obs.stickyActions.filter(Boolean).length} />

      <div className="col-span-2 mt-1.5 flex flex-wrap gap-1">
        {STICKY_NAMES.map((n, i) => (
          <span
            key={n}
            className="num rounded px-1 py-0.5 text-[9px]"
            style={{
              color: obs.stickyActions[i] ? "var(--warn)" : "var(--ink-3)",
              background: obs.stickyActions[i]
                ? "rgba(255,209,102,0.12)"
                : "rgba(255,255,255,0.03)",
            }}
          >
            {n}
          </span>
        ))}
      </div>

      <button
        onClick={() => setExpand((e) => !e)}
        className="col-span-2 mt-2 text-left text-[10px] text-signal hover:underline"
      >
        {expand ? "▾ hide" : "▸ show"} full team position arrays (22 vectors)
      </button>
      {expand && (
        <div className="col-span-2 mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2">
          <ArrayBlock label="left" team={obs.leftTeam} />
          <ArrayBlock label="right" team={obs.rightTeam} />
        </div>
      )}
    </div>
  );
}

function ArrayBlock({ label, team }: { label: string; team: { x: number; y: number }[] }) {
  return (
    <div className="mb-1">
      <div className="text-[9px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="num text-[9px] leading-relaxed text-ink-2">
        {team.map((p, i) => (
          <span key={i} className="mr-2 inline-block">
            {i}:[{p.x.toFixed(2)},{p.y.toFixed(2)}]
          </span>
        ))}
      </div>
    </div>
  );
}

function Simple115View({ obs }: { obs: Observation }) {
  const vec = useMemo(() => buildSimple115(obs), [obs]);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] text-ink-3">
          float vector · length {vec.length}
        </span>
        <Chip color="var(--ink-2)">‖v‖ {Math.hypot(...vec).toFixed(2)}</Chip>
      </div>
      <div className="space-y-1">
        {SIMPLE115_SECTIONS.map((sec, i) => {
          const slice = vec.slice(sec.start, sec.start + sec.len);
          const isOpen = open === i;
          return (
            <div key={i} className="rounded border border-line bg-panel-2">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between px-2 py-1 text-left"
              >
                <span className="text-[10px] text-ink">{sec.label}</span>
                <span className="num text-[9px] text-ink-3">
                  [{sec.start}:{sec.start + sec.len}]
                </span>
              </button>
              <div className="num px-2 pb-1 text-[9px] text-ink-2">
                {(isOpen ? slice : slice.slice(0, 6))
                  .map((x) => x.toFixed(2))
                  .join(", ")}
                {!isOpen && slice.length > 6 && " …"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SMMView({ obs }: { obs: Observation }) {
  const smm = useMemo(() => buildSMM(obs, 48, 32), [obs]);
  const channels: { key: keyof SMM["channels"]; label: string; color: string }[] = [
    { key: "left", label: "left team", color: "#3dd7c9" },
    { key: "right", label: "right team", color: "#ff7a59" },
    { key: "ball", label: "ball", color: "#e7eef5" },
    { key: "active", label: "active", color: "#c77dff" },
  ];
  return (
    <div>
      <span className="text-[10px] text-ink-3">
        4 binary channels · {smm.width}×{smm.height}
      </span>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {channels.map((c) => (
          <div key={c.key}>
            <div className="mb-0.5 text-[9px] text-ink-3">{c.label}</div>
            <SMMCanvas
              data={smm.channels[c.key]}
              w={smm.width}
              h={smm.height}
              color={c.color}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SMMCanvas({
  data,
  w,
  h,
  color,
}: {
  data: number[];
  w: number;
  h: number;
  color: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const scale = 3;
    cv.width = w * scale;
    cv.height = h * scale;
    ctx.fillStyle = "#06090d";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = color;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (data[j * w + i]) {
          ctx.fillRect(i * scale, j * scale, scale + 0.5, scale + 0.5);
        }
      }
    }
  }, [data, w, h, color]);
  return (
    <canvas
      ref={ref}
      className="w-full rounded border border-line"
      style={{ imageRendering: "pixelated", aspectRatio: `${w}/${h}` }}
    />
  );
}
