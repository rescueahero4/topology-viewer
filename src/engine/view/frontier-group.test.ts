import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import {
  canvasColor,
  entityType,
  firstView,
  frontier,
  groupDrawnId,
  hide,
  normalize,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type CanvasState,
  type EntityNode,
  type Frontier,
  type GroupNode,
  type Hex,
  type IconMetrics,
} from "../index";
import { seeded } from "../layout/random";
import { drawnGrouper, topology } from "./group";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "../layout/icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const RUNS = 40;
const STEPS = 25;
const SLOW = 120_000;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-19" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const first = firstView(graph, vocab, payload, hash);
  const act = (s: CanvasState, action: Action) =>
    transition(s, action, graph, vocab);
  const bucket = (s: CanvasState, id: string) => {
    const top = topology(graph, vocab);
    const { drawn } = drawnGrouper(top, s);
    const key = drawn.bucketOf(top.entityOf.get(id) as number);
    return { key, size: key === null ? 0 : drawn.sizeOf(key) };
  };
  return {
    graph,
    vocab,
    view,
    act,
    bucket,
    hide: (s: CanvasState, node: string) =>
      hide(s, { kind: "hide", node }, graph, vocab).state,
    state: setLayout(first, view(first), vocab, first.layout, METRICS),
  };
}

type Run = ReturnType<typeof load>;

const entities = (f: Frontier) =>
  f.nodes.filter((n): n is EntityNode => !("members" in n));
const groups = (f: Frontier) =>
  f.nodes.filter((n): n is GroupNode => "members" in n);
const nodeOf = (f: Frontier, id: string) => f.nodes.find((n) => n.id === id);
const groupOf = (f: Frontier, id: string) =>
  (nodeOf(f, id) as EntityNode).group;

const TABLE = 'g:["tag_pii","taggedWith","<","table"]';
const COLUMN = 'g:["tag_pii","taggedWith","<","column"]';
const ISLAND = 'g:["a3","derivedFrom",">","table"]';
const HOSTILE = 'g:["a\\"]<x","p",">",null]';

function expanded(name: string, group: string) {
  const run = load(loadFixture(name).input);
  return { run, open: run.act(run.state, { kind: "expandGroup", group }) };
}
const star = () => expanded("s-star", TABLE);
const islands = () => expanded("s-islands", ISLAND);

const edge = (predicate: string) => (object: string) => ({
  subject: 'a"]<x',
  predicate,
  object,
});

// why: LEARNINGS 21 — an anchor id with `"`, `]` and `<`, members with no type, a merged entity
// (`m3a`, `m3b`) and a 10,000-character label
const H = {
  nodes: [
    { id: 'a"]<x', type: "hub", label: "HUB" },
    { id: "m1", label: "M" },
    { id: "m2", label: "M2" },
    { id: "m3a", label: "SAME" },
    { id: "m3b", label: "SAME" },
    { id: "ds1", type: "data_source", label: "DS" },
    { id: "t1", type: "table", label: "L".repeat(10_000) },
  ],
  edges: [
    ...["m1", "m2", "m3a", "m3b"].map(edge("p")),
    ...["ds1", "t1"].map(edge("q")),
  ],
  view: { budget: "all" },
};

describe("S1 s-star first view", () => {
  it("draws 4 nodes in order; the entity nodes have no group", () => {
    const { run } = star();
    const f = run.view(run.state);
    expect(f.nodes.map((n) => n.id)).toEqual([
      "e:tag_pii",
      "e:tg_class",
      TABLE,
      COLUMN,
    ]);
    expect(groupOf(f, "e:tag_pii")).toBeNull();
    expect(groupOf(f, "e:tg_class")).toBeNull();
  });
});

describe("S2 s-star after the expand of the table group", () => {
  it("gives each of the 300 members the group id", () => {
    const { run, open } = star();
    const members = (nodeOf(run.view(run.state), TABLE) as GroupNode).members;
    const f = run.view(open);
    expect(f.nodes).toHaveLength(303);
    expect(members).toHaveLength(300);
    for (const id of members) expect(groupOf(f, `e:${id}`)).toBe(TABLE);
    expect(nodeOf(f, "e:t_0")).toStrictEqual({
      id: "e:t_0",
      entity: "t_0",
      type: "table",
      label: "CUSTOMER_EXTRACT_000",
      more: 0,
      opened: 0,
      group: TABLE,
    });
    expect(groupOf(f, "e:tag_pii")).toBeNull();
    expect(groupOf(f, "e:tg_class")).toBeNull();
    expect(nodeOf(f, COLUMN)).toHaveProperty("members");
  });
});

describe("S3 the round trip through the field", () => {
  it("collapses the group of e:t_0 back to the first view", () => {
    const { run, open } = star();
    const group = groupOf(run.view(open), "e:t_0") as string;
    const back = run.act(open, { kind: "collapseGroup", group });
    expect(run.view(back)).toStrictEqual(run.view(run.state));
    expect(back).toStrictEqual(run.state);
  });
});

describe("S4 s-islands: condition (3) and condition (1)", () => {
  it("gives the members the id after the expand", () => {
    const { run, open } = islands();
    const f = run.view(open);
    expect(groupOf(f, "e:a1")).toBe(ISLAND);
    expect(groupOf(f, "e:a2")).toBe(ISLAND);
  });

  it("(a) gives null at grouping 5 while the bucket and the key stay", () => {
    const { run, open } = islands();
    const next = run.act(open, { kind: "grouping", grouping: 5 });
    const f = run.view(next);
    expect(groupOf(f, "e:a1")).toBeNull();
    expect(groupOf(f, "e:a2")).toBeNull();
    expect(groups(f)).toEqual([]);
    expect(next.expandedGroups.map(groupDrawnId)).toContain(ISLAND);
    expect(run.bucket(next, "a1")).toEqual({
      key: ISLAND.slice(2),
      size: 2,
    });
  });

  it("(b) gives e:a2 null after the hide of e:a1, as a2 has no bucket", () => {
    const { run, open } = islands();
    const next = run.hide(open, "e:a1");
    expect(nodeOf(run.view(next), "e:a1")).toBeUndefined();
    expect(groupOf(run.view(next), "e:a2")).toBeNull();
    expect(run.bucket(next, "a2").key).toBeNull();
  });
});

describe("S5 s-star at grouping off", () => {
  it("draws 314 entity nodes with no group while the key stays", () => {
    const { run, open } = star();
    const next = run.act(open, { kind: "grouping", grouping: "off" });
    const f = run.view(next);
    expect(f.nodes).toHaveLength(314);
    expect(groups(f)).toEqual([]);
    for (const node of entities(f)) expect(node.group).toBeNull();
    expect(next.expandedGroups.map(groupDrawnId)).toContain(TABLE);
  });
});

describe("S6 s-islands with the type of the anchor off", () => {
  it("keeps the members drawn with no group, as they have no bucket", () => {
    const { run, open } = islands();
    const next = run.act(open, {
      kind: "toggleType",
      type: "view",
      on: false,
    });
    const f = run.view(next);
    expect(nodeOf(f, "e:a3")).toBeUndefined();
    expect(groupOf(f, "e:a1")).toBeNull();
    expect(groupOf(f, "e:a2")).toBeNull();
    expect(next.expandedGroups.map(groupDrawnId)).toContain(ISLAND);
    expect(run.bucket(next, "a1").key).toBeNull();
    expect(run.bucket(next, "a2").key).toBeNull();
  });
});

describe("S7 the hostile payload H", () => {
  it("gives the escaped group id to the members, and the collapse returns", () => {
    const run = load(H);
    const firstFrontier = run.view(run.state);
    expect(firstFrontier.nodes.map((n) => n.id)).toEqual([
      'e:a"]<x',
      HOSTILE,
      "e:ds1",
      "e:t1",
    ]);
    expect((nodeOf(firstFrontier, HOSTILE) as GroupNode).members).toEqual([
      "m1",
      "m2",
      "m3a",
    ]);
    const open = run.act(run.state, { kind: "expandGroup", group: HOSTILE });
    const f = run.view(open);
    for (const id of ["e:m1", "e:m2", "e:m3a"])
      expect(groupOf(f, id)).toBe(HOSTILE);
    for (const id of ['e:a"]<x', "e:ds1", "e:t1"])
      expect(groupOf(f, id)).toBeNull();
    const group = groupOf(f, "e:m1") as string;
    const back = run.act(open, { kind: "collapseGroup", group });
    expect(run.view(back)).toStrictEqual(firstFrontier);
  });
});

const pick = <T>(list: T[], r: () => number): T | undefined =>
  list[Math.floor(r() * list.length)];

// why: LEARNINGS 26 — a hidden entity, an entity of a type that is off, or a member of a collapsed
// group; else any entity that is not drawn as an entity node
function notDrawn(run: Run, s: CanvasState, f: Frontier): string[] {
  const drawn = new Set(entities(f).map((n) => n.entity));
  const off = new Set(s.filters.typesOff);
  const named = [
    ...groups(f).flatMap((n) => n.members),
    ...s.hidden.flatMap((entry) => entry.members),
    ...run.graph.entities
      .filter((e) => off.has(entityType(run.vocab, e.id)))
      .map((e) => e.id),
  ].filter((id) => !drawn.has(id));
  if (named.length > 0) return named;
  return run.graph.entities.map((e) => e.id).filter((id) => !drawn.has(id));
}

const NODE_KINDS = [
  "explore",
  "collapse",
  "path",
  "hide",
  "hideMany",
  "showMany",
] as const;

function nodeAction(kind: (typeof NODE_KINDS)[number], id: string): Action {
  if (kind === "hide") return { kind, node: `e:${id}` };
  if (kind === "hideMany" || kind === "showMany") return { kind, ids: [id] };
  return { kind, id };
}

const GROUPINGS = [2, 5, 10, "off"] as const;
const BUDGETS = [10, 20, 50, "all"] as const;

function anyAction(run: Run, s: CanvasState, f: Frontier, r: () => number) {
  const all = run.graph.entities.map((e) => e.id);
  const ids = entities(f).map((n) => n.entity);
  const types = [...new Set(entities(f).map((n) => n.type)), null];
  const carried = [...new Set(entities(f).flatMap((n) => n.group ?? []))];
  const choices: (() => Action | undefined)[] = [
    ...NODE_KINDS.map((kind) => () => {
      const id = pick(kind === "path" || kind === "showMany" ? all : ids, r);
      return id === undefined ? undefined : nodeAction(kind, id);
    }),
    () => {
      const group = pick(groups(f), r)?.id;
      return group === undefined ? undefined : { kind: "expandGroup", group };
    },
    () => {
      const group =
        pick(carried, r) ?? pick(s.expandedGroups.map(groupDrawnId), r);
      return group === undefined ? undefined : { kind: "collapseGroup", group };
    },
    () => {
      const key = pick(s.hidden, r)?.key;
      return key === undefined ? undefined : { kind: "restore", keys: [key] };
    },
    () => ({
      kind: "toggleType",
      type: pick(types, r) as string | null,
      on: r() < 0.3,
    }),
    () => ({ kind: "showAllTypes" }),
    () => ({ kind: "grouping", grouping: pick([...GROUPINGS], r) ?? 2 }),
    () => ({ kind: "budget", budget: pick([...BUDGETS], r) ?? 20 }),
    () => ({ kind: "reset" }),
  ];
  return (pick(choices, r) as () => Action | undefined)() ?? { kind: "reset" };
}

// why: S8 — one `collapseGroup` for each distinct group value, not for each member
function checkGroups(run: Run, s: CanvasState, why: string) {
  const f = run.view(s);
  const nodes = entities(f);
  const values = new Set(nodes.flatMap((n) => n.group ?? []));
  for (const G of values) {
    const had = nodes.filter((n) => n.group === G).map((n) => n.entity);
    const back = run.view(run.act(s, { kind: "collapseGroup", group: G }));
    const made = nodeOf(back, G);
    expect(made, `${why}; ${G}`).toHaveProperty("members");
    expect((made as GroupNode).members, `${why}; ${G}`).toEqual(had);
  }
  const free = new Set(
    nodes.filter((n) => n.group === null).map((n) => n.entity),
  );
  for (const K of s.expandedGroups.map(groupDrawnId)) {
    if (values.has(K)) continue;
    const back = run.view(run.act(s, { kind: "collapseGroup", group: K }));
    for (const g of groups(back))
      expect(
        g.members.filter((id) => free.has(id)),
        `${why}; ${K}`,
      ).toEqual([]);
  }
  return values.size;
}

// why: S8 — each fourth step (k = 0, 4, …, 24) is a node action on a node that is not drawn; when
// every entity is drawn, the step hides one drawn entity first and then targets it
function offStep(run: Run, s: CanvasState, r: () => number, log: string[]) {
  let state = s;
  if (notDrawn(run, s, run.view(s)).length === 0) {
    const node = pick(entities(run.view(s)), r) as EntityNode;
    log.push(`hide ${node.id} first`);
    state = run.hide(s, node.id);
  }
  const id = pick(notDrawn(run, state, run.view(state)), r);
  if (id === undefined) return { state, action: null };
  const kind = pick([...NODE_KINDS], r) as (typeof NODE_KINDS)[number];
  return { state, action: nodeAction(kind, id) };
}

function walk(run: Run, seed: number) {
  const r = seeded(seed);
  const log = [`seed ${seed}`];
  let s = run.state;
  let offTarget = 0;
  let checks = 0;
  for (let k = 0; k < STEPS; k++) {
    let action: Action | null = null;
    if (k % 4 === 0) ({ state: s, action } = offStep(run, s, r, log));
    if (action !== null) offTarget++;
    action ??= anyAction(run, s, run.view(s), r);
    log.push(JSON.stringify(action));
    s = run.act(s, action);
    checks += checkGroups(run, s, log.join("; "));
  }
  return { offTarget, checks };
}

describe("S8 random steps keep every group value a round trip", () => {
  it.each(["s-star", "s-islands", "s-access"])(
    "%s: seeds 1 to 40, 25 steps each",
    (name) => {
      const run = load(loadFixture(name).input);
      let offTarget = 0;
      let checks = 0;
      for (let seed = 1; seed <= RUNS; seed++) {
        const one = walk(run, seed);
        offTarget += one.offTarget;
        checks += one.checks;
      }
      expect(offTarget).toBe(RUNS * Math.ceil(STEPS / 4));
      expect(checks).toBeGreaterThan(0);
    },
    SLOW,
  );
});
