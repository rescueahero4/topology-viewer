import { columnKey, type Column } from "./workbenchColumns";
import type { Row } from "./workbenchRows";

// why: STORY-008-04 rule 3 — a cell is named by its row index and its column key, so the focus and
// the edit stay on the same cell through an edit (the shown order stays, FR-CELL-10)
export type At = { index: number; key: string };

export const sameAt = (a: At | null, b: At | null) =>
  a !== null && b !== null && a.index === b.index && a.key === b.key;

export const atOf = (row: Row, column: Column): At => ({
  index: row.index,
  key: columnKey(column),
});

type Place = { row: number; col: number };

function placeOf(
  rows: readonly Row[],
  columns: readonly Column[],
  at: At | null,
): Place | null {
  if (at === null) return null;
  const row = rows.findIndex((r) => r.index === at.index);
  const col = columns.findIndex((c) => columnKey(c) === at.key);
  return row < 0 || col < 0 ? null : { row, col };
}

// why: STORY-008-04 rule 3 (mockup Hidden list, app.js lines 946-955) — the table body is one tab
// stop: the last focused cell while it is shown, else the first cell of the first shown row
export function tabStop(
  rows: readonly Row[],
  columns: readonly Column[],
  at: At | null,
): At | null {
  if (placeOf(rows, columns, at) !== null) return at;
  return rows.length === 0 || columns.length === 0
    ? null
    : atOf(rows[0], columns[0]);
}

const STEPS: Readonly<Record<string, Place>> = {
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
};

export const isArrow = (key: string) => Object.hasOwn(STEPS, key);

// why: STORY-008-04 rule 3 — an arrow key moves to the next cell in that direction in the shown
// order; at the edge of the table the focus stays
export function moved(
  rows: readonly Row[],
  columns: readonly Column[],
  at: At,
  key: string,
): { at: At; row: number } | null {
  const now = placeOf(rows, columns, at);
  if (now === null || !isArrow(key)) return null;
  const step = STEPS[key];
  const row = Math.min(rows.length - 1, Math.max(0, now.row + step.row));
  const col = Math.min(columns.length - 1, Math.max(0, now.col + step.col));
  return { at: atOf(rows[row], columns[col]), row };
}

export type Part = { pad: number; key: string } | { at: number };

// why: STORY-008-04 rules 3, 9 — the rendered rows are the row window and each kept row outside
// it (the row in edit, the focused row), with spacer rows of the left-out height between them
export function partsOf(
  first: number,
  last: number,
  count: number,
  keep: readonly number[],
): Part[] {
  const shown = new Set<number>();
  for (let at = first; at < last; at++) shown.add(at);
  for (const at of keep) if (at >= 0) shown.add(at);
  const order = [...shown].sort((a, b) => a - b);
  const parts: Part[] = [];
  let next = 0;
  for (const at of order) {
    if (at > next) parts.push({ pad: at - next, key: `pad-${next}` });
    parts.push({ at });
    next = at + 1;
  }
  if (count > next) parts.push({ pad: count - next, key: `pad-${next}` });
  return parts;
}

// why: STORY-008-04 rule 3 — a focus move to a row outside the view scrolls it into view under
// the sticky head of the table
export function scrollTo(el: HTMLElement, row: number, rowH: number): void {
  const head = el.querySelector("thead")?.offsetHeight ?? 0;
  const top = head + row * rowH;
  if (top < el.scrollTop + head) el.scrollTop = row * rowH;
  else if (top + rowH > el.scrollTop + el.clientHeight)
    el.scrollTop = top + rowH - el.clientHeight;
}
