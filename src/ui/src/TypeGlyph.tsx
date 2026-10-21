import type { Designed, Visual } from "@qdic-topology/engine";
import { typeMark } from "@qdic-topology/renderer";
import { useLayoutEffect, useRef } from "preact/hooks";

type Props = { visual: Visual | null; size: number; untyped: Designed | null };

// why: gap G6, rule 10, B4 — the only shell file that takes a value from the renderer; the mark is
// an element that the renderer builds, so it goes into the page through a ref, not as markup
export function TypeGlyph({ visual, size, untyped }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    ref.current?.replaceChildren(typeMark(visual, size, untyped));
  }, [visual, size, untyped]);
  return <span ref={ref} aria-hidden="true" />;
}
