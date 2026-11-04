import { keyIs } from "./custom";
import { inKeyScope, targetOf } from "./eventScope";
import { batch, signal } from "@preact/signals";
import type { RefObject } from "preact";
import { useEffect, useLayoutEffect } from "preact/hooks";
import type { ShellHost } from "./host";
import { isField } from "./Search";
import {
  DEFAULT_RATIO,
  MAX_RATIO,
  MIN_RATIO,
  readRatio,
  writeRatio,
} from "./splitRatio";

export type Layout = "canvas-only" | "split" | "table-full";

// why: FR-HOST-2, rule 9, reading d4 — the Workbench layout is view state, so it lives in the
// module that owns it; `ratio` is the canvas share of the split height (mockup app.js line 1001)
export const layout = signal<Layout>("canvas-only");
export const ratio = signal(DEFAULT_RATIO);

// why: rule 10 (mockup app.js lines 1291-1295) — one step of the handle keys and of `[` `]`
const STEP = 0.05;

// why: STORY-004-09 rule 1 (SA §6 row 7) — the Workbench slides on `transform` only, so the
// canvas height changes in one step: at once when the Workbench opens, and one `--panel-dur`
// after it starts to close; `canvasLayout` is the layout that the canvas height shows
const PANEL_MS = 300;
const canvasLayout = signal<Layout>("canvas-only");
let step: ReturnType<typeof setTimeout> | undefined;

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

function setLayout(next: Layout): void {
  clearTimeout(step);
  const later = next === "canvas-only" && !reducedMotion();
  batch(() => {
    layout.value = next;
    if (!later) canvasLayout.value = next;
  });
  if (later)
    step = setTimeout(() => (canvasLayout.value = "canvas-only"), PANEL_MS);
}

// why: rule 11 — the stored share is read once, when the App mounts; the App starts canvas-only
export function startSplit(): void {
  clearTimeout(step);
  batch(() => {
    layout.value = "canvas-only";
    canvasLayout.value = "canvas-only";
    ratio.value = readRatio();
  });
}

// why: rule 9 — `openWorkbench()` opens the split layout for the STORY-004-08 notice action
export const openWorkbench = () => setLayout("split");

export const closeWorkbench = () => setLayout("canvas-only");

// why: rule 9 (mockup `toggleWorkbench`, app.js line 1261) — the Dataset button and Ctrl/Cmd+.
export const toggleWorkbench = () =>
  setLayout(layout.value === "canvas-only" ? "split" : "canvas-only");

export const isOpen = () => layout.value !== "canvas-only";

// why: QA Done gate item 5 — a fatal input has no Workbench, so the split shows canvas-only
export const layoutFor = (table: boolean): Layout =>
  table ? layout.value : "canvas-only";

// why: rule 9, SA §4.3 reading d3 (FR-HOST-2) — each press that opens `table-full` asks the host for
// fullscreen once; the layout does not wait for the answer, and a refusal changes nothing
export function expandTable(host: ShellHost): void {
  if (layout.value === "table-full") {
    setLayout("split");
    return;
  }
  setLayout("table-full");
  void host.requestDisplayMode("fullscreen").catch(() => undefined);
}

// why: rule 9 (mockup `setWbLayout`, app.js lines 1246-1257) — the canvas share of the split
// height; the Workbench takes the rest
function canvasShare(now: Layout, share: number): number {
  if (now === "canvas-only") return 1;
  if (now === "table-full") return 0;
  return share;
}

// why: STORY-004-09 rule 1 — the measured split height; null until the first measure, so the
// canvas fills the split by its CSS rule before it
const splitHeight = signal<number | null>(null);

export function canvasStyle(table: boolean) {
  const height = splitHeight.value;
  if (height === null) return undefined;
  const shown = table ? canvasLayout.value : "canvas-only";
  const px = Math.round(height * canvasShare(shown, ratio.value));
  return { flex: "none", height: `${px}px` };
}

export function useSplitHeight(anchor: RefObject<HTMLElement>): void {
  useLayoutEffect(() => {
    const split = anchor.current;
    if (split === null) return;
    splitHeight.value = split.getBoundingClientRect().height;
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((one) => one.target === split);
      if (entry !== undefined) splitHeight.value = entry.contentRect.height;
    });
    observer.observe(split);
    return () => {
      observer.disconnect();
      splitHeight.value = null;
    };
  }, [anchor]);
}

export const tableShare = (share: number) => Math.round((1 - share) * 100);

// why: mockup `split.dataset.dragging` (app.js line 1283) — the handle look while it moves
export const dragging = signal(false);

// why: rule 10 — the canvas share is rounded to 2 decimals and kept in 0.2-0.8
export function setRatio(next: number): void {
  if (!Number.isFinite(next)) return;
  const rounded = Math.round(next * 100) / 100;
  ratio.value = Math.min(MAX_RATIO, Math.max(MIN_RATIO, rounded));
}

export const saveRatio = () => writeRatio(ratio.value);

export function stepRatio(tableLarger: boolean): void {
  setRatio(ratio.value + (tableLarger ? -STEP : STEP));
  saveRatio();
}

// why: NF-5, rules 9 and 10 (mockup app.js lines 1265-1271; H5) — `ctrlKey || metaKey` with "."
// toggles the Workbench on every platform; `[` makes the table smaller and `]` larger while it
// is open. In a text field each key types its character
function onSplitKey(event: KeyboardEvent): void {
  if (!inKeyScope(event) || isField(targetOf(event))) return;
  if (keyIs("toggleTable", event)) {
    event.preventDefault();
    toggleWorkbench();
    return;
  }
  const larger = keyIs("tableLarger", event);
  if (!larger && !keyIs("tableSmaller", event)) return;
  if (!isOpen()) return;
  event.preventDefault();
  stepRatio(larger);
}

export function useSplitKeys(
  anchor: RefObject<HTMLElement>,
  table: boolean,
): void {
  useEffect(() => {
    const doc = anchor.current?.ownerDocument;
    if (!table) return;
    doc?.addEventListener("keydown", onSplitKey);
    return () => doc?.removeEventListener("keydown", onSplitKey);
  }, [anchor, table]);
}
