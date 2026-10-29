import { profile } from "@qdic-topology/contract";
import { datasets, fixtures, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { seeded } from "../layout/random";
import {
  applyEdits,
  canvasColor,
  normalize,
  resolveVocab,
  type CellChange,
  type Edit,
  type EditColumn,
  type Graph,
  type Hex,
  type NodeRecord,
  type RowRef,
  type Triple,
} from "../index";

const NOW = "2026-10-14";
const LIGHT = canvasColor("#F4F4F5") as Hex;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function graphOf(input: unknown): Graph {
  const result = normalize(input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return deepFreeze(result.graph);
}

const change = (
  row: RowRef,
  column: EditColumn,
  after: unknown,
): CellChange => ({ row, column, before: undefined, after });

const edit = (...changes: CellChange[]): Edit => ({
  changes,
  effect: { drew: [], undrew: [] },
});

const apply = (base: Graph, ...edits: Edit[]) => applyEdits(base, edits, NOW);

const keyOf = (...parts: (string | number)[]) => JSON.stringify(parts);

const catalog = () => graphOf(structuredClone(datasets.catalog.graph));

const vocabOf = (graph: Graph) => resolveVocab(graph, {}, profile, LIGHT).vocab;

describe("S1 no edit gives the base graph", () => {
  const keys = Object.keys(fixtures).filter(
    (key) => normalize(loadFixture(key).input, { now: NOW }).ok,
  );

  it.each(keys)("%s", (key) => {
    const base = graphOf(loadFixture(key).input);
    expect(apply(base)).toEqual(base);
  });
});

describe("S2 and S3 merged records keep one entity", () => {
  const base = graphOf(loadFixture("s-merge-namesakes").input);
  const entity = base.entities.find((e) => e.records.includes("t_orders_a"));
  const a = edit(change({ record: "t_orders_a" }, "name", "ORDERS_EU"));
  const b = edit(change({ record: "t_orders_b" }, "name", "ORDERS_US"));
  const label = (graph: Graph, id: string) =>
    graph.records.find((record) => record.id === id)?.label;
  const entityOf = (graph: Graph) =>
    graph.entities.find((e) => e.id === entity?.id);

  it("S2 changes the record and the entity, not the membership", () => {
    expect(entity?.records).toContain("t_orders_b");
    const result = apply(base, a);
    expect(label(result, "t_orders_a")).toBe("ORDERS_EU");
    expect(label(result, "t_orders_b")).toBe("ORDERS");
    expect(entityOf(result)?.label).toBe("ORDERS_EU");
    expect(result.entities.map((e) => e.records)).toEqual(
      base.entities.map((e) => e.records),
    );
  });

  it("S3 gives the entity the newest saved name", () => {
    expect(entityOf(apply(base, a, b))?.label).toBe("ORDERS_US");
    expect(entityOf(apply(base, a))?.label).toBe("ORDERS_EU");
  });
});

describe("S4 Kind to a system type, then to a free-text type", () => {
  it("changes the record and entity type and resolves the provenance", () => {
    const base = catalog();
    const record = base.records.find((item) => item.type === "table");
    if (record === undefined) throw new Error("no table record");
    const entity = base.entities.find((e) => e.records.includes(record.id));
    const kind = (type: string) =>
      edit(change({ record: record.id }, "kind", type));
    const view = apply(base, kind("view"));
    const custom = apply(base, kind("view"), kind("data_contract"));
    for (const [graph, type, provenance] of [
      [view, "view", "system"],
      [custom, "data_contract", "custom"],
    ] as const) {
      expect(graph.records.find((r) => r.id === record.id)?.type).toBe(type);
      expect(graph.entities.find((e) => e.id === entity?.id)?.type).toBe(type);
      const vocab = vocabOf(graph);
      expect(vocab.types.get(type)?.provenance).toBe(provenance);
      expect(vocab.entities.get(entity?.id ?? "")?.type).toBe(type);
    }
  });
});

describe("S5 Predicate and edge Name edits", () => {
  it("edits the predicate and changes only the edited keys", () => {
    const base = catalog();
    const at = base.triples
      .map((triple, index) => ({ triple, index }))
      .filter(({ triple }) => triple.predicate === "contains");
    const [first, second] = at;
    const result = apply(
      base,
      edit(change({ triple: first.triple.key }, "predicate", "reviewedBy")),
      edit(change({ triple: second.triple.key }, "name", "derivedFrom")),
    );
    expect(result.triples[first.index].predicate).toBe("reviewedBy");
    expect(result.triples[second.index].predicate).toBe("derivedFrom");
    const predicate = vocabOf(result).predicates.get("reviewedBy");
    expect(predicate?.provenance).toBe("custom");
    expect(predicate?.family).toBe("Custom");
    expect(result.triples[first.index].key).not.toBe(first.triple.key);
    result.triples.forEach((triple, index) => {
      if (index !== first.index && index !== second.index)
        expect(triple.key).toBe(base.triples[index].key);
    });
  });

  it("removes the AI reason of an edited predicate (rule 13)", () => {
    const plain = graphOf({
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [{ subject: "A", predicate: "contains", object: "B" }],
    });
    const base = deepFreeze({
      ...plain,
      triples: [{ ...plain.triples[0], inferred: { predicate: "shaped" } }],
    });
    const result = apply(
      base,
      edit(change({ triple: base.triples[0].key }, "predicate", "dependsOn")),
    );
    expect(result.triples[0].inferred?.predicate).toBeUndefined();
    expect(base.triples[0].inferred?.predicate).toBe("shaped");
  });
});

describe("S6 a moved triple takes the first free variant", () => {
  it("keeps both triples with unique keys", () => {
    const base = graphOf({
      nodes: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }],
      edges: [
        { subject: "A", predicate: "contains", object: "B" },
        { subject: "C", predicate: "contains", object: "D" },
      ],
    });
    const row = { triple: base.triples[1].key };
    const result = apply(
      base,
      edit(change(row, "subject", "A")),
      edit(change(row, "object", "B")),
    );
    expect(result.triples.map((t) => t.key)).toEqual([
      keyOf("A", "contains", "B"),
      keyOf("A", "contains", "B", 1),
    ]);
    expect(result.triples.map((t) => t.records)).toEqual(
      base.triples.map((t) => t.records),
    );
  });
});

describe("S7 the retired look follows the facts", () => {
  const base = graphOf(loadFixture("q-full-vocabulary").input);
  const index = base.triples.findIndex(
    (t) => t.isActive === true && t.validTo === undefined,
  );
  const row = { triple: base.triples[index].key };
  const fact = (key: string, after: unknown) =>
    edit(change(row, { fact: key }, after));

  it("computes `retired` again with `now`", () => {
    expect(base.triples[index].retired).toBe(false);
    const off = apply(base, fact("isActive", false)).triples[index];
    expect(off.retired).toBe(true);
    const past = apply(base, fact("valid_to", "2020-01-01")).triples[index];
    expect(past.retired).toBe(true);
    const cleared = apply(
      base,
      fact("valid_to", "2020-01-01"),
      fact("valid_to", undefined),
    ).triples[index];
    expect(cleared.retired).toBe(base.triples[index].retired);
    expect(Object.hasOwn(cleared, "validTo")).toBe(false);
  });
});

describe("S8 and S9 clear and fill attribute cells", () => {
  const base = catalog();
  const record = base.records.find(
    (r) =>
      Object.hasOwn(r.attrs, "service_name") &&
      Object.hasOwn(r.attrs, "description") &&
      Object.hasOwn(r.attrs, "asset_type"),
  );
  if (record === undefined) throw new Error("no record");
  const row = { record: record.id };
  const attrsOf = (graph: Graph, id: string) =>
    graph.records.find((r) => r.id === id)?.attrs ?? {};

  it("S8 removes each cleared key", () => {
    const edits = [
      edit(change(row, "system", undefined)),
      edit(change(row, "description", undefined)),
      edit(change(row, { attr: "asset_type" }, undefined)),
    ];
    ["service_name", "description", "asset_type"].forEach((key, at) => {
      const attrs = attrsOf(apply(base, ...edits.slice(0, at + 1)), record.id);
      expect(Object.hasOwn(attrs, key)).toBe(false);
    });
  });

  it("S9 adds a key to an empty cell and removes the AI reason", () => {
    const empty = base.records.find(
      (r) => !Object.hasOwn(r.attrs, "description"),
    );
    if (empty === undefined) throw new Error("no record");
    const added = attrsOf(
      apply(
        base,
        edit(change({ record: empty.id }, "description", "New text")),
      ),
      empty.id,
    );
    expect(Object.getOwnPropertyDescriptor(added, "description")?.value).toBe(
      "New text",
    );
    const id = "t_DIM_CUSTOMER";
    const marked = base.records.find((r) => r.id === id);
    expect(Object.hasOwn(marked?.inferred ?? {}, "description")).toBe(true);
    const result = apply(
      base,
      edit(change({ record: id }, "description", "x")),
    );
    const after = result.records.find((r) => r.id === id);
    expect(Object.hasOwn(after?.inferred ?? {}, "description")).toBe(false);
    expect(Object.hasOwn(after?.inferred ?? {}, "logical_name")).toBe(true);
    expect(Object.hasOwn(marked?.inferred ?? {}, "description")).toBe(true);
  });

  it("S9 gives a `null` attribute the text (rule 12)", () => {
    const small = graphOf({ nodes: [{ id: "A", attrs: { note: null } }] });
    const result = apply(
      small,
      edit(change({ record: "A" }, { attr: "note" }, "New text")),
    );
    expect(result.records[0].attrs).toEqual({ note: "New text" });
  });
});

const scalar = (value: unknown) => typeof value !== "object" || value === null;

function columnsOf(item: NodeRecord | Triple): EditColumn[] {
  const keys = Object.keys(item.attrs).filter((k) => scalar(item.attrs[k]));
  if ("label" in item)
    return [
      ...(["kind", "name", "system", "description"] as const),
      ...keys.map((attr) => ({ attr })),
    ];
  return [
    ...(["name", "predicate", "subject", "object"] as const),
    ...["isActive", "valid_from", "valid_to", ...keys].map((fact) => ({
      fact,
    })),
  ];
}

// why: NF-3 — a seeded generator, so every run gives the same edit list
function randomEdits(base: Graph, seed: number, count: number): Edit[] {
  const random = seeded(seed);
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(random() * list.length)];
  const entities = base.entities.map((entity) => entity.id);
  const valueFor = (column: EditColumn, step: number): unknown => {
    if (column === "subject" || column === "object") return pick(entities);
    if (typeof column === "string")
      return ["system", "description"].includes(column) && random() < 0.3
        ? undefined
        : `v${step}`;
    const fact = "fact" in column ? column.fact : "";
    if (fact === "isActive") return pick([true, false, undefined]);
    if (fact === "valid_from" || fact === "valid_to")
      return pick(["2020-01-01", "2030-12-31", undefined]);
    return pick([`v${step}`, step, true, undefined]);
  };
  return Array.from({ length: count }, (_, step) => {
    const node = base.triples.length === 0 || random() < 0.5;
    const item = node ? pick(base.records) : pick(base.triples);
    const row = "label" in item ? { record: item.id } : { triple: item.key };
    const column = pick(columnsOf(item));
    return edit(change(row, column, valueFor(column, step)));
  });
}

describe("S10 the row order and count stay", () => {
  it("keeps index i as the row of index i in the base", () => {
    const base = catalog();
    const result = apply(base, ...randomEdits(base, 10, 20));
    expect(result.records.map((r) => r.id)).toEqual(
      base.records.map((r) => r.id),
    );
    expect(result.triples.map((t) => t.records)).toEqual(
      base.triples.map((t) => t.records),
    );
  });
});

describe("S19 a base variant pair", () => {
  it("re-keys only the edited triple, also in `shapedSet.triples`", () => {
    const plain = graphOf({
      nodes: [{ id: "A" }, { id: "B" }],
      edges: [
        { subject: "A", predicate: "p", object: "B" },
        { subject: "A", predicate: "p", object: "B", attrs: { x: 1 } },
      ],
    });
    const keys = plain.triples.map((t) => t.key);
    expect(keys).toEqual([keyOf("A", "p", "B"), keyOf("A", "p", "B", 1)]);
    const base = deepFreeze({
      ...plain,
      shapedSet: { records: [], triples: keys },
    });
    const result = apply(
      base,
      edit(change({ triple: keys[0] }, "predicate", "q")),
    );
    const edited = [keyOf("A", "q", "B"), keyOf("A", "p", "B", 1)];
    expect(result.triples.map((t) => t.key)).toEqual(edited);
    expect(result.shapedSet.triples).toEqual(edited);
  });
});

describe("S20 a column that the row cannot edit is a programmer error", () => {
  const base = catalog();
  const node = { record: base.records[0].id };
  const edge = { triple: base.triples[0].key };
  const listed = base.records.find((r) => Object.hasOwn(r.attrs, "owners"));
  const cases: [string, RowRef, EditColumn][] = [
    ["(a) kind on an edge row", edge, "kind"],
    ["(b) subject on a node row", node, "subject"],
    ["(c) id on a node row", node, "id"],
    ["(c) id on an edge row", edge, "id"],
    ["(d) family on an edge row", edge, "family"],
    ["attribute on an edge row", edge, { attr: "x" }],
    ["fact on a node row", node, { fact: "x" }],
    ["list attribute", { record: listed?.id ?? "" }, { attr: "owners" }],
  ];

  it.each(cases)("%s throws", (_, row, column) => {
    expect(() => apply(base, edit(change(row, column, "x")))).toThrow();
  });
});
