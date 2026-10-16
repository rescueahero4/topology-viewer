import { copyBytes, parseRenderInput, profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it, vi } from "vitest";
import { normalize, type Normalized } from "./normalize";

vi.mock("@qdic-topology/contract", async (importOriginal) => {
  const contract =
    await importOriginal<typeof import("@qdic-topology/contract")>();
  return { ...contract, parseRenderInput: vi.fn(contract.parseRenderInput) };
});

type Raw = Record<string, unknown>;

const NOW = { now: "2026-10-14" };

function okOf(result: Normalized) {
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const run = (input: unknown, now = NOW) => okOf(normalize(input, now));

const codes = (result: { issues: { code: string }[] }) =>
  result.issues.map((issue) => issue.code);

function compactNode(node: Raw) {
  const { id, type, label, attrs, ...extra } = node;
  const all = { ...extra, ...(attrs as Raw | undefined) };
  return [id, type, label, Object.keys(all).length > 0 ? all : undefined];
}

function compactEdge(edge: Raw) {
  const { source, target, predicate, attrs, ...extra } = edge;
  const all = { ...extra, ...(attrs as Raw | undefined) };
  return [
    source,
    predicate,
    target,
    Object.keys(all).length > 0 ? all : undefined,
  ];
}

const COMPACT = [
  "s-access",
  "s-badroot",
  "s-chain",
  "s-custom-active",
  "s-custom-passive",
  "s-designed",
  "s-designed-glyph",
  "s-edges-only",
  "s-empty",
  "s-extend",
  "s-islands",
  "s-ladder",
  "s-lineage",
  "s-many-preds",
  "s-mixed",
  "s-mixed-designed",
  "s-nohint",
  "s-root-only",
  "s-single",
  "s-star",
  "s-undeclared",
  "s-unsafe-colors",
  "s-vague",
  "s-vocab-meta",
];

const DEFAULT_PREDICATE = profile.shapeHeuristics.find(
  (heuristic) => heuristic.kind === "rows" && heuristic.hintDefault === true,
)?.predicate;

describe("S1 a canonical payload", () => {
  const result = run({
    nodes: [
      { id: "n0", type: "t0", label: "L0" },
      { id: "n1", type: "t0" },
      { id: "n2", type: "t0", label: "L2" },
    ],
    edges: [
      { subject: "n0", predicate: "p0", object: "n1" },
      { subject: "n1", object: "n2" },
    ],
  });

  it("gives 3 entities and 2 triples with the label and predicate fallbacks", () => {
    expect(result.graph.entities).toHaveLength(3);
    expect(result.graph.triples).toHaveLength(2);
    expect(result.graph.entities[1].label).toBe("n1");
    expect(DEFAULT_PREDICATE).toBe("relatedTo");
    expect(result.graph.triples[1].predicate).toBe(DEFAULT_PREDICATE);
    expect(result.issues).toEqual([]);
    expect(result.graph.shapedSet).toStrictEqual({ records: [], triples: [] });
  });
});

describe("S2 the compact form gives the same graph", () => {
  it.each(COMPACT)("%s", (key) => {
    const input = loadFixture(key).input as Raw;
    const compact = {
      ...input,
      nodes: (input.nodes as Raw[]).map(compactNode),
      edges: (input.edges as Raw[]).map(compactEdge),
    };
    const canonical = run(input);
    const tuples = run(compact);
    expect(tuples.graph).toEqual(canonical.graph);
    expect(tuples.hash).toBe(canonical.hash);
  });
});

describe("S3 compact records and defaults", () => {
  const nodes = [["a"], ["b", "table"]];
  const defaults = { type: "service", predicate: "dependsOn" };

  it("fills a missing type and predicate from defaults", () => {
    const result = run({
      nodes,
      edges: [{ subject: "a", object: "b" }],
      defaults,
    });
    expect(result.graph.records.map((r) => r.type)).toEqual([
      "service",
      "table",
    ]);
    expect(result.graph.triples[0].predicate).toBe("dependsOn");
  });

  it("counts a tuple with a null predicate as a dangling edge", () => {
    const result = run({ nodes, edges: [["a", null, "b"]], defaults });
    expect(result.warnings).toEqual([
      { code: "dangling-edge", count: 1, ids: ["0"] },
    ]);
    expect(result.graph.triples).toEqual([]);
  });

  it("fills exactly the record set of copyBytes", () => {
    const input = {
      nodes: [
        { id: "c", nodeType: "view" },
        { globalId: "tbl-9" },
        { id: "f", type: 5 },
        ["e"],
      ],
      defaults: { type: "service" },
    };
    const result = run(input);
    expect(result.graph.records.map((r) => [r.id, r.type])).toEqual([
      ["c", "view"],
      ["tbl-9", "service"],
      ["f", "service"],
      ["e", "service"],
    ]);
    expect(result.issues).toEqual([
      { code: "field-rejected", path: ["nodes", 2, "type"] },
    ]);
    expect(copyBytes(input).sum).toBe(3 * '"service"'.length);
  });
});

describe("S4 the QDIC and alias forms", () => {
  const canonical = {
    nodes: [
      {
        id: "tbl-a",
        type: "table",
        label: "A",
        logicalName: "Alpha",
        isWritable: false,
      },
      { id: "clmn-b", type: "column", label: "B" },
    ],
    edges: [
      {
        subject: "tbl-a",
        predicate: "contains",
        object: "clmn-b",
        isActive: true,
      },
    ],
  };
  const qdic = {
    neighborhood: {
      nodes: [
        {
          globalId: "tbl-a",
          nodeType: "table",
          physicalName: "A",
          logicalName: "Alpha",
          isWritable: false,
        },
        { globalId: "clmn-b", nodeType: "column", physicalName: "B" },
      ],
      edges: [
        {
          subjectNodeId: "tbl-a",
          predicate: "contains",
          objectNodeId: "clmn-b",
          isActive: true,
        },
      ],
    },
  };
  const links = {
    nodes: canonical.nodes,
    links: [
      {
        source: "tbl-a",
        predicate: "contains",
        target: "clmn-b",
        isActive: true,
      },
    ],
  };

  it("maps the QDIC names and keeps the record fields", () => {
    const base = run(canonical).graph;
    const graph = run(qdic).graph;
    expect(graph.records.map((r) => r.idSource)).toEqual([
      "globalId",
      "globalId",
    ]);
    expect(graph.records[0]).toMatchObject({
      logicalName: "Alpha",
      isWritable: false,
    });
    expect(graph.triples[0].isActive).toBe(true);
    const asId = graph.records.map((r) => ({ ...r, idSource: "id" }));
    expect({ ...graph, records: asId }).toEqual(base);
  });

  it("gives the same graph for links with source and target", () => {
    expect(run(links).graph).toEqual(run(canonical).graph);
  });
});

describe("S5 unknown keys", () => {
  it("go to attrs with no issue", () => {
    const result = run({
      nodes: [{ id: "a", owner: "x" }, { id: "b" }],
      edges: [{ subject: "a", predicate: "p0", object: "b", weight: 3 }],
    });
    expect(result.graph.records[0].attrs.owner).toBe("x");
    expect(result.graph.triples[0].attrs.weight).toBe(3);
    expect(result.issues).toEqual([]);
  });
});

describe("S9 structural failures", () => {
  it.each([
    [loadFixture("s-invalid").input, "nodes-not-array", ["nodes"], "string"],
    [loadFixture("s-not-graph").input, "not-object", [], "array"],
    [{ nodes: [], edges: {} }, "edges-not-array", ["edges"], "object"],
    [{ neighborhood: 5 }, "not-object", ["neighborhood"], "number"],
  ])("case %#", (input, code, path, got) => {
    expect(normalize(input, NOW)).toStrictEqual({
      ok: false,
      fatal: { code, path, info: { code, got } },
    });
  });
});

describe("S11 inverse names", () => {
  it("fold partOf onto contains and keep the source name", () => {
    const result = run({
      nodes: [{ id: "c1" }, { id: "t1" }],
      edges: [
        { subject: "c1", predicate: "partOf", object: "t1" },
        { subject: "t1", predicate: "contains", object: "c1" },
      ],
    });
    expect(result.graph.triples).toHaveLength(1);
    expect(result.graph.triples[0]).toMatchObject({
      subject: "t1",
      predicate: "contains",
      object: "c1",
      sourcePredicate: "partOf",
      records: [0, 1],
    });
  });

  it.each([
    ["narrower", "broader"],
    ["follows", "precededBy"],
    ["producedBy", "produces"],
  ])("folds %s onto %s with the ends swapped", (inverse, canonical) => {
    const result = run({
      nodes: [{ id: "x" }, { id: "y" }],
      edges: [{ subject: "x", predicate: inverse, object: "y" }],
    });
    expect(result.graph.triples[0]).toMatchObject({
      subject: "y",
      predicate: canonical,
      object: "x",
      sourcePredicate: inverse,
    });
  });

  it("keeps a declared custom inverse as data", () => {
    const result = run({
      nodes: [{ id: "x" }, { id: "y" }],
      edges: [{ subject: "x", predicate: "stewardOf", object: "y" }],
      predicates: { hasSteward: { inverse: "stewardOf" } },
    });
    const triple = result.graph.triples[0];
    expect(triple.predicate).toBe("stewardOf");
    expect(Object.hasOwn(triple, "sourcePredicate")).toBe(false);
    expect(result.payload.predicates?.hasSteward?.inverse).toBe("stewardOf");
  });
});

describe("S13 edge attributes per triple", () => {
  it("keeps different attributes apart and folds exact copies", () => {
    const read = {
      subject: "u",
      predicate: "permissionedTo",
      object: "t",
      attrs: { permission: "read" },
    };
    const write = { ...read, attrs: { permission: "write" } };
    const result = run({
      nodes: [{ id: "u" }, { id: "t" }],
      edges: [read, write, read],
    });
    expect(result.graph.triples).toHaveLength(2);
    expect(result.graph.triples[0].records).toEqual([0, 2]);
    expect(result.counts.relationships).toBe(2);
    expect(result.counts.edgeRecords).toBe(3);
  });
});

describe("S18 view references", () => {
  const access = loadFixture("s-access").input as Raw;
  const view = access.view as Raw;

  it("counts the unknown root of s-badroot", () => {
    const { input, expect: outcome } = loadFixture("s-badroot");
    const entry = run(input).warnings.find((w) => w.code === "root-not-found");
    expect(entry?.count).toBe(outcome.warnings["root-not-found"]);
  });

  it("resolves a record id of a merged entity in reveal", () => {
    const input = {
      ...access,
      view: { ...view, reveal: ["x-unknown", "u_20"] },
    };
    const result = run(input);
    expect(result.issues.filter((i) => i.code === "reveal-not-found")).toEqual([
      { code: "reveal-not-found", path: ["view", "reveal", 0] },
    ]);
  });

  it("resolves a root that is the second record of entity u_0", () => {
    const result = run({ ...access, view: { ...view, root: "u_20" } });
    expect(codes(result)).not.toContain("root-not-found");
    const entity = result.graph.entities.find((e) =>
      e.records.includes("u_20"),
    );
    expect(entity?.id).toBe("u_0");
  });
});

describe("S32 a thrown error", () => {
  it("becomes error-fallback with no message or stack text", () => {
    vi.mocked(parseRenderInput).mockImplementationOnce(() => {
      throw new Error("boom at /x/y.ts:1");
    });
    const result = normalize({ nodes: [] }, NOW);
    expect(result).toStrictEqual({
      ok: false,
      fatal: { code: "error-fallback", path: [] },
    });
    expect(JSON.stringify(result)).not.toMatch(/boom|\.ts:/);
  });
});
