import { keyIs, live } from "./custom";
import { inKeyScope, targetOf } from "./eventScope";
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
      if (!keyIs("escape", event) || event.defaultPrevented) return;
      if (!inKeyScope(event)) return;
      if (isField(targetOf(event)) || closeMenu() || closeTips()) return;
      // The browser exits its own full screen on this key; the viewer exits its own view here. The
      // selection stays.
      if (live.exitOnEscape?.() === true) return;
      actions.select(null);
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [anchor, actions]);
}
