// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  fadeSet,
  normalize,
  resolveVocab,
  type DrawnNode,
  type Hex,
  type LayoutName,
  type Point,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import type { RendererText } from "@qdic-topology/renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas, type CanvasEvent } from "./index";

const Observer = class {
  observe() {}
  disconnect() {}
};
vi.stubGlobal("ResizeObserver", Observer);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const LIGHT = canvasColor("#F4F4F5") as Hex;
const TEXT = {
  groupLabel: (typeLabel: string, count: number) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
} as RendererText;

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Settle = CanvasEvent["settle"];
const isGroup = (n: DrawnNode) => "members" in n;
const sorted = (list: string[]) => [...list].sort().join("\n");
const spotsOf = ({ state, frontier }: Settle) => {
  const all = new Map(state.positions);
  return new Map(frontier.nodes.map((n) => [n.id, all.get(n.id) as Point]));
};
const faded = (e: Settle, id: string) =>
  fadeSet(e.state, e.frontier).some((f) => f.id === id);

// why: NF-8 — under reduced motion each call is in the DOM, and its settle fires, before it returns
async function world(key: string) {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const result = normalize(loadFixture(key).input, { now: "2026-10-19" });
  if (!result.ok) throw new Error("fatal");
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const model = { graph, payload, hash, vocab, canvas: LIGHT };
  const canvas = createCanvas(div, { text: TEXT, model });
  const settles: Settle[] = [];
  canvas.on("settle", (e) => settles.push(e));
  await Promise.resolve();
  const now = () => settles[settles.length - 1];
  return { canvas, now };
}

const PAIRS = ["s-access", "s-lineage"].flatMap((key) =>
  (["force", "atomic", "bubbles"] as const).flatMap((layout) =>
    [1, 2, 3].map((seed) => [key, layout, seed] as const),
  ),
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("ResizeObserver", Observer);
  document.body.replaceChildren();
});

// why: S17 (B), SA §6 rows 2, 9, 12 — explores and group expands of shown nodes, collapses of the
// nodes opened after the first grouping (a stack, last opened first), focus and regroup; then off
// and the stack; the drawn set, positions, `homes` and `treeShifts` equal the base B
describe("S17 (B) the round trip of the reversible calls", () => {
  it.each(PAIRS)(
    "%s in %s, seed %d",
    async (key, layout: LayoutName, seed) => {
      const { canvas, now } = await world(key);
      const rand = mulberry32(seed);
      const pick = <T>(list: readonly T[]) =>
        list[Math.floor(rand() * list.length)];
      if (key === "s-lineage") {
        canvas.setLayout("tree-h");
        canvas.expand("e:t_FCT_REVENUE");
        expect(now().state.treeShifts).toHaveLength(1);
      }
      canvas.setLayout(layout);
      if (key === "s-lineage") expect(now().state.treeShifts).toHaveLength(1);
      const shown = () =>
        now().frontier.nodes.filter((n) => !faded(now(), n.id));
      const more = () =>
        shown().filter((n) => !isGroup(n) && n.more > 0 && n.opened === 0);
      for (let k = 0; k < 3; k++) canvas.expand(pick(more()).id);
      canvas.select(pick(now().frontier.nodes).id);
      const base = now();
      canvas.groupAroundRoot(true);
      expect(now().state.around).not.toBeNull();
      const stack: string[] = [];
      const open = (id: string) => {
        const n = now().frontier.nodes.find((x) => x.id === id);
        if (n !== undefined) return !isGroup(n) && n.opened > 0;
        return now().frontier.nodes.some((x) => "group" in x && x.group === id);
      };
      const top = () => {
        while (stack.length > 0 && !open(stack[stack.length - 1])) stack.pop();
        return stack.at(-1);
      };
      // why: S17 (A) rule, Implementer c2 — after an exit, group around the selected node, else
      // around the first drawn node
      const regroup = () => {
        const s = now().state.selection;
        if (s === null) canvas.select(now().frontier.nodes[0].id);
        canvas.groupAroundRoot(true);
      };
      let opened = 0;
      for (let i = 0; i < 50; i++) {
        if (now().state.around === null) {
          regroup();
          continue;
        }
        const kind = pick(["explore", "group", "collapse", "focus", "regroup"]);
        const was = now();
        const groups = shown().filter(isGroup);
        if (kind === "explore" && more().length > 0) {
          const id = pick(more()).id;
          canvas.expand(id);
          if (now() !== was) opened = stack.push(id);
        } else if (kind === "group" && groups.length > 0) {
          const id = pick(groups).id;
          canvas.expand(id);
          if (now() !== was) opened = stack.push(id);
        } else if (kind === "collapse" && top() !== undefined)
          canvas.collapse(stack.pop() as string);
        else if (kind === "focus") {
          const n = pick(shown());
          canvas.focus("entity" in n ? n.entity : "");
        } else {
          canvas.select(pick(shown()).id);
          canvas.groupAroundRoot(true);
        }
      }
      canvas.groupAroundRoot(false);
      for (let id = top(); id !== undefined; id = top()) {
        stack.pop();
        canvas.collapse(id);
      }
      const ids = (e: Settle) => sorted(e.frontier.nodes.map((n) => n.id));
      expect(ids(now())).toBe(ids(base));
      expect(spotsOf(now())).toEqual(spotsOf(base));
      expect(now().state.homes).toEqual(base.state.homes);
      expect(now().state.treeShifts).toEqual(base.state.treeShifts);
      expect(opened).toBeGreaterThan(0);
    },
    120_000,
  );
});
