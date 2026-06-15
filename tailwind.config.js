/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Instrument-cluster surfaces
        void: "#070a0f",
        panel: "#0c1118",
        "panel-2": "#10171f",
        line: "#1b2531",
        "line-2": "#27333f",
        ink: "#e7eef5",
        "ink-2": "#9fb0c0",
        "ink-3": "#5d6f80",
        // Telemetry signal colors
        signal: "#3dd7c9", // active / possession (teal)
        "signal-dim": "#1f6f68",
        away: "#ff7a59", // opponents / pressure (amber-red)
        "away-dim": "#7a3a2b",
        select: "#c77dff", // selected action (magenta)
        warn: "#ffd166", // warnings / sticky
        good: "#7ee787", // positive reward
        bad: "#ff6b6b", // negative reward
        grass: "#0a1f17",
        "grass-line": "#1b4332",
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
        sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.66rem", { lineHeight: "0.9rem", letterSpacing: "0.02em" }],
      },
      boxShadow: {
        inset: "inset 0 1px 0 0 rgba(255,255,255,0.03)",
        glow: "0 0 0 1px rgba(61,215,201,0.25), 0 0 18px -6px rgba(61,215,201,0.4)",
      },
    },
  },
  plugins: [],
};
