import type { CanvasState, Lang } from "@qdic-topology/engine";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { AppInput } from "./App";
import { createCanvas, type Camera, type Canvas } from "./canvas/index";
import { localVocab } from "./names";
import { rendererText } from "./rendererText";
import { feed, takeInput } from "./state";

// why: STORY-004-08 rules 3 and 6 — what a new canvas starts from: the prop input, or the input,
// state and camera of an Undo, or the same input again for "Try again"
export type Start = { input: AppInput; state?: CanvasState; camera?: Camera };
type Again = { over: Start; start: Start };

const hasSize = (el: Element) => {
  const { width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0;
};

// why: SA §5 Errors, STORY-004-08 rule 1 (b) — a throw of the factory goes to the fallback notice
function make(parent: HTMLElement, start: Start, lang: Lang) {
  if (!start.input.ok) return null;
  const container = parent.ownerDocument.createElement("div");
  container.className = "graph-canvas";
  parent.appendChild(container);
  const { vocab } = start.input.model;
  try {
    const made = createCanvas(container, {
      text: rendererText(lang),
      model: { ...start.input.model, vocab: localVocab(lang, vocab) },
      ...(start.state === undefined ? {} : { state: start.state }),
      ...(start.camera === undefined ? {} : { camera: start.camera }),
    });
    return { made, container };
  } catch {
    container.remove();
    return "failed" as const;
  }
}

// why: SA §5 UI, rule 5 — the one way from a component to the canvas. The hook makes the canvas
// container, feeds `state.ts` from the five events, and on a new input, a new language or an
// unmount removes the container, so the canvas ends itself (owner decision H8)
export function useRenderer(input: AppInput, lang: Lang) {
  const host = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [failed, setFailed] = useState(false);
  const prop = useMemo<Start>(() => ({ input }), [input]);
  const [again, setAgain] = useState<Again | null>(null);
  const start = again !== null && again.over === prop ? again.start : prop;
  const waiting = useRef<ResizeObserver | null>(null);
  const stopWaiting = () => {
    waiting.current?.disconnect();
    waiting.current = null;
  };
  useLayoutEffect(() => stopWaiting, [prop]);
  useLayoutEffect(() => {
    takeInput(start.input);
    const parent = host.current;
    const built = parent === null ? null : make(parent, start, lang);
    setFailed(built === "failed");
    if (built === null || built === "failed") return;
    const { made, container } = built;
    const off = [
      made.on("select", feed.select),
      made.on("explore", feed.explore),
      made.on("drag-end", feed["drag-end"]),
      made.on("settle", feed.settle),
      made.on("notice", feed.notice),
    ];
    setCanvas(made);
    return () => {
      for (const stop of off) stop();
      container.remove();
      setCanvas(null);
    };
  }, [start, lang]);
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
      const observer = new ResizeObserver(() => {
        if (!hasSize(parent)) return;
        stopWaiting();
        go();
      });
      waiting.current = observer;
      observer.observe(parent);
    },
    [prop],
  );
  return { host, canvas, failed, shown: start.input, remake };
}
