import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, type Hex } from "./colors";
import { entitySlots, resolveVocab, type Vocab } from "./resolve";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const KB = 1024;

const RUNS = 3;

// why: S46 — the lead limits against PRD NF-1, with no CPU throttle; ISSUE-006 — the median of 3
// timed calls after one warm-up call
function timed(input: unknown) {
  expect(JSON.stringify(input).length).toBeLessThanOrEqual(256 * KB);
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const once = () => {
    const start = performance.now();
    const { vocab } = resolveVocab(
      result.graph,
      result.payload,
      profile,
      LIGHT,
    );
    for (const id of vocab.entities.keys()) entitySlots(vocab, id);
    return { vocab, ms: performance.now() - start };
  };
  once();
  const runs = Array.from({ length: RUNS }, once);
  const times = runs.map(({ ms }) => ms).sort((a, b) => a - b);
  return { vocab: runs[0].vocab, ms: times[Math.floor(RUNS / 2)] };
}

const slot = (vocab: Vocab, id: string, name: string) =>
  entitySlots(vocab, id)?.slots.find((s) => s.slot === name)?.entries;

function mapped(nodes: number, mappings: number) {
  const fields: Record<string, object> = {
    k1: { slot: "owners", why: "w1" },
    k0: { slot: "owners" },
  };
  for (let i = 2; i < mappings; i++)
    fields[`_${i.toString(36)}`] = { slot: "tags" };
  const list: unknown[] = [
    ["n0", "table", "T", { k0: "a", k1: ["b", "c"], owner: "o" }],
    ["n1", "table", "U", { k1: "d" }],
  ];
  for (let i = 2; i < nodes; i++)
    list.push([`n${i}`, i % 2 ? "table" : `t${i % 40}`]);
  return { nodes: list, fields };
}

// why: hand-checked result of the first two nodes: native key, then the mappings in `fields`
// order (k1 before k0)
const OWNERS_N0 = [
  { value: "o", from: "attribute owner" },
  { value: "b", from: "attribute k1", mapped: "w1" },
  { value: "c", from: "attribute k1", mapped: "w1" },
  { value: "a", from: "attribute k0", mapped: "" },
];
const OWNERS_N1 = [{ value: "d", from: "attribute k1", mapped: "w1" }];

function hub(children: number, edges: number) {
  const nodes: unknown[] = [["n0", "table", "Hub"]];
  for (let i = 1; i <= children; i++) nodes.push([`n${i}`, "table", `C${i}`]);
  const list: unknown[] = [];
  for (let i = 0; i < edges; i++)
    list.push(["n0", i % 2 ? "ownedBy" : "contains", `n${1 + (i % children)}`]);
  return { nodes, edges: list };
}

describe("S46 bounded work on hostile payloads", () => {
  it("gives the hand-checked result on small inputs", () => {
    const small = timed(mapped(3, 4)).vocab;
    expect(slot(small, "n0", "owners")).toEqual(OWNERS_N0);
    expect(slot(small, "n1", "owners")).toEqual(OWNERS_N1);
    expect(slot(small, "n2", "owners")).toEqual([]);
    const tree = timed(hub(3, 6)).vocab;
    const owners = [
      { value: "C2", from: "derive parent-owners" },
      { value: "C1", from: "derive parent-owners" },
      { value: "C3", from: "derive parent-owners" },
    ];
    for (const id of ["n1", "n2", "n3"])
      expect(slot(tree, id, "parent_owners")).toEqual(owners);
    expect(slot(tree, "n0", "owners")?.map((e) => e.value)).toEqual([
      "C2",
      "C1",
      "C3",
    ]);
  });

  it("(a) 500 nodes and 10,000 mappings in < 100 ms", () => {
    const { vocab, ms } = timed(mapped(500, 10_000));
    expect(slot(vocab, "n0", "owners")).toEqual(OWNERS_N0);
    expect(slot(vocab, "n1", "owners")).toEqual(OWNERS_N1);
    expect(slot(vocab, "n499", "owners")).toEqual([]);
    expect(ms).toBeLessThan(100);
  });

  it("(b) 2,000 nodes and 9,000 mappings in < 250 ms", () => {
    const { vocab, ms } = timed(mapped(2000, 9000));
    expect(vocab.entities.size).toBe(2000);
    expect(slot(vocab, "n0", "owners")).toEqual(OWNERS_N0);
    expect(ms).toBeLessThan(250);
  });

  it("(c) a hub with 4,000 contains and ownedBy edges in < 250 ms", () => {
    const { vocab, ms } = timed(hub(1999, 4000));
    const owners = slot(vocab, "n0", "owners") ?? [];
    expect(owners).toHaveLength(1999);
    const derived = owners.map(({ value }) => ({
      value,
      from: "derive parent-owners",
    }));
    expect(slot(vocab, "n1", "parent_owners")).toEqual(derived);
    expect(slot(vocab, "n1999", "parent_owners")).toEqual(derived);
    expect(ms).toBeLessThan(250);
  });
});
