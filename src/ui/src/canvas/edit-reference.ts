import {
  applyEdits,
  canvasColor,
  normalize,
  resolveVocab,
  type CanvasState,
  type CellChange,
  type Edit,
  type EditColumn,
  type Graph,
  type Hex,
  type Point,
  type Profile,
  type Vocab,
} from "@qdic-topology/engine";
import type { RendererText } from "@qdic-topology/renderer";
import { expect, vi } from "vitest";
import {
  createCanvas,
  endsToDraw,
  type Canvas,
  type CanvasEvent,
  type CanvasModel,
} from "./index";

// why: STORY-008-03 test plan — the shared set-up of the `edit*.test.ts` files; only tests import
// it, after `vi.useFakeTimers()` and `vi.resetModules()` (LEARNINGS 64). Security A9 — the tests
// give it the profile and the fixture input
export const NOW = "2026-10-19";
const LIGHT = canvasColor("#F4F4F5") as Hex;
export const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  tipGroup: (count, typeLabel) => `${count} × ${typeLabel}`,
  tipOpened: (sub) => sub,
  tipMore: (sub) => sub,
  tipMember: (sub) => sub,
  tipEdge: (subject, object) => `${subject} → ${object}`,
  tipEdgeAction: (label) => label,
  bubbleCount: (n) => ` · ${n}`,
  lostMark: "lost",
  pillRetired: (label) => `${label} (retired)`,
};

export function modelOf(input: unknown, profile: Profile): CanvasModel {
  const r = normalize(input, { now: NOW });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const { vocab } = resolveVocab(r.graph, r.payload, profile, LIGHT);
  return { ...r, vocab, canvas: LIGHT };
}

type Log = { [K in keyof CanvasEvent]: CanvasEvent[K][] };

export type Open = {
  profile: Profile;
  model: CanvasModel;
  div: HTMLDivElement;
  canvas: Canvas;
  log: Log;
  edits: Edit[];
  state: () => CanvasState;
  clear: () => void;
};

// why: LEARNINGS 49 — the container has a size (the test file stubs `getBoundingClientRect`)
export async function open(
  profile: Profile,
  input: unknown,
  state?: CanvasState,
): Promise<Open> {
  const model = modelOf(input, profile);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const canvas = createCanvas(div, { text: TEXT, model, state });
  const log: Log = {
    select: [],
    explore: [],
    "drag-end": [],
    settle: [],
    notice: [],
  };
  for (const name of Object.keys(log) as (keyof CanvasEvent)[])
    canvas.on(name, (e) => (log[name] as unknown[]).push(e));
  await Promise.resolve();
  vi.advanceTimersByTime(3000);
  const clear = () => {
    for (const list of Object.values(log)) list.length = 0;
  };
  const last = () => log.settle[log.settle.length - 1].state;
  return { profile, model, div, canvas, log, edits: [], state: last, clear };
}

export const node = (
  record: string,
  column: EditColumn,
  after: unknown,
): CellChange => ({ row: { record }, column, before: undefined, after });

export const edge = (
  triple: string,
  column: EditColumn,
  after: unknown,
): CellChange => ({ row: { triple }, column, before: undefined, after });

export type Edited = { graph: Graph; vocab: Vocab };

// why: the edited graph and vocabulary as the shell makes them (SA §4.8, STORY-008-01)
export function edited(o: Open, edits: Edit[]): Edited {
  const graph = applyEdits(o.model.graph, edits, NOW);
  const { vocab } = resolveVocab(graph, o.model.payload, o.profile, LIGHT);
  return { graph, vocab };
}

// why: one save, applied on the canvas with the `draw` of `endsToDraw` (STORY-008-04 order)
export function save(
  o: Open,
  changes: CellChange[],
  draw: string[] = [],
): Edit & Edited {
  const e: Edit = { changes, effect: { drew: [], undrew: [] } };
  const next = edited(o, [...o.edits, e]);
  const effect = o.canvas.applyEdit(next.graph, next.vocab, {
    draw,
    undraw: [],
  });
  const done = { changes, effect };
  o.edits.push(done);
  return { ...done, ...next };
}

// why: SA-001 v0.29 §4.8 addendum (2) — Undo gives `draw` = the old `undrew` and `undraw` = the
// old `drew`; Redo gives the same `draw` again
export function undo(o: Open): Edit {
  const last = o.edits.pop() as Edit;
  const { graph, vocab } = edited(o, o.edits);
  o.canvas.applyEdit(graph, vocab, {
    draw: last.effect.undrew,
    undraw: last.effect.drew,
  });
  return last;
}

export const datum = <T>(el: Element) =>
  (el as unknown as { __data__: T }).__data__;

export function spots(div: HTMLElement): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const g of div.querySelectorAll("g.qt-node")) {
    const m = /^translate\(([^,]+),([^)]+)\)$/.exec(
      g.getAttribute("transform") ?? "",
    );
    out.set(datum<{ id: string }>(g).id, {
      x: Number(m?.[1]),
      y: Number(m?.[2]),
    });
  }
  return out;
}

export function camera(div: HTMLElement): string {
  return div.querySelector("g.qt-viewport")?.getAttribute("transform") ?? "";
}

export const nodeEl = (div: HTMLElement, id: string) =>
  [...div.querySelectorAll("g.qt-node")].find(
    (g) => datum<{ id: string }>(g).id === id,
  );

export const positions = (state: CanvasState) => new Map(state.positions);

export const ids = (o: Open) =>
  o
    .state()
    .positions.map(([id]) => id)
    .filter((id) => nodeEl(o.div, id) !== undefined)
    .sort();

export const drawnIds = (o: Open) => [...spots(o.div).keys()].sort();

export const edgeKeys = (o: Open) =>
  [...o.div.querySelectorAll("path.qt-edge")].map(
    (p) => datum<{ key: string }>(p).key,
  );

export const far = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// why: every node drawn before keeps its position to the bit (0 px; SA §4.8)
export function keeps(before: CanvasState, after: CanvasState, ids: string[]) {
  const was = positions(before);
  const now = positions(after);
  for (const id of ids) expect(now.get(id), id).toEqual(was.get(id));
}

// why: rule 4 order — the change, `endsToDraw` on the edited graph, then `applyEdit`
export function moved(
  o: Open,
  triple: string,
  column: "subject" | "object",
  end: string,
) {
  const changes = [edge(triple, column, end)];
  const e: Edit = { changes, effect: { drew: [], undrew: [] } };
  const next = edited(o, [...o.edits, e]);
  const draw = endsToDraw(e, next.graph, (id) => o.canvas.onCanvas(id));
  return { draw, done: save(o, changes, draw) };
}
