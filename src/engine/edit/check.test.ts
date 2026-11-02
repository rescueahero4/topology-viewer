import { profile as qdic } from "#contract";
import { describe, expect, it } from "vitest";
import {
  checkEdit,
  normalize,
  valueKind,
  type EditCode,
  type EditColumn,
  type Graph,
  type Profile,
  type RowRef,
} from "../index";

const profile: Profile = qdic;

function graphOf(input: unknown): Graph {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result.graph;
}

const graph = graphOf({
  nodes: [
    {
      id: "A",
      type: "table",
      label: "Orders",
      attrs: {
        service_name: "snowflake",
        description: "All orders",
        row_count: 12,
        updated: "2026-01-01",
        is_lost: false,
        note: "text",
      },
    },
    { id: "B", type: "table", label: "Lines" },
    { id: "C", type: "schema", label: "Sales" },
  ],
  edges: [
    {
      subject: "A",
      predicate: "contains",
      object: "B",
      isActive: true,
      valid_from: "2026-01-01T10:00:00Z",
      valid_to: "2027-01-01",
      weight: 3,
      label: "x",
    },
  ],
});

const node: RowRef = { record: "A" };
const edge: RowRef = { triple: graph.triples[0].key };

type Case = [string, RowRef, EditColumn, unknown, EditCode | null];

const code = (row: RowRef, column: EditColumn, after: unknown) =>
  checkEdit(graph, profile, { row, column, before: undefined, after });

const INVERSES = ["partOf", "narrower", "follows", "producedBy"];

const cases: Case[] = [
  ["empty Name", node, "name", "", "empty"],
  ["blank Name", node, "name", "   ", "empty"],
  ["cleared Name", node, "name", undefined, "empty"],
  ["cleared Kind", node, "kind", undefined, "empty"],
  ["blank Kind", node, "kind", " ", "empty"],
  ["cleared Predicate", edge, "predicate", undefined, "empty"],
  ["blank edge Name", edge, "name", "  ", "empty"],
  ["cleared Subject", edge, "subject", undefined, "empty"],
  ["cleared Object", edge, "object", undefined, "empty"],
  ["Subject to the Object", edge, "subject", "B", "self-edge"],
  ["Object to the Subject", edge, "object", "A", "self-edge"],
  ...INVERSES.map((name): Case => [
    name,
    edge,
    "predicate",
    name,
    "inverse-name",
  ]),
  ["edge Name partOf", edge, "name", "partOf", "inverse-name"],
  ["12a on a number", node, { attr: "row_count" }, "12a", "not-a-number"],
  ["12a on a number fact", edge, { fact: "weight" }, "12a", "not-a-number"],
  ["2026-02-30", node, { attr: "updated" }, "2026-02-30", "not-a-date"],
  ["tomorrow", node, { attr: "updated" }, "tomorrow", "not-a-date"],
  ["2026-02-30 fact", edge, { fact: "valid_to" }, "2026-02-30", "not-a-date"],
  ["tomorrow fact", edge, { fact: "valid_from" }, "tomorrow", "not-a-date"],
  ["cleared System", node, "system", undefined, null],
  ["cleared Description", node, "description", undefined, null],
  ["cleared number", node, { attr: "row_count" }, undefined, null],
  ["cleared date", node, { attr: "updated" }, undefined, null],
  ["cleared isActive", edge, { fact: "isActive" }, undefined, null],
  ["cleared valid_to", edge, { fact: "valid_to" }, undefined, null],
  ["cleared fact", edge, { fact: "weight" }, undefined, null],
  ["Kind", node, "kind", "view", null],
  ["free-text Kind", node, "kind", "data_contract", null],
  ["Name", node, "name", "Orders EU", null],
  ["System", node, "system", "tableau", null],
  ["Description", node, "description", "New text", null],
  ["number", node, { attr: "row_count" }, 13, null],
  ["date", node, { attr: "updated" }, "2024-02-29", null],
  ["boolean", node, { attr: "is_lost" }, true, null],
  ["text", node, { attr: "note" }, "other", null],
  ["new attribute", node, { attr: "owner" }, "Ann", null],
  ["Predicate", edge, "predicate", "dependsOn", null],
  ["free-text Predicate", edge, "predicate", "reviewedBy", null],
  ["edge Name", edge, "name", "derivedFrom", null],
  ["Subject", edge, "subject", "C", null],
  ["Object", edge, "object", "C", null],
  ["isActive", edge, { fact: "isActive" }, false, null],
  [
    "valid_from",
    edge,
    { fact: "valid_from" },
    "2026-03-01T09:30:00+09:00",
    null,
  ],
  ["valid_to", edge, { fact: "valid_to" }, "2027-02-01", null],
  ["number fact", edge, { fact: "weight" }, 4, null],
  ["text fact", edge, { fact: "label" }, "y", null],
];

describe("S12 bad-value codes", () => {
  it("has the four inverse names of the profile", () => {
    expect(Object.keys(profile.inverses)).toEqual(INVERSES);
  });

  it.each(cases)("%s", (_, row, column, after, expected) => {
    expect(code(row, column, after)).toBe(expected);
  });
});

describe("S13 value kinds", () => {
  it.each([
    ["2026-10-29", "date"],
    ["2026-10-29T10:00:00Z", "date"],
    ["text", "text"],
    [12, "number"],
    [true, "boolean"],
    [[], "list"],
    [{}, "object"],
    [null, "text"],
  ] as const)("%j is %s", (value, kind) => {
    expect(valueKind(value)).toBe(kind);
  });
});
