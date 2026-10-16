// why: SA §5 Shared, NF-3 — mulberry32 (mockup mock-data.js lines 10-16) seeded by the 32-bit
// FNV-1a hash of the canonical graph, so every run of one input draws the same numbers
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
