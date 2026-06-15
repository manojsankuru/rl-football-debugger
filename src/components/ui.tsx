// ui.tsx — small styling-only primitives shared across panels. No domain logic.
import React from "react";

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel rounded-lg ${className}`}>
      {(title || right) && (
        <header className="flex items-baseline justify-between gap-2 border-b border-line/70 px-3 py-2">
          <div>
            {title && (
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
                {title}
              </h2>
            )}
            {subtitle && <p className="text-[10px] text-ink-3">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  fmt = (v) => v.toFixed(2),
  accent = "var(--signal)",
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  accent?: string;
}) {
  return (
    <label className="block select-none">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-ink">{label}</span>
        <span className="num text-[11px] text-ink-3">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ accentColor: accent }}
        className="tele-range w-full"
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      title={hint}
      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-white/5"
    >
      <span className="text-[11px] text-ink">{label}</span>
      <span
        className={`relative h-[14px] w-[26px] shrink-0 rounded-full transition-colors ${
          checked ? "bg-signal/80" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-black transition-all ${
            checked ? "left-[14px]" : "left-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded bg-black/40 p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded px-2 py-1 text-[11px] transition-colors ${
            active === t.id
              ? "bg-signal/15 text-signal"
              : "text-ink-3 hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function StatRow({
  k,
  v,
  mono = true,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-[3px]">
      <span className="text-[11px] text-ink-3">{k}</span>
      <span className={`text-[11px] text-ink ${mono ? "num" : ""}`}>{v}</span>
    </div>
  );
}

export function Bar({
  value,
  max = 1,
  color = "var(--signal)",
  height = 6,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-black/50"
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function Chip({
  children,
  color = "var(--ink)",
  bg = "rgba(255,255,255,0.06)",
}: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <span
      className="num inline-flex items-center rounded px-1.5 py-0.5 text-[10px]"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}
