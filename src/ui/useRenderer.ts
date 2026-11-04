import type { Budget, CanvasState, Grouping, Lang, LayoutName } from "#engine";
import { releaseNodeSlots } from "./canvasHooks";
import { liveCanvas, startCustomFilters } from "./commands";
import { peekOption } from "./custom";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { AppInput, AppProps } from "./App";
import { createCanvas, type Camera, type Canvas } from "./canvas/index";
import { localVocab } from "./names";
import { rendererText } from "./rendererText";
import { editedModel, feed, takeInput } from "./state";

// why: STORY-004-08 rules 3 and 6 — what a new canvas starts from: the prop input, or the input,
// state and camera of an Undo, or the same input again for "Try again"
export type Start = { input: AppInput; state?: CanvasState; camera?: Camera };
type Again = { over: Start; start: Start };

const hasSize = (el: Element) => {
  const { width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0;
};

// why: STORY-006-03 rule 4, EPIC-003 B14 — a canvas with a saved camera waits for a container size
function whenSized(el: Element, go: () => void): () => void {
  const observer = new ResizeObserver(() => {
    if (!hasSize(el)) return;
    observer.disconnect();
    go();
  });
  observer.observe(el);
  return () => observer.disconnect();
}

// why: SA §5 Errors, STORY-004-08 rule 1 (b) — a throw of the factory goes to the fallback notice.
// STORY-008-02 rule 8 (PRD-002 FR-CELL-14) — the canvas gets the edited model of the input
function make(parent: HTMLElement, start: Start, lang: Lang) {
  const model = editedModel.peek();
  if (!start.input.ok || model === null) return null;
  const container = parent.ownerDocument.createElement("div");
  container.className = "graph-canvas";
  parent.appendChild(container);
  try {
    const made = createCanvas(container, {
      text: rendererText(lang),
      model: { ...model, vocab: localVocab(lang, model.vocab) },
      ...(start.state === undefined ? {} : { state: start.state }),
      ...(start.camera === undefined ? {} : { camera: start.camera }),
    });
    return { made, container };
  } catch {
    container.remove();
    return "failed" as const;
  }
}

// The defaults of the developer for a new chart. A view that the payload asks for wins.
function startState(made: Canvas): void {
  const view = editedModel.peek()?.payload.view;
  const off = (part: string, run: (name: string) => void) =>
    (peekOption<readonly string[]>(part, "off") ?? []).forEach(run);
  off("filter-families", (family) =>
    made.setFilters({ kind: "toggleFamily", family, on: false }),
  );
  off("filters", (predicate) =>
    made.setFilters({ kind: "togglePredicate", predicate, on: false }),
  );
  off("types-menu", (type) =>
    made.setFilters({ kind: "toggleType", type, on: false }),
  );
  const grouping = peekOption<Grouping>("grouping-menu", "default");
  if (grouping !== undefined) made.setFilters({ kind: "grouping", grouping });
  const budget = peekOption<Budget>("scope-menu", "default");
  if (budget !== undefined && view?.budget === undefined) made.setBudget(budget);
  const layout = peekOption<LayoutName>("layout-menu", "default");
  if (layout !== undefined && view?.layout === undefined) made.setLayout(layout);
  startCustomFilters();
}

// why: rule 5 — the five events feed `state.ts`; STORY-006-03 rule 4 — each `settle` also goes to
// the `onSettle` prop
function listen(
  made: Canvas,
  onSettle: { current: AppProps["onSettle"] },
  onSelect: { current: AppProps["onSelect"] },
) {
  return [
    made.on("select", (e) => {
      feed.select(e);
      onSelect.current?.(e.selection);
    }),
    made.on("explore", feed.explore),
    made.on("drag-end", feed["drag-end"]),
    made.on("settle", (e) => {
      feed.settle(e);
      onSettle.current?.(e.state, e.camera);
    }),
    made.on("notice", feed.notice),
  ];
}

// why: SA §5 UI, rule 5 — the one way from a component to the canvas. The hook makes the canvas
// container, feeds `state.ts` from the five events, and on a new input, a new language or an
// unmount removes the container, so the canvas ends itself (owner decision H8)
export function useRenderer(
  input: AppInput,
  lang: Lang,
  from: Pick<AppProps, "onSettle" | "onSelect" | "start"> = {},
) {
  const host = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [failed, setFailed] = useState(false);
  const [sized, setSized] = useState(0);
  const onSettle = useRef(from.onSettle);
  onSettle.current = from.onSettle;
  const onSelect = useRef(from.onSelect);
  onSelect.current = from.onSelect;
  // why: STORY-006-03 rule 4 — the `start` that comes with an input belongs to that input only
  const prop = useMemo<Start>(() => ({ input, ...from.start }), [input]);
  const [again, setAgain] = useState<Again | null>(null);
  const start = again !== null && again.over === prop ? again.start : prop;
  const waiting = useRef<(() => void) | null>(null);
  const stopWaiting = () => {
    waiting.current?.();
    waiting.current = null;
  };
  useLayoutEffect(() => stopWaiting, [prop]);
  useLayoutEffect(() => {
    // why: STORY-008-02 rule 7 — only a prop input with a saved start (a theme or locale change)
    // keeps the edits by the base hash; a remake keeps them only for the same input
    const saved = start === prop && start.state !== undefined;
    takeInput(start.input, saved ? "hash" : "same");
    const parent = host.current;
    if (parent !== null && start.camera !== undefined && !hasSize(parent))
      return whenSized(parent, () => setSized((n) => n + 1));
    const built = parent === null ? null : make(parent, start, lang);
    setFailed(built === "failed");
    if (built === null || built === "failed") return;
    const { made, container } = built;
    const off = listen(made, onSettle, onSelect);
    setCanvas(made);
    liveCanvas.value = made;
    if (start.state === undefined) startState(made);
    return () => {
      for (const stop of off) stop();
      releaseNodeSlots();
      liveCanvas.value = null;
      container.remove();
      setCanvas(null);
    };
  }, [start, lang, sized]);
  // why: STORY-004-08 rule 6, EPIC-003 B14 — a new canvas with a saved camera is made only in a
  // container with a size; the current canvas stays until the first size above 0 × 0
  const remake = useCallback(
    (next: Start) => {
      stopWaiting();
      const parent = host.current;
      const go = () => setAgain({ over: prop, start: { ...next } });
      if (parent === null || next.camera === undefined || hasSize(parent)) {
        go();
        return;
      }
      waiting.current = whenSized(parent, go);
    },
    [prop],
  );
  return { host, canvas, failed, shown: start.input, remake };
}
