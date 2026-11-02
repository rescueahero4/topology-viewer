import { fixtures, loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { seeded } from "../layout/random";
import {
  applyEdits,
  EditHistory,
  normalize,
  type Edit,
  type EditColumn,
  type Graph,
  type NodeRecord,
  type Triple,
} from "../index";

const NOW = "2026-10-14";
const SEEDS = [1, 2, 3];

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const scalar = (value: unknown) => typeof value !== "object" || value === null;

function columnsOf(item: NodeRecord | Triple): EditColumn[] {
  const keys = Object.keys(item.attrs).filter((k) => scalar(item.attrs[k]));
  if ("label" in item)
    return [
      ...(["kind", "name", "system", "description"] as const),
      ...keys.map((attr) => ({ attr })),
    ];
  return [
    ...(["name", "predicate", "subject", "object"] as const),
    ...["isActive", "valid_from", "valid_to", ...keys].map((fact) => ({
      fact,
    })),
  ];
}

// why: NF-3 — a seeded generator, so two runs with one seed give the same edit list
function randomEdits(base: Graph, seed: number): Edit[] {
  const random = seeded(seed);
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(random() * list.length)];
  const entities = base.entities.map((entity) => entity.id);
  const valueFor = (column: EditColumn, step: number): unknown => {
    if (column === "subject" || column === "object") return pick(entities);
    if (typeof column === "string")
      return ["system", "description"].includes(column) && random() < 0.3
        ? undefined
        : `v${step}`;
    const fact = "fact" in column ? column.fact : "";
    if (fact === "isActive") return pick([true, false, undefined]);
    if (fact === "valid_from" || fact === "valid_to")
      return pick(["2020-01-01", "2030-12-31", undefined]);
    return pick([`v${step}`, step, true, null, undefined]);
  };
  const count = base.records.length === 0 ? 0 : 1 + Math.floor(random() * 20);
  return Array.from({ length: count }, (_, step) => {
    const node = base.triples.length === 0 || random() < 0.5;
    const item = node ? pick(base.records) : pick(base.triples);
    const row = "label" in item ? { record: item.id } : { triple: item.key };
    const column = pick(columnsOf(item));
    const after = valueFor(column, step);
    return {
      changes: [{ row, column, before: undefined, after }],
      effect: { drew: [], undrew: [] },
    };
  });
}

const keys = Object.keys(fixtures).filter(
  (key) => normalize(loadFixture(key).input, { now: NOW }).ok,
);

function baseOf(key: string): Graph {
  const result = normalize(loadFixture(key).input, { now: NOW });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return deepFreeze(result.graph);
}

describe("S15 undo of all edits gives the base graph", () => {
  it("covers each fixture that normalizes", () => {
    expect(keys.length).toBeGreaterThan(30);
  });

  it.each(keys)("%s", (key) => {
    const base = baseOf(key);
    SEEDS.forEach((seed) => {
      const edits = randomEdits(base, seed);
      expect(randomEdits(base, seed)).toEqual(edits);
      const edited = applyEdits(base, edits, NOW);
      expect(applyEdits(base, edits, NOW)).toEqual(edited);
      const history = new EditHistory();
      edits.forEach((edit) => history.push(edit));
      expect(applyEdits(base, history.active(), NOW)).toEqual(edited);
      const half = Math.floor(edits.length / 2);
      for (let i = 0; i < half; i++) history.undo();
      const kept = edits.slice(0, edits.length - half);
      expect(applyEdits(base, history.active(), NOW)).toEqual(
        applyEdits(base, kept, NOW),
      );
      while (history.done.length > 0) history.undo();
      expect(applyEdits(base, history.active(), NOW)).toEqual(base);
    });
  });
});

// why: SA addendum 0.33 (11) (b), (c) — a save keeps the edited graph; a cancel gives the graph of
// the last save
describe("STORY-008-09 save and cancel keep the graph of the last save", () => {
  it.each(keys)("%s", (key) => {
    const base = baseOf(key);
    SEEDS.forEach((seed) => {
      const edits = randomEdits(base, seed);
      const half = Math.floor(edits.length / 2);
      const history = new EditHistory();
      edits.slice(0, half).forEach((edit) => history.push(edit));
      const before = applyEdits(base, history.active(), NOW);
      history.save();
      expect(applyEdits(base, history.active(), NOW)).toEqual(before);
      edits.slice(half).forEach((edit) => history.push(edit));
      history.undo();
      history.cancel();
      expect(applyEdits(base, history.active(), NOW)).toEqual(before);
      expect(history.dirty()).toBe(false);
    });
  });
});
