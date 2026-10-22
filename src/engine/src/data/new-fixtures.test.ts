import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import {
  canvasColor,
  containerPath,
  entitySlots,
  firstView,
  frontier,
  normalize,
  resolveVocab,
  warningEntries,
  type Hex,
  type Visual,
  type Vocab,
} from "..";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const NEW = [
  "q-semantic-layer-steward",
  "s-constraint-violation",
  "s-unsafe-glyph",
  "s-merge-namesakes",
  "s-fields-vs-edge",
  "s-cjk-labels",
];

// why: STORY-005-02 test plan — normalize, resolveVocab, warningEntries with both issue lists,
// firstView, frontier; `now` 2026-10-14 and the light canvas
function run(key: string) {
  const result = normalize(loadFixture(key).input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const resolved = resolveVocab(graph, payload, profile, LIGHT);
  const issues = [...result.issues, ...resolved.issues];
  const warnings = Object.fromEntries(
    warningEntries(issues, result.shaped).map((w) => [w.code, w.count]),
  );
  const vocab = resolved.vocab;
  const state = firstView(graph, vocab, payload, hash);
  const drawn = frontier(state, graph, vocab);
  return { result, vocab, issues, warnings, state, drawn };
}

function visualOf(vocab: Vocab, type: string): Visual {
  const visual = vocab.types.get(type)?.visual;
  if (visual === undefined) throw new Error(`no type ${type}`);
  return visual;
}

describe("S1 q-semantic-layer-steward", () => {
  const out = run("q-semantic-layer-steward");

  it("gives the traced counts and no warning", () => {
    expect(out.result.counts).toMatchObject({
      records: 4,
      entities: 4,
      merged: 0,
      relationships: 3,
    });
    expect(out.warnings).toEqual({});
  });

  it("paints Passive with 4 nodes and 3 edges", () => {
    expect(out.state.approach).toBe("passive");
    expect(out.state.selection).toBeNull();
    expect(out.drawn.nodes).toHaveLength(4);
    expect(out.drawn.edges).toHaveLength(3);
  });

  it("marks steward ST as a custom type, with the governance family", () => {
    expect(visualOf(out.vocab, "steward")).toMatchObject({ letters: "ST" });
    expect(out.vocab.types.get("steward")?.provenance).toBe("custom");
    expect(out.vocab.families.map((family) => family.key)).toEqual([
      "Structure",
      "Annotation",
      "governance",
    ]);
  });
});

describe("S2 s-constraint-violation", () => {
  const out = run("s-constraint-violation");

  it("reports both violating edges at their paths", () => {
    expect(out.warnings).toEqual({ "constraint-violation": 2 });
    expect(
      out.issues
        .filter((issue) => issue.code === "constraint-violation")
        .map((issue) => issue.path),
    ).toEqual([
      ["edges", 1],
      ["edges", 3],
    ]);
  });

  it("selects the root and draws both violating edges", () => {
    expect(out.state.selection).toEqual({ node: "e:t_orders" });
    expect(out.drawn.nodes).toHaveLength(4);
    expect(out.drawn.edges).toHaveLength(4);
  });
});

describe("S3 s-unsafe-glyph", () => {
  const out = run("s-unsafe-glyph");
  const types = (
    loadFixture("s-unsafe-glyph").input as {
      types: Record<string, { glyph: string }>;
    }
  ).types;

  it("rejects the four bad glyphs at their paths", () => {
    expect(out.warnings).toEqual({ "glyph-rejected": 4 });
    expect(
      out.issues
        .filter((issue) => issue.code === "glyph-rejected")
        .map((issue) => issue.path),
    ).toEqual(
      ["badge", "token", "link", "long"].map((t) => ["types", t, "glyph"]),
    );
    expect(types.long.glyph).toHaveLength(554);
  });

  it.each([
    ["badge", "BD"],
    ["token", "TK"],
    ["link", "LN"],
    ["long", "LG"],
  ])("falls back to letters for %s (%s)", (type, letters) => {
    const visual = visualOf(out.vocab, type);
    expect(visual).toMatchObject({ letters });
    expect(visual).not.toHaveProperty("glyph");
  });

  it("keeps the good glyph and no rejected string", () => {
    expect(visualOf(out.vocab, "safe")).toMatchObject({ glyph: "M3 12h18" });
    const text = JSON.stringify([...out.vocab.types.values()]);
    for (const type of ["badge", "token", "link", "long"])
      expect(text).not.toContain(types[type].glyph);
  });

  it("paints 5 nodes and 4 edges", () => {
    expect(out.state.selection).toEqual({ node: "e:n_safe" });
    expect(out.drawn.nodes).toHaveLength(5);
    expect(out.drawn.edges).toHaveLength(4);
  });
});

describe("S4 s-merge-namesakes", () => {
  const out = run("s-merge-namesakes");

  it("merges the two equal ORDERS and keeps the namesakes apart", () => {
    expect(out.result.counts).toMatchObject({
      records: 10,
      entities: 9,
      merged: 1,
      relationships: 6,
    });
    expect(out.warnings).toEqual({});
    expect(out.vocab.entities.has("tbl-orders-1")).toBe(true);
    expect(out.vocab.entities.has("tbl-orders-2")).toBe(true);
  });

  it("draws 9 nodes, no group node and 6 edges", () => {
    expect(out.state.selection).toBeNull();
    expect(out.drawn.nodes).toHaveLength(9);
    expect(out.drawn.nodes.filter((node) => "members" in node)).toEqual([]);
    expect(out.drawn.edges).toHaveLength(6);
  });

  it.each([
    ["t_orders_a", ["ANALYTICS", "SALES"]],
    ["t_orders_f", ["ANALYTICS", "FINANCE"]],
    ["tbl-orders-1", []],
    ["tbl-orders-2", []],
  ])("gives %s the container path %j", (id, path) => {
    expect(containerPath(out.vocab, id)).toEqual(path);
  });
});

describe("S5 s-fields-vs-edge", () => {
  const out = run("s-fields-vs-edge");

  it("fills Owners from the attribute, the edge and the mapping, in this order", () => {
    const owners = entitySlots(out.vocab, "t_customer")?.slots.find(
      (slot) => slot.slot === "owners",
    );
    expect(owners?.entries).toEqual([
      { value: "Data team", from: "attribute owners" },
      { value: "Ann Lee", from: "ownedBy" },
      {
        value: "ops@example.com",
        from: "attribute owner_email",
        mapped: "column name in the source sheet",
      },
    ]);
  });

  it("paints the root with 2 nodes and 1 edge and no warning", () => {
    expect(out.warnings).toEqual({});
    expect(out.state.selection).toEqual({ node: "e:t_customer" });
    expect(out.drawn.nodes).toHaveLength(2);
    expect(out.drawn.edges).toHaveLength(1);
  });
});

describe("S6 s-cjk-labels", () => {
  const out = run("s-cjk-labels");

  it("gives 部門 and 部署 the mark 部 in two colours", () => {
    const a = visualOf(out.vocab, "部門");
    const b = visualOf(out.vocab, "部署");
    expect(a).toMatchObject({ letters: "部", color: "#6b7280" });
    expect(b).toMatchObject({ letters: "部", color: "#7c6f64" });
  });

  it("draws 6 nodes and 5 edges with the input labels", () => {
    expect(out.warnings).toEqual({});
    expect(out.state.selection).toEqual({ node: "e:t_sales" });
    expect(out.drawn.edges).toHaveLength(5);
    const labels = new Map(
      (
        loadFixture("s-cjk-labels").input as {
          nodes: { id: string; label: string }[];
        }
      ).nodes.map((node) => [node.id, node.label]),
    );
    const drawn = out.drawn.nodes.map((node) =>
      "entity" in node ? [node.entity, node.label] : [node.id, null],
    );
    expect(drawn.sort()).toEqual([...labels].sort());
    expect(labels.get("t_sales")).toHaveLength(26);
    expect(containerPath(out.vocab, "c_customer")).toEqual([
      labels.get("t_sales"),
    ]);
  });
});

describe("S7 the six fixtures run twice", () => {
  it.each(NEW)("%s gives byte-equal first view and frontier", (key) => {
    const first = run(key);
    const second = run(key);
    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
    expect(JSON.stringify(second.drawn)).toBe(JSON.stringify(first.drawn));
  });
});
