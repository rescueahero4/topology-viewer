import { partsOn } from "./partDom";
import type { Designed, Hex, Visual } from "#engine";
import { spriteColours, typeMark } from "#renderer";
import { useLayoutEffect, useRef } from "preact/hooks";
import { guarded } from "./canvas/index";

type Props = { visual: Visual | null; size: number; untyped: Designed | null };

// why: gap G6, rule 10, B4 — the only shell file that takes a value from the renderer; the mark is
// an element that the renderer builds, so it goes into the page through a ref, not as markup
export function TypeGlyph({ visual, size, untyped }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    ref.current?.replaceChildren(typeMark(visual, size, untyped));
    // The renderer builds this element, so the hook of the vnodes does not see it.
    if (partsOn()) ref.current?.firstElementChild?.setAttribute("part", "type-mark");
  }, [visual, size, untyped]);
  return <span ref={ref} aria-hidden="true" />;
}

// why: STORY-004-04 rule 2, B4 amendment (Solutions Architect, 2026-10-21) — the colour of the
// canvas node: a designed visual is already guarded by `resolveVocab`; a profile icon takes its
// sprite colour through the canvas `guarded` against the canvas colour; no sprite colour gives null
export function typeColour(visual: Visual | null, canvas: Hex): Hex | null {
  if (visual === null) return null;
  if (!("icon" in visual)) return visual.color;
  const colour = spriteColours.get(visual.icon);
  return colour === undefined ? null : guarded(colour, canvas);
}
