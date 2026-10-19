import { select } from "d3-selection";
import type { DrawnId } from "@qdic-topology/engine";
import type { Level } from "./lod";
import type { Scene, SceneNode } from "./scene";

// why: mockup `cullLabels` (lib/topology.js lines 1895-1931) — label box sizes in screen px and
// the grid cell of the greedy pass
const CELL = 120;
const LABEL_CHARS = 22;
const CHAR_W = 7.6;
const FULL_MIN_W = 60;
const BOX_PAD = 6;
const FULL_H = 30;
const MID_H = 17;
const GAP = 2;

type Rect = [number, number, number, number];

const named = (n: SceneNode) => n.kind === "group" || n.tier !== "leaf";

function degrees(scene: Scene): Map<DrawnId, number> {
  const out = new Map<DrawnId, number>();
  const add = (id: DrawnId) => out.set(id, (out.get(id) ?? 0) + 1);
  for (const e of scene.edges) {
    add(e.subject);
    if (e.object !== e.subject) add(e.object);
  }
  return out;
}

// why: named first, then degree, then group count, then scene order (stable sort); mockup line
// 1906 — a faded node takes no part, so its label box hides no shown label
function ranked(scene: Scene, full: boolean): SceneNode[] {
  const degree = degrees(scene);
  const deg = (n: SceneNode) => degree.get(n.id) ?? 0;
  return scene.nodes
    .filter((n) => !n.faded && (full || named(n)))
    .sort(
      (a, b) =>
        Number(named(b)) - Number(named(a)) ||
        deg(b) - deg(a) ||
        b.count - a.count,
    );
}

function grid() {
  const cells = new Map<string, Rect[]>();
  const each = (b: Rect, fn: (key: string) => boolean | void) => {
    for (let gx = Math.floor(b[0] / CELL); gx <= Math.floor(b[2] / CELL); gx++)
      for (
        let gy = Math.floor(b[1] / CELL);
        gy <= Math.floor(b[3] / CELL);
        gy++
      )
        if (fn(`${gx},${gy}`) === true) return true;
    return false;
  };
  const meets = (b: Rect, o: Rect) =>
    b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
  return {
    hit: (b: Rect) =>
      each(b, (key) => (cells.get(key) ?? []).some((o) => meets(b, o))),
    add: (b: Rect) =>
      each(b, (key) => {
        const list = cells.get(key);
        if (list === undefined) cells.set(key, [b]);
        else list.push(b);
      }),
  };
}

// why: STORY-003-04 Context "Labels" — at `mid` only the named labels show, so only they take
// part; at `low` and in big mode no label is culled. A node is culled only when its label took
// part and met a kept label
export function cullLabels(
  layer: SVGGElement,
  scene: Scene,
  k: number,
  level: Level,
  big: boolean,
): void {
  const culled = new Set<DrawnId>();
  if (!big && level !== "low") {
    const full = level === "full";
    const h = full ? FULL_H : MID_H;
    const placed = grid();
    for (const n of ranked(scene, full)) {
      const chars = Math.min(n.label.length, LABEL_CHARS) * CHAR_W;
      const w = Math.max(chars, full ? FULL_MIN_W : 0) + BOX_PAD;
      const x = n.x * k;
      const y = (n.y + n.h / 2) * k + GAP;
      const box: Rect = [x - w / 2, y, x + w / 2, y + h];
      if (placed.hit(box)) culled.add(n.id);
      else placed.add(box);
    }
  }
  select(layer)
    .selectAll<SVGGElement, SceneNode>("g.qt-node")
    .classed("qt-culled", (d) => culled.has(d.id));
}
