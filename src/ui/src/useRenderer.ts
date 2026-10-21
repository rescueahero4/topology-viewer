import type { Lang } from "@qdic-topology/engine";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { AppInput } from "./App";
import { createCanvas, type Canvas } from "./canvas/index";
import { localVocab } from "./names";
import { rendererText } from "./rendererText";
import { feed, takeInput } from "./state";

// why: SA §5 UI, rule 5 — the one way from a component to the canvas. The hook makes the canvas
// container, feeds `state.ts` from the five events, and on a new input, a new language or an
// unmount removes the container, so the canvas ends itself (owner decision H8)
export function useRenderer(input: AppInput, lang: Lang) {
  const host = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  useLayoutEffect(() => {
    takeInput(input);
    const parent = host.current;
    if (!input.ok || parent === null) return;
    const container = parent.ownerDocument.createElement("div");
    container.className = "graph-canvas";
    parent.appendChild(container);
    const { vocab } = input.model;
    const made = createCanvas(container, {
      text: rendererText(lang),
      model: { ...input.model, vocab: localVocab(lang, vocab) },
    });
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
  }, [input, lang]);
  return { host, canvas };
}
