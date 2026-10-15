import { describe, expect, it } from "vitest";
import { parseRenderInput } from "../src/index";

type Path = (string | number)[];
type Doc = Record<string, unknown>;

const base: Doc = {
  nodes: [
    { id: "n0", type: "table", label: "N0", attrs: { k: "v" } },
    ["n1", "table", "N1", { k: "v" }],
  ],
  edges: [
    { subject: "n0", predicate: "has", object: "n1", attrs: { k: "v" } },
    ["n0", "has", "n1", { k: "v" }],
  ],
  links: [
    { subject: "n0", predicate: "has", object: "n1", attrs: { k: "v" } },
    ["n0", "has", "n1", { k: "v" }],
  ],
  neighborhood: {
    nodes: [
      { id: "m0", type: "table", label: "M0", attrs: { k: "v" } },
      ["m1", "table", "M1", { k: "v" }],
    ],
    edges: [
      { subject: "m0", predicate: "has", object: "m1", attrs: { k: "v" } },
      ["m0", "has", "m1", { k: "v" }],
    ],
  },
  defaults: { color: "red" },
  types: { t: { label: "T" }, u: { label: "U" } },
  predicates: {
    p: { label: "P", category: "c", inverse: "q", role: "containment" },
    r: { label: "R" },
  },
  fields: { k: { label: "K", slot: "s", why: "w" }, l: { label: "L" } },
  vocabulary: {
    nodeTypes: [{ name: "a", is_active: true }, { name: "b" }],
    predicates: [{ name: "a", inverse_predicate: null }, { name: "b" }],
    edgeConstraints: [
      { predicate: "p", subject_node_type: "a", object_node_type: "b" },
      { predicate: "q" },
    ],
  },
  view: { approach: "active" },
};

type Node = Record<string | number, unknown>;

function set(doc: Doc, path: Path, value: unknown): Doc {
  const copy = structuredClone(doc);
  const parent = path
    .slice(0, -1)
    .reduce<Node>((node, key) => node[key] as Node, copy);
  parent[path[path.length - 1]] = value;
  return copy;
}

function get(doc: unknown, path: Path): unknown {
  return path.reduce<unknown>(
    (node, key) => (node as Node | undefined)?.[key],
    doc,
  );
}

function parsed(raw: unknown) {
  const result = parseRenderInput(raw);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const NODE_LISTS: Path[] = [["nodes"], ["neighborhood", "nodes"]];
const EDGE_LISTS: Path[] = [["edges"], ["links"], ["neighborhood", "edges"]];
const NODE_TEXT = [
  "type",
  "label",
  "physicalName",
  "logicalName",
  "nodeType",
  "globalId",
];
const ROW_KEYS = [
  ["nodeTypes", "name"],
  ["nodeTypes", "description"],
  ["nodeTypes", "category"],
  ["nodeTypes", "inverse_predicate"],
  ["predicates", "name"],
  ["edgeConstraints", "predicate"],
  ["edgeConstraints", "subject_node_type"],
  ["edgeConstraints", "object_node_type"],
];

let counter = 0;
const num = () => 9000 + ++counter;
const word = () => `BAD-${++counter}`;

type Row = { name: string; path: Path; value: unknown };
const rows: Row[] = [];
function add(name: string, path: Path, value: unknown) {
  rows.push({ name: `${name} ${JSON.stringify(path)}`, path, value });
}

for (const list of NODE_LISTS) {
  for (const key of NODE_TEXT) add("node", [...list, 0, key], num());
  add("node", [...list, 0, "isWritable"], word());
  add("node", [...list, 0, "attrs"], word());
  add("node", [...list, 0, "attributes"], word());
  add("node tuple type", [...list, 1, 1], num());
  add("node tuple label", [...list, 1, 2], num());
  add("node tuple attrs", [...list, 1, 3], word());
}
for (const list of EDGE_LISTS) {
  for (const key of ["predicate", "valid_from", "valid_to"])
    add("edge", [...list, 0, key], num());
  add("edge", [...list, 0, "isActive"], word());
  add("edge", [...list, 0, "attrs"], word());
  add("edge tuple attrs", [...list, 1, 3], word());
}
add("types", ["types"], word());
add("types entry", ["types", "t"], word());
add("types label", ["types", "t", "label"], num());
add("predicates", ["predicates"], word());
add("predicates entry", ["predicates", "p"], word());
for (const key of ["label", "category", "inverse"])
  add("predicate", ["predicates", "p", key], num());
add("predicate role", ["predicates", "p", "role"], word());
add("fields", ["fields"], word());
add("fields entry", ["fields", "k"], word());
for (const key of ["label", "slot", "why"])
  add("field", ["fields", "k", key], num());
add("vocabulary", ["vocabulary"], word());
for (const list of ["nodeTypes", "predicates", "edgeConstraints"]) {
  add("vocabulary list", ["vocabulary", list], word());
  add("vocabulary row", ["vocabulary", list, 1], word());
}
for (const [list, key] of ROW_KEYS)
  add("vocabulary field", ["vocabulary", list, 1, key], num());
add("vocabulary field", ["vocabulary", "nodeTypes", 1, "is_system"], word());
add("vocabulary field", ["vocabulary", "nodeTypes", 1, "is_active"], word());
add("defaults", ["defaults"], word());
add("view", ["view"], word());
add("view approach", ["view", "approach"], word());

describe("S35 field-rejected", () => {
  it.each(rows)("bad value at $name", ({ path, value }) => {
    const result = parsed(set(base, path, value));
    const baseline = parsed(set(base, path, undefined));
    expect(result.issues).toEqual([{ code: "field-rejected", path }]);
    expect(baseline.issues).toEqual([]);
    expect(result.data).toEqual(baseline.data);
    expect(get(result.data, path)).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(String(value));
  });

  it("keeps the vocabulary rows next to a dropped row", () => {
    const result = parsed(set(base, ["vocabulary", "nodeTypes", 1], "BAD"));
    expect(result.data.vocabulary?.nodeTypes).toEqual([
      { name: "a", is_active: true },
    ]);
  });

  it("drops only the bad field of a vocabulary row", () => {
    const result = parsed(
      set(base, ["vocabulary", "nodeTypes", 0, "name"], 9999),
    );
    expect(result.data.vocabulary?.nodeTypes).toEqual([
      { is_active: true },
      { name: "b" },
    ]);
  });

  it("returns a tuple with a bad item as an array with that item absent", () => {
    const result = parsed(set(base, ["nodes", 1, 1], 7777));
    const tuple = (result.data.nodes as unknown[])[1] as unknown[];
    expect(tuple).toHaveLength(4);
    expect(tuple[0]).toBe("n1");
    expect(tuple[1]).toBeUndefined();
    expect(JSON.stringify(tuple)).toBe('["n1",null,"N1",{"k":"v"}]');
  });
});

describe("S35 unknown-key", () => {
  const dropped: [string, Doc, Path][] = [
    [
      "types",
      { types: { x: { label: "X", zzz: "ZZZ-1" } } },
      ["types", "x", "zzz"],
    ],
    [
      "predicates",
      { predicates: { p: { label: "P", zzz: "ZZZ-2" } } },
      ["predicates", "p", "zzz"],
    ],
    [
      "fields",
      { fields: { k: { label: "K", zzz: "ZZZ-3" } } },
      ["fields", "k", "zzz"],
    ],
    [
      "shape",
      { shape: { kind: "rows", subject: "a", object: "b", zzz: "ZZZ-4" } },
      ["shape", "zzz"],
    ],
  ];

  it.each(dropped)("drops %s key zzz with one issue", (_name, extra, path) => {
    const result = parsed({ nodes: [{ id: "a" }], ...extra });
    expect(result.issues).toEqual([{ code: "unknown-key", path }]);
    expect(get(result.data, path)).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("ZZZ-");
  });

  it("keeps an unknown node key in attrs, an edge key and a vocabulary key", () => {
    const result = parsed({
      nodes: [{ id: "a", rto_hours: 4 }],
      edges: [{ subject: "a", predicate: "p", object: "a", weight: 2 }],
      vocabulary: { extra: 1, nodeTypes: [{ name: "a", extra: 2 }] },
    });
    expect(result.issues).toEqual([]);
    expect(result.data.nodes?.[0]).toEqual({
      id: "a",
      attrs: { rto_hours: 4 },
    });
    expect(result.data.edges?.[0]).toMatchObject({ weight: 2 });
    expect(result.data.vocabulary).toMatchObject({ extra: 1 });
  });
});
