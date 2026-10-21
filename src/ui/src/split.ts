import { batch, signal } from "@preact/signals";
import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";
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

// why: rule 11 — the stored share is read once, when the App mounts; the App starts canvas-only
export function startSplit(): void {
  batch(() => {
    layout.value = "canvas-only";
    ratio.value = readRatio();
  });
}

// why: rule 9 — `openWorkbench()` opens the split layout for the STORY-004-08 notice action
export function openWorkbench(): void {
  layout.value = "split";
}

// why: rule 9 (mockup `toggleWorkbench`, app.js line 1261) — the Dataset button and Ctrl/Cmd+.
export function toggleWorkbench(): void {
  layout.value = layout.value === "canvas-only" ? "split" : "canvas-only";
}

export const isOpen = () => layout.value !== "canvas-only";

// why: QA Done gate item 5 — a fatal input has no Workbench, so the split shows canvas-only
export const layoutFor = (table: boolean): Layout =>
  table ? layout.value : "canvas-only";

// why: rule 9, SA §4.3 reading d3 (FR-HOST-2) — each press that opens `table-full` asks the host for
// fullscreen once; the layout does not wait for the answer, and a refusal changes nothing
export function expandTable(host: ShellHost): void {
  if (layout.value === "table-full") {
    layout.value = "split";
    return;
  }
  layout.value = "table-full";
  void host.requestDisplayMode("fullscreen").catch(() => undefined);
}

// why: rule 9 (mockup `setWbLayout`, app.js lines 1246-1257) — the flex-grow share of the canvas and
// of the Workbench; the layout changes at once (STORY-004-09 adds the motion)
export function grows(now: Layout, share: number) {
  if (now === "canvas-only") return { canvas: 1, table: 0 };
  if (now === "table-full") return { canvas: 0, table: 1 };
  return { canvas: share, table: 1 - share };
}

export const canvasGrow = (table: boolean) =>
  String(grows(layoutFor(table), ratio.value).canvas);

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
  if (isField(event.target)) return;
  if (event.key === "." && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    toggleWorkbench();
    return;
  }
  if (event.key !== "[" && event.key !== "]") return;
  if (!isOpen() || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  stepRatio(event.key === "]");
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
