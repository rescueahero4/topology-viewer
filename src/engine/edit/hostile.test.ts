import { profile } from "#contract";
import { describe, expect, it } from "vitest";
import {
  applyEdits,
  canvasColor,
  checkEdit,
  firstView,
  frontier,
  normalize,
  resolveVocab,
  type CellChange,
  type EditColumn,
  type Hex,
  type RowRef,
} from "../index";

const NOW = "2026-10-14";
const LIGHT = canvasColor("#F4F4F5") as Hex;
const PROTOTYPE = Object.getOwnPropertyNames(Object.prototype);
const NAMES = ["__proto__", "constructor", "prototype", "toString"];
// why: LEARNINGS 21 and 68 — the hostile values of `packages/ui/src/shellAudit.ts` (rule 14), built
// here because engine tests import nothing from `packages/ui` (SA §3)
const TAIL = `"<>&javascript:`;
const HOSTILE = [`qxm001${TAIL}`, `qxm002${TAIL}`.padEnd(10_000, "x")];

const input = () => ({
  nodes: [
    { id: "__proto__", type: "constructor", label: HOSTILE[0] },
    { id: "constructor", type: "toString", label: "C" },
    { id: "prototype", type: "__proto__", label: "P" },
    { id: "toString", label: "T", attrs: { constructor: "c", toString: "t" } },
  ],
  edges: [
    { subject: "__proto__", predicate: "prototype", object: "constructor" },
    { subject: "constructor", predicate: "toString", object: "toString" },
    { subject: "toString", predicate: "constructor", object: "__proto__" },
  ],
  view: { root: "__proto__", approach: "active" },
});

function loaded() {
  const result = normalize(input(), { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const change = (row: RowRef, column: EditColumn, after: unknown) => ({
  row,
  column,
  before: undefined,
  after,
});

function changesFor(value: string, edge: string): CellChange[] {
  const node = { record: "__proto__" };
  const triple = { triple: edge };
  return [
    change(node, "kind", value),
    change({ record: "constructor" }, "name", value),
    change(triple, "predicate", value),
    change(node, { attr: "note" }, value),
    change(node, { attr: "__proto__" }, value),
    change(node, { attr: "constructor" }, value),
    change({ record: "toString" }, { attr: "__proto__" }, value),
    change({ record: "toString" }, { attr: "constructor" }, value),
    change(triple, { fact: "note" }, value),
    change(triple, { fact: "__proto__" }, value),
    change(triple, { fact: "constructor" }, value),
  ];
}

function ownValue(target: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  expect(descriptor && "value" in descriptor).toBe(true);
  return descriptor?.value;
}

function clean() {
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(PROTOTYPE);
}

describe("S16 prototype names and hostile values as typed values", () => {
  const base = loaded();
  const edge = base.graph.triples[0].key;

  it("has an own `constructor` attribute key in the base", () => {
    const record = base.graph.records.find((r) => r.id === "toString");
    expect(ownValue(record?.attrs ?? {}, "constructor")).toBe("c");
  });

  it.each([...NAMES, ...HOSTILE])("%s", (value) => {
    const edits = [
      { changes: changesFor(value, edge), effect: { drew: [], undrew: [] } },
    ];
    const graph = applyEdits(base.graph, edits, NOW);
    const { vocab } = resolveVocab(graph, base.payload, profile, LIGHT);
    const state = firstView(graph, vocab, base.payload, base.hash);
    expect(() => frontier(state, graph, vocab)).not.toThrow();
    clean();
    const [proto, constructor, , named] = graph.records;
    expect(ownValue(proto, "type")).toBe(value);
    expect(ownValue(constructor, "label")).toBe(value);
    for (const key of ["note", "__proto__", "constructor"])
      expect(ownValue(proto.attrs, key)).toBe(value);
    for (const key of ["__proto__", "constructor"])
      expect(ownValue(named.attrs, key)).toBe(value);
    const triple = graph.triples[0];
    expect(ownValue(triple, "predicate")).toBe(value);
    for (const key of ["note", "__proto__", "constructor"])
      expect(ownValue(triple.attrs, key)).toBe(value);
    expect(ownValue(graph.entities[0], "type")).toBe(value);
  });

  it.each(NAMES)("checkEdit gives `null` for %s as a Predicate", (name) => {
    const graph = base.graph;
    for (const column of ["predicate", "name"] as const)
      expect(
        checkEdit(graph, profile, change({ triple: edge }, column, name)),
      ).toBeNull();
    expect(
      checkEdit(graph, profile, change({ record: "__proto__" }, "kind", name)),
    ).toBeNull();
    clean();
  });
});

// why: QA memo 2026-10-29-qa-story-01-null-prototype — an edited row keeps the null prototype of
// the data layer, so a prototype name gives no inherited value
describe("edited `attrs` and `inferred` keep the null prototype", () => {
  it("gives no inherited value for a prototype name", () => {
    const result = normalize(
      {
        nodes: [
          { id: "A", attrs: { note: "x" }, _inferred: { note: "why" } },
          { id: "B" },
        ],
        edges: [{ subject: "A", predicate: "p", object: "B", weight: 1 }],
      },
      { now: NOW },
    );
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const base = result.graph;
    const changes = [
      change({ record: "A" }, { attr: "note" }, "y"),
      change({ record: "A" }, { attr: "toString" }, "t"),
      change({ triple: base.triples[0].key }, { fact: "weight" }, 2),
    ];
    const graph = applyEdits(
      base,
      [{ changes, effect: { drew: [], undrew: [] } }],
      NOW,
    );
    const [record] = graph.records;
    const maps = [record.attrs, record.inferred, graph.triples[0].attrs];
    for (const map of maps) {
      expect(Object.getPrototypeOf(map)).toBeNull();
      expect((map as Record<string, unknown>).constructor).toBeUndefined();
    }
    expect(Object.keys(record.attrs)).toEqual(["note", "toString"]);
    expect(Object.hasOwn(record.inferred, "note")).toBe(false);
  });
});
