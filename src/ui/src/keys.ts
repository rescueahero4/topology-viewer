import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";
import type { Actions } from "./actions";
import { closeMenu } from "./Menu";
import { isField } from "./Search";
import { closeTips } from "./Tooltip";

// why: STORY-004-09 rule 5 (NF-5, f-0019; LEARNINGS 28 over the mockup app.js lines 987-991) —
// Escape closes an open menu, picker, tooltip or search list and does nothing else; a layer that
// takes the key itself prevents its default. With nothing open and no text field focused, Escape
// clears the selection
export function useEscapeKey(
  anchor: RefObject<HTMLElement>,
  actions: Actions | null,
): void {
  useEffect(() => {
    const doc = anchor.current?.ownerDocument;
    if (doc === undefined || actions === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isField(event.target) || closeMenu() || closeTips()) return;
      actions.select(null);
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [anchor, actions]);
}
