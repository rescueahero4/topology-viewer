import { profile, type Profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, type Hex } from "./colors";
import { entitySlots, resolveVocab, type Vocab } from "./resolve";

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

describe("S35 notYetIncluded aliases", () => {
  it("reads each alias once, after the slot keys", () => {
    const vocab = table({
      description: "a",
      ext_description: "b",
      comment_on_ddl: "c",
      data_source_id: "d9",
      ext_name: "e",
      stats_size: 10,
    });
    expect(values(vocab, "t", "description")).toEqual(["a", "b"]);
    expect(values(vocab, "t", "ddl_comment")).toEqual(["c"]);
    expect(slot(vocab, "t", "data_source")).toEqual([
      { value: "d9", from: "attribute data_source_id" },
    ]);
    const all = entitySlots(vocab, "t")?.slots.flatMap((s) => s.entries) ?? [];
    expect(all.some((e) => /ext_name|stats_size/.test(e.from))).toBe(false);
  });
});

describe("S36 data source by tree level 0", () => {
  const chain = (top: object, extra: object = {}) =>
    resolved({
      nodes: [
        top,
        { id: "s", type: "schema" },
        { id: "t", type: "table" },
        { id: "c", type: "column" },
      ],
      edges: [
        ["top", "contains", "s"],
        ["s", "contains", "t"],
        ["t", "contains", "c"],
      ],
      ...extra,
    });

  it("reads the level, not the type name", () => {
    expect(
      slot(chain({ id: "top", type: "database" }), "c", "data_source"),
    ).toEqual([]);
    const level0 = chain(
      { id: "top", type: "svc", label: "Svc" },
      { types: { svc: { level: 0 } } },
    );
    expect(slot(level0, "c", "data_source")).toEqual([
      { value: "Svc", from: "derive source" },
    ]);
    expect(level0.types.get("svc")?.level).toBe(0);
    const level1 = chain(
      { id: "top", type: "svc", label: "Svc" },
      { types: { svc: { level: 1 } } },
    );
    expect(slot(level1, "c", "data_source")).toEqual([]);
    expect(level1.types.get("svc")?.level).toBe(1);
  });
});

describe("S37 definition stays an attribute", () => {
  it("fills no slot from definition", () => {
    const vocab = resolved(loadFixture("s-extend").input);
    expect(slot(vocab, "kw_arr", "description")).toEqual([]);
    const all =
      entitySlots(vocab, "kw_arr")?.slots.flatMap((s) => s.entries) ?? [];
    expect(all.some((e) => e.from === "attribute definition")).toBe(false);
    expect(slot(vocab, "kw_arr", "physical_name")).toEqual([
      { value: "ARR", from: "attribute name" },
    ]);
  });
});

describe("S38 steward keys", () => {
  it("fills Owners only through a fields mapping", () => {
    const attrs = { steward: "Ken", stewards: ["Lee"] };
    expect(slot(table(attrs), "t", "owners")).toEqual([]);
    const mapped = table(attrs, {
      fields: { steward: { slot: "owners", why: "w" } },
    });
    expect(slot(mapped, "t", "owners")).toEqual([
      { value: "Ken", from: "attribute steward", mapped: "w" },
    ]);
  });
});

describe("S39 asset groups by object type", () => {
  it("takes groupedIn only to an asset_group", () => {
    const vocab = resolved(loadFixture("q-full-vocabulary").input);
    expect(slot(vocab, "tbl-orders", "asset_groups")).toEqual([
      { value: "Finance assets", from: "groupedIn" },
    ]);
    expect(slot(vocab, "tag-pii", "asset_groups")).toEqual([]);
    expect(slot(vocab, "prop-retention-days", "asset_groups")).toEqual([]);
  });
});

describe("S40 parent owners", () => {
  const { input } = loadFixture("s-vocab-meta");

  it("reads the ownedBy owners of the nearest container", () => {
    const vocab = resolved(input);
    expect(slot(vocab, "cl", "parent_owners")).toEqual([
      { value: "Aiko Tanaka", from: "derive parent-owners" },
    ]);
    expect(slot(vocab, "cl", "owners")).toEqual([]);
    expect(slot(vocab, "tb", "parent_owners")).toEqual([]);
    expect(slot(vocab, "ds", "parent_owners")).toEqual([]);
  });

  it("puts the native key first", () => {
    const data = structuredClone(input) as {
      nodes: { id: string; attrs?: object }[];
    };
    const cl = data.nodes.find((node) => node.id === "cl");
    if (cl) cl.attrs = { ...cl.attrs, parent_owners: "Ops" };
    expect(slot(resolved(data), "cl", "parent_owners")).toEqual([
      { value: "Ops", from: "attribute parent_owners" },
      { value: "Aiko Tanaka", from: "derive parent-owners" },
    ]);
  });
});

describe("S43 strong and labelFallback from the profile", () => {
  const input = structuredClone(loadFixture("s-vocab-meta").input) as {
    nodes: object[];
  };
  input.nodes.push({ id: "t9", type: "table", label: "Nine" });
  const without = (flag: "strong" | "labelFallback") => {
    const test = structuredClone(profile);
    for (const spec of test.slots) delete spec[flag];
    return resolved(input, test);
  };

  it("(a) the delivered profile", () => {
    const vocab = resolved(input);
    expect(catalog(vocab, "tb")).toBe(true);
    expect(slot(vocab, "t9", "physical_name")).toEqual([
      { value: "Nine", from: "label" },
    ]);
  });

  it("(b) no strong flag and (c) no labelFallback flag", () => {
    expect(catalog(without("strong"), "tb")).toBe(false);
    expect(slot(without("labelFallback"), "t9", "physical_name")).toEqual([]);
  });
});

describe("S45 empty labels give no entry", () => {
  it('drops the value "" from every label step', () => {
    const vocab = resolved({
      nodes: [
        { id: "ds", type: "data_source", label: "" },
        { id: "db", type: "database", label: "DB" },
        { id: "t", type: "table", label: "" },
        { id: "c", type: "column", label: "C" },
        { id: "u", type: "user", label: "" },
      ],
      edges: [
        ["ds", "contains", "db"],
        ["db", "contains", "t"],
        ["t", "contains", "c"],
        ["t", "ownedBy", "u"],
        ["c", "ownedBy", "u"],
      ],
    });
    expect(slot(vocab, "t", "physical_name")).toEqual([]);
    expect(slot(vocab, "t", "owners")).toEqual([]);
    expect(slot(vocab, "t", "data_source")).toEqual([]);
    expect(slot(vocab, "c", "parent_owners")).toEqual([]);
    expect(slot(vocab, "c", "data_source")).toEqual([]);
    const all = [...vocab.entities.keys()].flatMap(
      (id) => entitySlots(vocab, id)?.slots.flatMap((s) => s.entries) ?? [],
    );
    expect(all.some((entry) => entry.value === "")).toBe(false);
    expect(slot(vocab, "c", "physical_name")).toEqual([
      { value: "C", from: "label" },
    ]);
  });
});
