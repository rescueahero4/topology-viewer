import { profile, type Profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize, type Graph } from "../data/normalize";
import { canvasColor, type Hex } from "./colors";
import {
  containerPath,
  entitySlots,
  resolveVocab,
  type Vocab,
} from "./resolve";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function resolved(input: unknown, source: Profile = profile) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return resolveVocab(result.graph, result.payload, source, LIGHT).vocab;
}

function slot(vocab: Vocab, id: string, name: string) {
  const found = entitySlots(vocab, id)?.slots.find((s) => s.slot === name);
  if (found === undefined) throw new Error(`no slot ${name} on ${id}`);
  return found.entries;
}

const values = (vocab: Vocab, id: string, name: string) =>
  slot(vocab, id, name).map((entry) => entry.value);
const catalog = (vocab: Vocab, id: string) => entitySlots(vocab, id)?.isCatalog;
const table = (attrs: object, extra: object = {}) =>
  resolved({
    nodes: [{ id: "t", type: "table", label: "T", attrs }],
    ...extra,
  });

describe("S20 one slot from four sources", () => {
  it("reads physical_name, physicalName, table_name and a fields mapping", () => {
    for (const key of ["physical_name", "physicalName", "table_name"])
      expect(slot(table({ [key]: "P" }), "t", "physical_name")).toEqual([
        { value: "P", from: `attribute ${key}` },
      ]);
    const mapped = table(
      { x: "P" },
      { fields: { x: { slot: "physical_name" } } },
    );
    expect(slot(mapped, "t", "physical_name")).toEqual([
      { value: "P", from: "attribute x", mapped: "" },
    ]);
  });
});

describe("S21 the 13 slots in order", () => {
  it("lists the FR-INSPECT-4 order", () => {
    expect(entitySlots(table({}), "t")?.slots.map((s) => s.slot)).toEqual([
      "physical_name",
      "logical_name",
      "description",
      "owners",
      "tags",
      "path",
      "data_source",
      "parent_owners",
      "data_type",
      "ddl_comment",
      "asset_groups",
      "updated",
      "link",
    ]);
    expect(entitySlots(table({}), "nobody")).toBeNull();
  });
});

describe("S22 native, then edge, then AI", () => {
  it("orders the Owners entries", () => {
    const vocab = resolved({
      nodes: [
        {
          id: "t",
          type: "table",
          attrs: { owner: "Bob", steward_email: "s@acme.example" },
        },
        { id: "u", type: "user", label: "Aiko" },
      ],
      edges: [{ subject: "t", predicate: "ownedBy", object: "u" }],
      fields: { steward_email: { slot: "owners", why: "w" } },
    });
    expect(slot(vocab, "t", "owners")).toEqual([
      { value: "Bob", from: "attribute owner" },
      { value: "Aiko", from: "ownedBy" },
      { value: "s@acme.example", from: "attribute steward_email", mapped: "w" },
    ]);
  });
});

describe("S23 s-vocab-meta, entity tb", () => {
  const vocab = resolved(loadFixture("s-vocab-meta").input);

  it("fills the catalog slots", () => {
    expect(slot(vocab, "tb", "owners")).toEqual([
      { value: "Aiko Tanaka", from: "ownedBy" },
      {
        value: "mika.sato@acme.example",
        from: "attribute steward_email",
        mapped: "An e-mail of the person responsible reads as the steward",
      },
    ]);
    expect(slot(vocab, "tb", "logical_name")).toEqual([
      {
        value: "Customer invoices",
        from: "attribute display_name",
        inferred: "Named from the table and its schema",
      },
    ]);
    expect(slot(vocab, "tb", "ddl_comment")).toEqual([
      {
        value: "one row per issued invoice",
        from: "attribute comment_on_ddl",
        external: true,
      },
    ]);
    expect(values(vocab, "tb", "path")).toEqual([
      ["BigQuery · acme-dw", "acme-dw", "finance", "invoices"],
    ]);
    expect(slot(vocab, "tb", "data_source")).toEqual([
      { value: "BigQuery · acme-dw", from: "derive source" },
      { value: "bigquery", from: "attribute service_name" },
    ]);
    expect(slot(vocab, "tb", "parent_owners")).toEqual([]);
    const all = entitySlots(vocab, "tb")?.slots.flatMap((s) => s.entries) ?? [];
    expect(all.some((e) => /rto_hours|pii_level/.test(e.from))).toBe(false);
    expect(catalog(vocab, "tb")).toBe(true);
  });
});

describe("S24 a late key with no container", () => {
  it("reads service_name and is not a catalog node", () => {
    const vocab = table({ service_name: "snowflake" });
    expect(slot(vocab, "t", "data_source")).toEqual([
      { value: "snowflake", from: "attribute service_name" },
    ]);
    expect(catalog(vocab, "t")).toBe(false);
  });
});

describe("S25 every record of a merged entity", () => {
  it("reads Tags and Description from record 2", () => {
    // why: equal attributes are part of the merge key, so the merged entity is built by hand
    const record = (id: string, attrs: Record<string, unknown>) => ({
      id,
      type: "table",
      label: "T",
      attrs,
      idSource: "id" as const,
      inferred: {},
      position: 0,
    });
    const graph: Graph = {
      records: [
        record("r1", {}),
        record("r2", { description: "d2" }),
        record("g", {}),
      ],
      entities: [
        { id: "r1", type: "table", label: "T", records: ["r1", "r2"] },
        { id: "g", type: "tag", label: "Gold", records: ["g"] },
      ],
      triples: [
        {
          key: '["r1","taggedWith","g"]',
          subject: "r1",
          predicate: "taggedWith",
          object: "g",
          attrs: {},
          retired: false,
          records: [1],
        },
      ],
      shapedSet: { records: [], triples: [] },
    };
    const { vocab } = resolveVocab(graph, {}, profile, LIGHT);
    expect(slot(vocab, "r1", "description")).toEqual([
      { value: "d2", from: "attribute description" },
    ]);
    expect(slot(vocab, "r1", "tags")).toEqual([
      { value: "Gold", from: "taggedWith" },
    ]);
  });

  it("(b) reads the Tags of an edge sent from record 2, through normalize", () => {
    const vocab = resolved({
      nodes: [
        { id: "r1", type: "table", label: "T", attrs: { owner: "Bob" } },
        { id: "r2", type: "table", label: "T", attrs: { owner: "Bob" } },
        { id: "g", type: "tag", label: "Gold" },
      ],
      edges: [{ subject: "r2", predicate: "taggedWith", object: "g" }],
    });
    expect(entitySlots(vocab, "r2")).toBeNull();
    expect(slot(vocab, "r1", "tags")).toEqual([
      { value: "Gold", from: "taggedWith" },
    ]);
  });
});

describe("S26 unknown slots and plain strings", () => {
  it("ignores an unknown slot and keeps markup byte-equal", () => {
    const vocab = resolved({
      nodes: [
        {
          id: "t",
          type: "table",
          attrs: { x: "1", y: "2" },
          _inferred: { y: "<u>r</u>" },
        },
      ],
      fields: {
        x: { slot: "no-such-slot" },
        y: { label: "<b>RTO</b>", why: "<i>w</i>", slot: "description" },
      },
    });
    const all = entitySlots(vocab, "t")?.slots.flatMap((s) => s.entries) ?? [];
    expect(all.some((e) => e.from === "attribute x")).toBe(false);
    expect(slot(vocab, "t", "description")).toEqual([
      {
        value: "2",
        from: "attribute y",
        inferred: "<u>r</u>",
        mapped: "<i>w</i>",
      },
    ]);
  });
});

describe("S27 broad aliases for asset types only", () => {
  const vocab = resolved({
    nodes: [
      {
        id: "u",
        type: "user",
        attrs: { title: "Data Engineer", labels: ["ops"] },
      },
      { id: "t", type: "table", attrs: { title: "Sales", labels: ["fin"] } },
      { id: "x", type: "asset_x", attrs: { title: "X" } },
    ],
    types: { asset_x: { role: "structure" } },
  });

  it("reads title and labels on table and asset_x, not on user", () => {
    expect(slot(vocab, "u", "logical_name")).toEqual([]);
    expect(slot(vocab, "u", "tags")).toEqual([]);
    expect(catalog(vocab, "u")).toBe(false);
    expect(values(vocab, "t", "logical_name")).toEqual(["Sales"]);
    expect(slot(vocab, "t", "tags")).toEqual([
      { value: "fin", from: "attribute labels" },
    ]);
    expect(values(vocab, "x", "logical_name")).toEqual(["X"]);
    expect(vocab.types.get("asset_x")?.treeRole).toBe("structure");
  });

  it("takes the 10 asset types from the profile", () => {
    const structure = Object.entries(profile.nodeTypes)
      .filter(([, entry]) => entry.treeRole === "structure")
      .map(([name]) => name)
      .sort();
    expect(structure).toEqual([
      "bigroup",
      "column",
      "dashboard",
      "data_source",
      "database",
      "etl",
      "report",
      "schema",
      "table",
      "view",
    ]);
  });
});

describe("S28 containerPath of namesakes", () => {
  it("gives the chain of each column", () => {
    const vocab = resolved({
      nodes: [
        { id: "dw", type: "database", label: "dw" },
        { id: "s", type: "schema", label: "sales" },
        { id: "o", type: "table", label: "ORDERS" },
        { id: "c", type: "table", label: "CUSTOMERS" },
        { id: "c1", type: "column", label: "ID" },
        { id: "c2", type: "column", label: "ID" },
      ],
      edges: [
        ["dw", "contains", "s"],
        ["s", "contains", "o"],
        ["s", "contains", "c"],
        ["o", "contains", "c1"],
        ["c2", "partOf", "c"],
      ],
    });
    expect(containerPath(vocab, "c1")).toEqual(["dw", "sales", "ORDERS"]);
    expect(containerPath(vocab, "c2")).toEqual(["dw", "sales", "CUSTOMERS"]);
    expect(containerPath(vocab, "dw")).toEqual([]);
    expect(containerPath(vocab, "nobody")).toEqual([]);
  });
});
