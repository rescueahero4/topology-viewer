import { clampK } from "./fit";

export type Level = "low" | "mid" | "full";

// why: mockup options `lodZoom` 0.4, `lodFull` 1.4, `bigGraph` 1200 (lib/topology.js line 424)
const LOD_ZOOM = 0.4;
const LOD_FULL = 1.4;
export const BIG_GRAPH = 1200;
// why: mockup line 544 — one `--k` write re-styles every label, so it waits for an 8 % change
// in log scale
const K_STEP = 0.08;

export const isBig = (count: number) => count > BIG_GRAPH;

export function levelOf(k: number, count: number): Level {
  if (k < LOD_ZOOM || (isBig(count) && k < 1)) return "low";
  return k < LOD_FULL ? "mid" : "full";
}

export type Lod = {
  level(): Level;
  big(): boolean;
  count(count: number, k: number): void;
  zoomed(k: number, count: number): void;
  ended(k: number): void;
};

// why: mockup zoom handler and `computeView` (lib/topology.js lines 538-550, 605-611) — the
// zoom `k` goes to `--k` (labels keep their screen size), the level classes to the root; big
// mode writes no `--k`. STORY-003-02 DA-5: the only inline style of the root is `--k`
export function createLod(root: HTMLDivElement): Lod {
  let applied = 1;
  let level: Level | null = null;
  let big = false;
  const write = (k: number) => {
    applied = clampK(k);
    root.style.setProperty("--k", String(applied));
  };
  const show = (next: Level) => {
    if (next === level) return;
    level = next;
    root.classList.toggle("qt-lod-low", next === "low");
    root.classList.toggle("qt-lod-mid", next === "mid");
  };
  const ended = (k: number) => {
    if (!big && clampK(k) !== applied) write(k);
  };
  return {
    level: () => level ?? "full",
    big: () => big,
    count(count, k) {
      if (isBig(count) !== big) {
        big = isBig(count);
        root.classList.toggle("qt-big", big);
        ended(k);
      }
      show(levelOf(k, count));
    },
    zoomed(k, count) {
      if (!big && Math.abs(Math.log(k / applied)) > K_STEP) write(k);
      show(levelOf(k, count));
    },
    ended,
  };
}
