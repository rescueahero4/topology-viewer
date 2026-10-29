import { datasets } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import {
  applyEdits,
  normalize,
  sameValueRows,
  type Graph,
  type RowRef,
} from "../index";

const NOW = "2026-10-14";

function graphOf(input: unknown): Graph {
  const result = normalize(input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result.graph;
}

const own = (attrs: Record<string, unknown>, key: string) =>
  Object.hasOwn(attrs, key) ? attrs[key] : undefined;

const nodeRefs = (refs: RowRef[]) => refs.filter((ref) => "record" in ref);
const edgeRefs = (refs: RowRef[]) => refs.filter((ref) => "triple" in ref);

describe("S11 the rows with the same value", () => {
  const base = graphOf(structuredClone(datasets.catalog.graph));

  it("counts the System `snowflake` node rows", () => {
    const record = base.records.find(
      (r) => own(r.attrs, "service_name") === "snowflake",
    );
    if (record === undefined) throw new Error("no record");
    const row = { record: record.id };
    const rows = sameValueRows(base, row, "system");
    const direct = base.records.filter(
      (r) => own(r.attrs, "service_name") === "snowflake",
    );
    expect(rows).toHaveLength(direct.length);
    expect(rows).toHaveLength(21);
    expect(rows).toContainEqual(row);
    expect(nodeRefs(rows)).toEqual(rows);
    expect(rows).toEqual(direct.map((r) => ({ record: r.id })));
  });

  it("counts the Predicate `contains` edge rows", () => {
    const triple = base.triples.find((t) => t.predicate === "contains");
    if (triple === undefined) throw new Error("no triple");
    const row = { triple: triple.key };
    const rows = sameValueRows(base, row, "predicate");
    const direct = base.triples.filter((t) => t.predicate === "contains");
    expect(rows).toHaveLength(direct.length);
    expect(rows).toHaveLength(188);
    expect(rows).toContainEqual(row);
    expect(edgeRefs(rows)).toEqual(rows);
    expect(sameValueRows(base, row, "name")).toEqual(rows);
  });

  it("counts the edge rows with the same Subject entity", () => {
    const triple = base.triples[0];
    const row = { triple: triple.key };
    const rows = sameValueRows(base, row, "subject");
    const direct = base.triples.filter((t) => t.subject === triple.subject);
    expect(rows).toEqual(direct.map((t) => ({ triple: t.key })));
    expect(rows.length).toBeGreaterThan(1);
    expect(edgeRefs(rows)).toEqual(rows);
  });

  it("gives only the row itself for an empty Description", () => {
    const record = base.records.find(
      (r) => !Object.hasOwn(r.attrs, "description"),
    );
    if (record === undefined) throw new Error("no record");
    const row = { record: record.id };
    expect(sameValueRows(base, row, "description")).toEqual([row]);
  });

  it("gives only the row itself for a record with no type", () => {
    const graph = graphOf({ nodes: [{ id: "A" }, { id: "B" }] });
    expect(graph.records.map((r) => r.type)).toEqual([undefined, undefined]);
    expect(sameValueRows(graph, { record: "A" }, "kind")).toEqual([
      { record: "A" },
    ]);
  });

  it("gives only the row itself for a `null` attribute (rule 12)", () => {
    const graph = graphOf({
      nodes: [
        { id: "A", attrs: { note: null } },
        { id: "B", attrs: { note: null } },
      ],
    });
    expect(sameValueRows(graph, { record: "A" }, { attr: "note" })).toEqual([
      { record: "A" },
    ]);
  });

  it("names edge rows by their base key in an edited graph (rule 2)", () => {
    const [first, second] = base.triples.filter(
      (t) => t.predicate === "contains",
    );
    const edited = applyEdits(
      base,
      [
        {
          changes: [first, second].map((t) => ({
            row: { triple: t.key },
            column: "predicate" as const,
            before: "contains",
            after: "reviewedBy",
          })),
          effect: { drew: [], undrew: [] },
        },
      ],
      NOW,
    );
    expect(edited.triples.map((t) => t.key)).not.toContain(first.key);
    const rows = sameValueRows(edited, { triple: first.key }, "predicate");
    expect(rows).toEqual([{ triple: first.key }, { triple: second.key }]);
  });
});
