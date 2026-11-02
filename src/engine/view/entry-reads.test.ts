import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import {
  entityDrawnId,
  entityOfDrawnId,
  entityOfRecord,
  fold,
  groupDrawnId,
  groupKey,
  normalize,
  type Graph,
} from "../index";

// why: ISSUE-012 C8 (SA §10 guardrail 10) — the three reads that the shell takes from the engine
// entry, so that no shell file keeps a copy of their rules

function graphOf(name: string): Graph {
  const result = normalize(loadFixture(name).input, { now: "2026-10-20" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result.graph;
}

// why: the `entityIndex` rule of view/hidden, one call for each id
const slowOwner = (graph: Graph, id: string) =>
  graph.entities.find((e) => e.id === id || e.records.includes(id))?.id ?? null;

describe("entityOfRecord", () => {
  it.each(["s-access", "s-dirty", "q-full-vocabulary"])(
    "%s: each record id gives the entity of the view/hidden rule",
    (name) => {
      const graph = graphOf(name);
      const owner = entityOfRecord(graph);
      for (const record of graph.records)
        expect(owner(record.id)).toBe(slowOwner(graph, record.id));
    },
  );

  it("s-access: a merged record names its entity; an unknown id gives null", () => {
    const owner = entityOfRecord(graphOf("s-access"));
    expect(owner("u_20")).toBe("u_0");
    expect(owner("t_FCT_REVENUE")).toBe("t_FCT_REVENUE");
    for (const id of ["nope", "", "__proto__", "constructor"])
      expect(owner(id)).toBeNull();
  });

  it("takes the first of two entities that list the same record id", () => {
    const graph = {
      entities: [
        { id: "a", records: ["r"] },
        { id: "b", records: ["r", "b"] },
      ],
    } as unknown as Graph;
    const owner = entityOfRecord(graph);
    expect(owner("r")).toBe("a");
    expect(owner("b")).toBe("b");
  });
});

describe("entityOfDrawnId", () => {
  it("inverts entityDrawnId and gives null for a group id", () => {
    for (const id of ["t_1", "", "e:x", "g:y"])
      expect(entityOfDrawnId(entityDrawnId(id))).toBe(id);
    const group = groupDrawnId(groupKey("t_1", "contains", ">", "column"));
    expect(entityOfDrawnId(group)).toBeNull();
    expect(entityOfDrawnId("t_1")).toBeNull();
  });
});

describe("fold", () => {
  it("is NFC and lower case, and keeps full-width letters", () => {
    expect(fold("Café")).toBe("café");
    expect(fold("ÉCOLE")).toBe("école");
    expect(fold("ＡＢＣ")).toBe("ａｂｃ");
  });
});
