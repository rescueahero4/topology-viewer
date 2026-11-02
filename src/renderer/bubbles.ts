import { packEnclose } from "d3-hierarchy";
import { select } from "d3-selection";
import type { Hex } from "#engine";
import { endOf, type At, type Ends } from "./edges";
import type { Pointer } from "./intents";
import type { Layers } from "./layers";
import { isHex } from "./marks";
import type { Scene } from "./scene";
import type { RendererText } from "./text";

// why: mockup `drawBubbles` (lib/topology.js lines 1820-1832) — the pill size and the width rule
const PILL_H = 20;
const PILL_RX = 10;
const CHAR_W = 6.6;
const PAD_W = 20;
// why: Security notes (re-check round) — every term of `d3-hierarchy` `enclose.js` stays finite
// below this bound (the cubic terms of `encloseBasis3` overflow above about 2.4e102)
const BOUND = 1e100;

export type Bubble = {
  id: string;
  type: string | null;
  label: string;
  colour: Hex;
  count: number;
  x: number;
  y: number;
  r: number;
};

type Shape = { x: number; y: number; r: number; count: number };
type Room = { x: number; y: number; r: number };

const bounded = (v: number) => Number.isFinite(v) && Math.abs(v) < BOUND;

// why: story "Renderer" — one circle per type key of the members that are not faded, in the order
// of `Scene.types`; a type key is a `Map` key only. Only finite members inside the bound go into
// `packEnclose` (an endless loop or a throw in `enclose.js` otherwise); an empty type has no circle
function shapesOf(scene: Scene, at: At): Map<string | null, Shape> {
  const rooms = new Map<string | null, { list: Room[]; count: number }>(
    scene.types.map(([type]) => [type, { list: [], count: 0 }]),
  );
  for (const n of scene.nodes) {
    const group = rooms.get(n.type);
    if (n.faded || group === undefined) continue;
    const p = at(n.id);
    const room = { x: p.x, y: p.y, r: n.room };
    if (!bounded(room.x) || !bounded(room.y) || !bounded(room.r) || room.r < 0)
      continue;
    group.list.push(room);
    group.count += n.kind === "group" ? n.count : 1;
  }
  const out = new Map<string | null, Shape>();
  for (const [type, { list, count }] of rooms) {
    if (list.length === 0) continue;
    const e = packEnclose(list);
    out.set(type, { x: e.x, y: e.y, r: e.r, count });
  }
  return out;
}

export type BubbleContext = {
  text: RendererText;
  pillId: (type: string | null) => string;
  pointer: Pointer;
  k: number;
};

function bubblesOf(scene: Scene, ends: Ends, ctx: BubbleContext): Bubble[] {
  const shapes = shapesOf(scene, (id) => endOf(ends, id));
  return scene.types.flatMap(([type, { label, colour }]) => {
    const s = shapes.get(type);
    if (s === undefined) return [];
    return [{ id: ctx.pillId(type), type, label, colour, ...s }];
  });
}

// why: SA §5 Renderer — a colour attribute takes only a re-checked `#rrggbb`; a bad value sets
// neither, so the circle keeps the look of its token class
function setTint(el: Element, colour: string): void {
  el.removeAttribute("fill");
  el.removeAttribute("stroke");
  if (!isHex(colour)) return;
  el.setAttribute("fill", colour);
  el.setAttribute("stroke", colour);
}

function setCircle(el: Element, b: Bubble): void {
  el.setAttribute("cx", String(b.x));
  el.setAttribute("cy", String(b.y));
  el.setAttribute("r", String(b.r));
}

// why: mockup `placeOverlays` (lib/topology.js line 1093) — the pill sits on top of its circle and
// keeps its screen size at each zoom `k`
const pillTransform = (b: Bubble, k: number) =>
  `translate(${b.x},${b.y - b.r}) scale(${1 / k})`;

export function scaleBubbles(layer: SVGGElement, k: number): void {
  select(layer)
    .selectAll<SVGGElement, Bubble>("g.qt-blabel")
    .attr("transform", (b) => pillTransform(b, k));
}

// why: mockup lines 1823-1832, FR-CANVAS-15 (Q25) — `<Type> · N` with no plural, in two `tspan`;
// the width uses only the two `length` values; the texts go by `textContent` only. Epic question
// 15 — the name of the pill is its visible text, through a hidden `text.qt-a11y`
function fillPill(g: SVGGElement, b: Bubble, text: RendererText): void {
  g.replaceChildren();
  const pill = select(g);
  const count = text.bubbleCount(b.count);
  const w = (b.label.length + count.length) * CHAR_W + PAD_W;
  const rect = pill
    .append("rect")
    .attr("x", -w / 2)
    .attr("y", -PILL_H / 2)
    .attr("width", w)
    .attr("height", PILL_H)
    .attr("rx", PILL_RX);
  const line = pill.append("text").attr("y", 0.5);
  if (isHex(b.colour)) {
    rect.attr("stroke", b.colour);
    line.attr("fill", b.colour);
  }
  line.append("tspan").text(b.label);
  line.append("tspan").attr("class", "qt-bn").text(count);
  pill
    .append("text")
    .attr("class", "qt-a11y")
    .attr("id", b.id)
    .text(`${b.label}${count}`);
}

// why: mockup lines 1813-1822 — the circle under the edges, the pill in the bubble-label layer; a
// press on the body pans (no drag on the body, Q25) and a click on it clears the selection (line
// 1815). No `<title>` (epic question 15)
export function drawBubbles(
  layers: Layers,
  scene: Scene,
  ends: Ends,
  ctx: BubbleContext,
): void {
  const data = bubblesOf(scene, ends, ctx);
  const p = ctx.pointer;
  select(layers.bubbles)
    .selectAll<SVGGElement, Bubble>("g.qt-bubble")
    .data(data, (b) => b.id)
    .join((enter) => {
      const g = enter.append("g").attr("class", "qt-bubble");
      g.append("circle").on("click.qt", (event: MouseEvent) => {
        if (!p.live()) return;
        event.stopPropagation();
        p.emit({ kind: "select", node: null });
      });
      return g;
    })
    .select<SVGCircleElement>("circle")
    .each((b, i, groups) => {
      setCircle(groups[i], b);
      setTint(groups[i], b.colour);
    });
  select(layers.bubbleLabels)
    .selectAll<SVGGElement, Bubble>("g.qt-blabel")
    .data(data, (b) => b.id)
    .join((enter) =>
      enter
        .append("g")
        .attr("class", "qt-blabel")
        .attr("aria-labelledby", (b) => b.id),
    )
    .each((b, i, groups) => fillPill(groups[i], b, ctx.text));
  scaleBubbles(layers.bubbleLabels, ctx.k);
}

// why: STORY-003-05, STORY-003-06a frame writes — the one per-frame update of the circles and the
// pills, at the positions of the frame
export function bubbleMover(
  layers: Layers,
  scene: Scene,
): (at: At, k: number) => void {
  const circles: [SVGCircleElement, Bubble][] = [];
  select(layers.bubbles)
    .selectAll<SVGGElement, Bubble>("g.qt-bubble")
    .each((b, i, groups) => {
      const circle = groups[i].querySelector("circle");
      if (circle !== null) circles.push([circle, b]);
    });
  if (circles.length === 0) return () => {};
  return (at, k) => {
    const shapes = shapesOf(scene, at);
    for (const [circle, b] of circles) {
      const s = shapes.get(b.type);
      if (s === undefined) continue;
      b.x = s.x;
      b.y = s.y;
      b.r = s.r;
      setCircle(circle, b);
    }
    scaleBubbles(layers.bubbleLabels, k);
  };
}
