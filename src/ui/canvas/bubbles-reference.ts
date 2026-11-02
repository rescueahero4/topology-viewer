import {
  bubbleRooms,
  fadeSet,
  type CanvasState,
  type DrawnId,
  type Frontier,
  type Point,
  type Vocab,
} from "#engine";
import { iconMetrics } from "#renderer";

// why: STORY-003-06b S1, S6, S9, S28 — the expected bubbles, made from the engine rooms and the
// state positions, not from the renderer; only tests import this module, and they give it the
// `packEnclose` of the renderer's `d3-hierarchy` copy
export type Circle = { x: number; y: number; r: number };
export type Enclose = (circles: Circle[]) => Circle | undefined;
export type Shape = Circle & {
  type: string | null;
  count: number;
  members: (Circle & { id: DrawnId })[];
};

export function shapesOf(
  state: CanvasState,
  frontier: Frontier,
  vocab: Vocab,
  enclose: Enclose,
  at: ReadonlyMap<DrawnId, Point> = new Map(state.positions),
): Shape[] {
  const rooms = new Map(bubbleRooms(frontier, vocab, iconMetrics));
  const faded = new Set(fadeSet(state, frontier).map((f) => f.id));
  const byType = new Map<string | null, Shape["members"]>();
  const counts = new Map<string | null, number>();
  for (const n of frontier.nodes) {
    if (!byType.has(n.type)) byType.set(n.type, []);
    if (faded.has(n.id)) continue;
    const p = at.get(n.id) as Point;
    byType
      .get(n.type)
      ?.push({ id: n.id, x: p.x, y: p.y, r: rooms.get(n.id) ?? 0 });
    const add = "members" in n ? n.count : 1;
    counts.set(n.type, (counts.get(n.type) ?? 0) + add);
  }
  return [...byType].flatMap(([type, members]) => {
    const e = enclose(members);
    if (e === undefined) return [];
    return [
      { type, x: e.x, y: e.y, r: e.r, count: counts.get(type) ?? 0, members },
    ];
  });
}

type Datum = { __data__: { type: string | null } };

export type Drawn = Circle & {
  type: string | null;
  fill: string | null;
  texts: (string | null)[];
};

// why: the circles and the pills of the DOM, joined by the type of their datum (test read only)
export function drawnOf(div: Element): Drawn[] {
  const pills = new Map(
    [...div.querySelectorAll("g.qt-blabel")].map((p) => [
      (p as unknown as Datum).__data__.type,
      [...p.querySelectorAll("text:not(.qt-a11y) tspan")].map(
        (t) => t.textContent,
      ),
    ]),
  );
  return [...div.querySelectorAll("g.qt-bubble")].map((g) => {
    const type = (g as unknown as Datum).__data__.type;
    const c = g.querySelector("circle");
    const num = (name: string) => Number(c?.getAttribute(name));
    return {
      type,
      x: num("cx"),
      y: num("cy"),
      r: num("r"),
      fill: c?.getAttribute("fill") ?? null,
      texts: pills.get(type) ?? [],
    };
  });
}

// why: the node positions of the DOM `transform`, exact (the renderer writes them with `String`)
export function domSpots(div: Element): Map<DrawnId, Point> {
  return new Map(
    [...div.querySelectorAll("g.qt-node")].map((g) => {
      const id = (g as unknown as { __data__: { id: DrawnId } }).__data__.id;
      const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
        g.getAttribute("transform") ?? "",
      );
      return [id, { x: Number(m?.[1]), y: Number(m?.[2]) }];
    }),
  );
}
