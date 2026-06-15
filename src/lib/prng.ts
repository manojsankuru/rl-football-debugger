// prng.ts — small deterministic PRNG so scenarios are perfectly reproducible.
// We thread a tiny mutable {s} state object through the sim instead of using a
// closure, so the whole SimState stays serialisable (easy to snapshot/replay).

export function makeSeed(n: number): { s: number } {
  return { s: (n >>> 0) || 1 };
}

/** mulberry32 — advances state in place and returns a float in [0, 1). */
export function rand(state: { s: number }): number {
  state.s |= 0;
  state.s = (state.s + 0x6d2b79f5) | 0;
  let t = Math.imul(state.s ^ (state.s >>> 15), 1 | state.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(state: { s: number }, lo: number, hi: number): number {
  return lo + (hi - lo) * rand(state);
}

/** Gaussian via Box–Muller (single sample). */
export function randn(state: { s: number }): number {
  const u = Math.max(1e-9, rand(state));
  const v = rand(state);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function chance(state: { s: number }, p: number): boolean {
  return rand(state) < p;
}
