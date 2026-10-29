import { useRef } from "preact/hooks";

type Kept = {
  inputs: readonly unknown[];
  version: number;
  settled: unknown;
  pending: number;
  order: readonly number[];
};

const same = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, at) => Object.is(value, b[at]));

// why: STORY-008-02 rule 5 — a value that only a new shown list needs (the sort) is made when the
// list is made, not on each edit
export function useLazy<T>(deps: readonly unknown[], make: () => T): () => T {
  const made = useRef<{ deps: readonly unknown[]; value: T } | null>(null);
  return () => {
    const last = made.current;
    if (last !== null && same(last.deps, deps)) return last.value;
    const value = make();
    made.current = { deps, value };
    return value;
  };
}

// why: STORY-008-02 rule 5 (PRD-002 FR-CELL-10) — an edit, an Undo and a Redo keep the order and
// the membership of the shown rows. The list is made again only when one of `inputs` changes (the
// base model, the sort, the filters, the language), or when a `settle` that no edit caused changes
// the canvas state: each new `editHistory` version waits for one `settle` of its canvas edit
// (STORY-008-03 rule 8). The list holds row indices, because an edit changes an edge row id
export function useKeptOrder(
  inputs: readonly unknown[],
  edits: { version: number; settled: unknown },
  fresh: () => readonly number[],
): readonly number[] {
  const kept = useRef<Kept | null>(null);
  const { version, settled } = edits;
  const last = kept.current;
  const steps = last === null ? 0 : Math.max(0, version - last.version);
  const settle = last !== null && settled !== last.settled;
  if (
    last === null ||
    !same(last.inputs, inputs) ||
    (settle && steps === 0 && last.pending === 0)
  ) {
    kept.current = { inputs, version, settled, pending: 0, order: fresh() };
    return kept.current.order;
  }
  const pending = Math.max(0, last.pending + steps - (settle ? 1 : 0));
  kept.current = { ...last, version, settled, pending };
  return last.order;
}
