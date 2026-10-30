import type { EditCode, Lang } from "@qdic-topology/engine";
import { h, type ComponentChildren, type RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cellValue, inputOf, type Read, type Saved } from "./cellEdit";
import { CellEditor, type Close } from "./CellEditor";
import { valueItems } from "./pickItems";
import { editedModel } from "./state";
import { coreName, columnKey, type Column } from "./workbenchColumns";
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

type Check = (row: Row, column: Column, read: Read) => EditCode | null;
type Save = (row: Row, column: Column, read: Read) => Saved;

export type Nav = {
  tab: boolean;
  focus?: RefObject<HTMLTableCellElement>;
  onFocus: () => void;
  onDblClick: () => void;
  editor: ComponentChildren | null;
};

type Table = {
  rows: readonly Row[];
  columns: readonly Column[];
  ui: Lang;
  rowH: number;
  scroll: RefObject<HTMLDivElement>;
  measure: (force: boolean) => void;
  press: (row: Row) => void;
  onCheck: Check;
  onSave: Save;
};

const nameOf = (ui: Lang, column: Column) =>
  "attr" in column ? column.attr : coreName(ui, column.core);

// why: STORY-008-04 rule 4 — after a save by a press outside, the focus goes back to the cell when
// the press gave the focus to no other element (the browser moves the focus after `pointerdown`)
function useLater(cell: RefObject<HTMLTableCellElement>) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const doc = cell.current?.ownerDocument;
      const now = doc?.activeElement ?? null;
      if (now === null || now === doc?.body)
        cell.current?.focus({ preventScroll: true });
    }, 0);
  };
}

type Editing = {
  table: Table;
  holder: { current: (() => boolean) | null };
  onClose: (how: Close) => void;
};

function editorOf(
  { table, holder, onClose }: Editing,
  row: Row,
  column: Column,
) {
  const value = cellValue(row, column);
  const kind = inputOf(row, column, value);
  if (kind === null) return null;
  const { ui } = table;
  const graph = editedModel.peek()?.graph;
  const key = "attr" in column ? column.attr : "service_name";
  const values =
    kind === "values" && graph !== undefined ? valueItems(graph, key) : [];
  return h(CellEditor, {
    ...{ ui, kind, value, name: nameOf(ui, column), holder, onClose, values },
    check: (read: Read) => table.onCheck(row, column, read),
    save: (read: Read) => table.onSave(row, column, read),
  });
}

// why: STORY-008-04 rule 3 — an arrow key moves the focus and scrolls the new row into view
function arrowTo(table: Table, at: At, key: string): At | null {
  const next = moved(table.rows, table.columns, at, key);
  const el = table.scroll.current;
  if (next === null || el === null) return null;
  scrollTo(el, next.row, table.rowH);
  table.measure(true);
  return next.at;
}

// why: STORY-008-04 rules 3, 4 — after a key move, a save or a cancel by a key, the render
// focuses the tab-stop cell (the page already scrolled it into view)
function useFocusAfter(cell: RefObject<HTMLTableCellElement>) {
  const want = useRef(false);
  useLayoutEffect(() => {
    if (!want.current) return;
    want.current = false;
    cell.current?.focus({ preventScroll: true });
  });
  return want;
}

// why: STORY-008-04 rules 2, 3, 4, 9 — the focused cell (the one tab stop), the cell in edit, the
// start by double-click and F2 (it first saves an open editor), the arrow keys, Enter on a cell,
// and the focus back to the cell after a save or a cancel
export function useCells(table: Table) {
  const { rows, columns } = table;
  const [active, setActive] = useState<At | null>(null);
  const [editing, setEditing] = useState<At | null>(null);
  const cell = useRef<HTMLTableCellElement>(null);
  const want = useFocusAfter(cell);
  const holder = useRef<(() => boolean) | null>(null);
  const later = useLater(cell);
  const stop = tabStop(rows, columns, active);
  const posOf = (at: At | null) =>
    at === null ? -1 : rows.findIndex((r) => r.index === at.index);
  const open = posOf(editing) >= 0 ? editing : null;
  const close = (how: Close) => {
    holder.current = null;
    setEditing(null);
    if (how === "key") want.current = true;
    if (how === "press") later();
  };
  const start = (row: Row, column: Column) => {
    if (inputOf(row, column, cellValue(row, column)) === null) return;
    if (open !== null && holder.current !== null && !holder.current()) return;
    const at = atOf(row, column);
    setActive(at);
    setEditing(at);
  };
  const nav = (row: Row, column: Column): Nav => {
    const at = atOf(row, column);
    const tab = sameAt(at, stop);
    return {
      tab,
      ...(tab ? { focus: cell } : {}),
      onFocus: () => {
        if (!sameAt(at, active)) setActive(at);
      },
      onDblClick: () => start(row, column),
      editor: sameAt(at, open)
        ? editorOf({ table, holder, onClose: close }, row, column)
        : null,
    };
  };
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as Element;
    if (stop === null || target.tagName !== "TD") return;
    const row = rows[posOf(stop)];
    const column = columns.find((c) => columnKey(c) === stop.key);
    if (row === undefined || column === undefined) return;
    if (event.key === "F2") start(row, column);
    else if (event.key === "Enter") table.press(row);
    else if (isArrow(event.key)) {
      const next = arrowTo(table, stop, event.key);
      if (next === null) return;
      want.current = true;
      setActive(next);
    } else return;
    event.preventDefault();
  };
  // why: rule 9 — the row in edit stays rendered; the focused row too, once the user focused a cell
  const kept = active === null ? -1 : posOf(stop);
  return { nav, onKey, keep: [posOf(open), kept] };
}
