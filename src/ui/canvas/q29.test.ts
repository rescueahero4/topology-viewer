// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { profile } from "#contract";
import {
  canvasColor,
  firstView,
  frontier,
  normalize,
  place,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type Graph,
  type Hex,
} from "#engine";
import { loadFixture } from "#fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type SceneNode,
} from "#renderer";
import { describe, expect, it, vi } from "vitest";
import { sceneOf } from "./scene";

// why: jsdom has no ResizeObserver; the STORY-003-04 camera observes the root
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
// why: STORY-003-04 — hit paths exist only in a viewport, so the tests stub an 800 × 600 container
HTMLElement.prototype.getBoundingClientRect = () =>
  ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
  }) as DOMRect;

const NOW = "2026-10-19";
const CANVAS = canvasColor("#F4F4F5") as Hex;
const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  tipGroup: (count, typeLabel) => `${count} × ${typeLabel}`,
  tipOpened: (sub) => `${sub} · expanded`,
  tipMore: (sub, more) => `${sub} · ${more} more`,
  tipMember: (sub) => `${sub} · member`,
  tipEdge: (subject, object) => `${subject} → ${object}`,
  tipEdgeAction: (label, muted, count, retired) =>
    `action(${label}, ${muted}, ${count}, ${retired})`,
  bubbleCount: (n: number) => ` · ${n}`,
  lostMark: "lost",
  pillRetired: (label: string) => `${label} (retired)`,
};
const RETIRED = '["e:tbl-orders-archive","derivedFrom","e:tbl-orders"]';
const LOST = "e:t_SF_CONTACT";

// One renderer on one canvas; each step runs an engine action, places it and draws again.
function canvas(input: unknown, edit: (g: Graph) => Graph = (g) => g) {
  const r = normalize(input, { now: NOW });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const graph = edit(r.graph);
  const { vocab } = resolveVocab(graph, r.payload, profile, CANVAS);
  const first = firstView(graph, vocab, r.payload, r.hash);
  let view = frontier(first, graph, vocab);
  let state = setLayout(first, view, vocab, first.layout, iconMetrics);
  const div = document.createElement("div");
  document.body.appendChild(div);
  const renderer = createRenderer(div, { text: TEXT });
  const scene = () =>
    sceneOf({ state, frontier: view, vocab, canvas: CANVAS }, TEXT);
  const draw = () => renderer.draw(scene());
  const act = (action: Action) => {
    const next = transition(state, action, graph, vocab);
    const after = frontier(next, graph, vocab);
    state = place(
      next,
      { action, before: view, after },
      vocab,
      iconMetrics,
    ).state;
    view = after;
    draw();
    return scene();
  };
  const root = () => div.firstElementChild as Element;
  return { scene, draw, act, root };
}

type Canvas = ReturnType<typeof canvas>;
const fixture = (key: string) => canvas(loadFixture(key).input);
const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;
const find = (c: Canvas, selector: string, key: string) =>
  [...c.root().querySelectorAll(selector)].find((el) => {
    const d = datum<{ id?: string; key?: string }>(el);
    return d.id === key || d.key === key;
  }) as Element;
function hover(c: Canvas, selector: string, key: string): string[] {
  find(c, selector, key).dispatchEvent(new MouseEvent("mouseenter"));
  const tip = c.root().querySelector("div.qt-tip") as Element;
  return [...tip.children].map((line) => line.textContent ?? "");
}
const lostIds = (nodes: SceneNode[]) =>
  nodes.filter((n) => n.lost).map((n) => n.id);
const TABLES = [
  { id: "a", type: "table" },
  { id: "b", type: "table" },
];
const ALL = { approach: "passive", budget: "all" };

describe("S5 retired in the scene; one edge with a count", () => {
  it("q-full-vocabulary: SceneEdge.retired on the retired key only", () => {
    const edges = fixture("q-full-vocabulary").scene().edges;
    expect(edges).toHaveLength(25);
    expect(edges.filter((e) => e.retired).map((e) => e.key)).toEqual([RETIRED]);
  });

  it("the S2 graph: one path.qt-edge, and the tooltip gives count 2 and retired", () => {
    const c = canvas({
      nodes: TABLES,
      edges: [
        {
          subject: "a",
          predicate: "p",
          object: "b",
          attrs: { n: 1 },
          isActive: false,
        },
        { subject: "a", predicate: "p", object: "b", attrs: { n: 2 } },
      ],
      view: ALL,
    });
    c.draw();
    const edge = c.scene().edges[0];
    expect(c.root().querySelectorAll("path.qt-edge")).toHaveLength(1);
    expect(edge).toMatchObject({ count: 2, retired: true });
    const sub = hover(c, "path.qt-ehit", edge.key)[1];
    expect(sub).toBe(TEXT.tipEdgeAction(edge.label, false, 2, true));
  });
});

describe("S6 lost in the scene", () => {
  it("s-vague and s-badroot: only e:t_SF_CONTACT", () => {
    for (const key of ["s-vague", "s-badroot"])
      expect(lostIds(fixture(key).scene().nodes)).toEqual([LOST]);
  });

  it("only the boolean true of is_lost sets it", () => {
    const forms = [true, "true", 1, null, undefined];
    const nodes = forms.map((v, i) => ({
      id: `x${i}`,
      type: "table",
      label: `X${i}`,
      attrs: v === undefined ? {} : { is_lost: v },
    }));
    expect(lostIds(canvas({ nodes, view: ALL }).scene().nodes)).toEqual([
      "e:x0",
    ]);
  });

  it("a merged entity with one lost record and one that is not lost", () => {
    const input = {
      nodes: [
        { id: "t1", type: "table", label: "T" },
        { id: "t2", type: "table", label: "T" },
      ],
      view: ALL,
    };
    // why: equal attributes are part of the merge key, so the lost record is set after the merge
    const c = canvas(input, (g) => ({
      ...g,
      records: g.records.map((r) =>
        r.id === "t2" ? { ...r, attrs: { is_lost: true } } : r,
      ),
    }));
    const nodes = c.scene().nodes;
    expect(nodes).toHaveLength(1);
    expect(lostIds(nodes)).toEqual(["e:t1"]);
  });

  it("s-lineage: the newcomer of the third explore has it, and no other node", () => {
    const c = fixture("s-lineage");
    const first = c.scene().nodes;
    expect(first).toHaveLength(7);
    expect(first.map((n) => n.id)).not.toContain(LOST);
    const steps = ["t_STG_ACCOUNTS", "t_SF_ACCOUNT", "sc_SALESFORCE"].map(
      (id) => c.act({ kind: "explore", id }).nodes,
    );
    for (const nodes of steps.slice(0, 2)) {
      expect(nodes.map((n) => n.id)).not.toContain(LOST);
      expect(lostIds(nodes)).toEqual([]);
    }
    expect(lostIds(steps[2])).toEqual([LOST]);
  });

  it("a group node has lost false, also when its members are lost", () => {
    const columns = ["c1", "c2", "c3"];
    const c = canvas({
      nodes: [
        { id: "h", type: "table" },
        ...columns.map((id) => ({
          id,
          type: "column",
          attrs: { is_lost: true },
        })),
      ],
      edges: columns.map((id) => ["h", "contains", id]),
      view: { approach: "passive", budget: 20 },
    });
    const group = c.scene().nodes.find((n) => n.kind === "group");
    expect(group?.lost).toBe(false);
  });
});

describe("S8 the group label, sub and tooltip", () => {
  const TYPE = "Very long custom type label ab";
  const c = canvas({
    nodes: [
      { id: "h", type: "table", attrs: { service_name: "s".repeat(40) } },
      { id: "w1", type: "widget" },
      { id: "w2", type: "widget" },
      { id: "w3", type: "widget" },
      { id: "n", type: "table", label: "abcdefghijklmnopqrstuvwxyz" },
    ],
    edges: [
      ["h", "contains", "w1"],
      ["h", "contains", "w2"],
      ["h", "contains", "w3"],
      ["h", "contains", "n"],
    ],
    types: { widget: { label: TYPE } },
    view: { approach: "passive", budget: 20 },
  });
  c.draw();
  const nodes = c.scene().nodes;

  it("cuts a group label of more than 22 clusters with the same rule", () => {
    expect(TYPE).toHaveLength(30);
    const group = nodes.find((n) => n.kind === "group");
    expect(group?.fullLabel).toBe(`3 ${TYPE}`);
    expect(group?.label).toBe("3 Very long cu…abel ab");
  });

  it("never cuts sub; fullLabel and the tooltip main line are whole", () => {
    const h = nodes.find((n) => n.id === "e:h");
    expect(h?.sub).toBe(`S${"s".repeat(39)} · Table`);
    const n = nodes.find((x) => x.id === "e:n") as SceneNode;
    expect(n.label).toBe("abcdefghijklmn…tuvwxyz");
    expect(n.fullLabel).toBe("abcdefghijklmnopqrstuvwxyz");
    expect(hover(c, "g.qt-node", "e:n")[0]).toBe(n.fullLabel);
  });
});
