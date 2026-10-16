import { parseRenderInput, profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, type Hex } from "./colors";
import { entitySlots, resolveVocab } from "./resolve";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const HOSTILE = ["__proto__", "constructor", "toString"];

const input: unknown = JSON.parse(`{
  "nodes": [
    { "id": "h0", "type": "__proto__", "attrs": { "__proto__": "x", "constructor": "y", "toString": "z" } },
    { "id": "h1", "type": "constructor", "attrs": { "asset_type": "toString" } },
    { "id": "h2", "type": "toString" },
    { "id": "r0", "attrs": { "asset_type": "constructor" } },
    { "id": "tb", "type": "table", "attrs": { "owners": [
      { "__proto__": { "label": "P" } },
      { "__proto__": { "label": "P" }, "name": "Ann" }
    ] } },
    { "id": "a", "type": "t0" },
    { "id": "b", "type": "t0" }
  ],
  "edges": [
    { "subject": "a", "predicate": "p1", "object": "b" },
    { "subject": "a", "predicate": "p2", "object": "b" },
    { "subject": "a", "predicate": "p3", "object": "b" },
    { "subject": "a", "predicate": "owns", "object": "b" },
    { "subject": "h0", "predicate": "__proto__", "object": "h1" },
    { "subject": "h1", "predicate": "constructor", "object": "h2" },
    { "subject": "h2", "predicate": "toString", "object": "h0" }
  ],
  "types": { "__proto__": { "rank": 2 } },
  "predicates": {
    "__proto__": { "category": "x" },
    "p1": { "category": "__proto__" },
    "p2": { "category": "constructor" }
  },
  "fields": {
    "__proto__": { "slot": "owners" },
    "constructor": { "slot": "__proto__" },
    "toString": { "slot": "constructor" }
  },
  "vocabulary": {
    "nodeTypes": [{ "name": "t0", "builtIn": true }],
    "predicates": [
      { "name": "p3", "category": "toString" },
      { "name": "owns", "builtIn": true }
    ]
  }
}`);

describe("S29 hostile names", () => {
  const before = Object.getOwnPropertyNames(Object.prototype).sort();
  const contract = parseRenderInput(input);
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error("fatal");
  const run = () => resolveVocab(result.graph, result.payload, profile, LIGHT);
  const { vocab, issues } = run();

  it("gives no contract issue and leaves Object.prototype unchanged", () => {
    expect(contract.ok && contract.issues).toEqual([]);
    expect(run).not.toThrow();
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(({} as Record<string, unknown>).rank).toBeUndefined();
    expect(issues.some((issue) => issue.code === "unknown-key")).toBe(false);
  });

  it("makes three custom families with a number count each", () => {
    const families = vocab.families.filter((family) =>
      HOSTILE.includes(family.key),
    );
    expect(families).toEqual([
      { key: "__proto__", count: 1 },
      { key: "constructor", count: 1 },
      { key: "toString", count: 1 },
    ]);
    for (const family of vocab.families)
      expect(typeof family.count).toBe("number");
  });

  it("reads builtIn from the profile only", () => {
    expect(vocab.predicates.get("owns")).not.toHaveProperty("builtIn");
    expect(vocab.types.get("t0")).not.toHaveProperty("builtIn");
  });

  it("resolves hostile type and predicate names as undeclared", () => {
    for (const name of HOSTILE) {
      expect(vocab.types.get(name)).toMatchObject({
        provenance: "custom",
        declared: false,
        visual: { rank: 0, shape: "circle" },
      });
      expect(vocab.predicates.get(name)).toMatchObject({
        family: "Custom",
        provenance: "custom",
        inverse: null,
        direction: "out",
      });
    }
    expect(vocab.entities.get("r0")?.type).toBeNull();
    expect(vocab.entities.get("h1")?.type).toBe("constructor");
    const unknown = issues.filter((issue) => issue.code === "unknown-type");
    expect(unknown.map((issue) => issue.path[1])).toEqual([
      "h0",
      "h1",
      "h2",
      "r0",
    ]);
  });

  it("reads own keys only in slots and list items", () => {
    const owners = entitySlots(vocab, "tb")?.slots.find(
      (s) => s.slot === "owners",
    );
    expect(owners?.entries).toEqual([
      { value: "Ann", from: "attribute owners" },
    ]);
    const all = entitySlots(vocab, "h0")?.slots.flatMap((s) => s.entries) ?? [];
    expect(all.filter((entry) => entry.from !== "label")).toEqual([]);
  });
});
