import { act } from "preact/test-utils";
import { vi } from "vitest";
import type { AppInput } from "./App";

// why: STORY-008-04 test plan — the shared steps of the cell editor tests; the caller turns on the
// fake clock and imports this module with `await import` (testFrame.ts rule 15)

export const text = (el: Element | null | undefined) => el?.textContent ?? "";

export function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const mouse = (name: string, el: Element) =>
  el.dispatchEvent(new MouseEvent(name, { bubbles: true, cancelable: true }));

export const click = (el: Element | null | undefined) =>
  run(() => {
    if (el === null || el === undefined) throw new Error("no element");
    mouse("pointerdown", el);
    mouse("mousedown", el);
    mouse("click", el);
  });

// why: rule 2 (FR-CELL-3) — the two clicks of a double-click press the row, then `dblclick` starts
export function dblclick(el: Element | null | undefined): void {
  if (el === null || el === undefined) throw new Error("no element");
  click(el);
  click(el);
  run(() => mouse("dblclick", el));
}

export function key(el: Element | null | undefined, name: string): void {
  run(() => {
    if (el === null || el === undefined) throw new Error("no element");
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

export function type(el: Element | null | undefined, value: string): void {
  const input = el as HTMLInputElement;
  run(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// why: S10 — jsdom has no bad-input state, so the test marks the input as the browser does
export function markBad(el: Element | null | undefined): void {
  const input = el as HTMLInputElement;
  Object.defineProperty(input, "validity", { value: { badInput: true } });
  type(input, "");
}

export const button = (root: Element, name: string) => {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => text(b) === name || b.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};

export const rows = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".wb-table tbody tr.row"),
];

export const heads = (root: Element) =>
  [...root.querySelectorAll(".wb-table thead th")].map((th) =>
    text(th).replace(/ [▲▼]$/, ""),
  );

export function cellOf(root: Element, id: string, column: string) {
  const at = heads(root).indexOf(column);
  const row = rows(root).find(
    (tr) => text(tr.children[heads(root).indexOf("ID")]) === id,
  );
  const td = row?.children[at];
  if (at < 0 || td === undefined) throw new Error(`no cell ${id} ${column}`);
  return td as HTMLTableCellElement;
}

export const editors = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".cell-edit"),
];
export const input = (root: Element) =>
  root.querySelector<HTMLInputElement>(".cell-edit input");
export const message = (root: Element) =>
  text(root.querySelector(".cell-edit .cell-msg"));

export function search(root: Element, value: string): void {
  const box = root.querySelector(".wb-search") as HTMLInputElement;
  void act(() => {
    box.value = value;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  run(() => {
    vi.advanceTimersByTime(200);
  });
}

type Mount = (
  input: AppInput,
  options: { lang: "en" | "ja"; locale: string },
) => Promise<{ root: HTMLElement }>;

// why: the caller gives `mountApp` of `testFrame.ts` (only a test imports it, lint rule 12)
export async function opened(
  mount: Mount,
  input: AppInput,
  lang: "en" | "ja" = "en",
) {
  if (!input.ok) throw new Error("fatal");
  const frame = await mount(input, {
    lang,
    locale: lang === "ja" ? "ja-JP" : "en-US",
  });
  click(button(frame.root, lang === "ja" ? "データセット" : "Dataset"));
  return { ...frame, input };
}

// why: S1, S9 — one node row of each value kind and a list and an object attribute; `b` has no `n`
export const KINDS = {
  nodes: [
    {
      id: "a",
      type: "table",
      label: "A",
      attrs: {
        n: 5,
        d: "2025-02-18",
        dt: "2026-01-02T03:04:05Z",
        z: null,
        bool: true,
        s: "hello",
        list: [1, 2],
        obj: { x: 1 },
        service_name: "svc",
        description: "about",
      },
    },
    { id: "b", type: "table", label: "B", attrs: { s: "x" } },
  ],
  edges: [{ subject: "a", predicate: "contains", object: "b" }],
};
