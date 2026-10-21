import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { closeWorkbench } from "./split";

// why: FR-CANVAS-17, FR-HOST-2 (PRD 0.10.7) — the width below which the shell makes room
const NARROW_PX = 760;

// why: a width of 0 is a frame that has no layout yet (the `zero-size` case), not a narrow column
const isNarrow = (width: number) => width > 0 && width < NARROW_PX;

// why: STORY-004-09 rule 4 (H10, README question 25) — the App watches the width of its own root,
// not the window. When the width goes below 760 px, the Workbench closes first and the inspector
// collapses in the next update of the same crossing; a first render below 760 px starts with the
// inspector collapsed. A wider root changes nothing, so a user choice stays. The root carries
// `data-narrow` for the narrow placement of shell-narrow.css
export function useNarrow(
  root: RefObject<HTMLElement>,
  collapse: () => void,
): void {
  const [crossings, setCrossings] = useState(0);
  useLayoutEffect(() => {
    if (crossings > 0) collapse();
  }, [crossings]);
  useLayoutEffect(() => {
    const el = root.current;
    if (el === null) return;
    let below = isNarrow(el.getBoundingClientRect().width);
    el.toggleAttribute("data-narrow", below);
    if (below) collapse();
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((one) => one.target === el);
      if (entry === undefined) return;
      const now = isNarrow(entry.contentRect.width);
      if (now && !below) {
        closeWorkbench();
        setCrossings((count) => count + 1);
      }
      below = now;
      el.toggleAttribute("data-narrow", now);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);
}
