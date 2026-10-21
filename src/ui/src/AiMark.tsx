import { useId } from "preact/hooks";
import { lang } from "./state";
import { t, type Key } from "./strings/index";
import type { Tip } from "./Tooltip";

export type Mark = { kind: "inferred" | "mapped" | "label"; reason: string };

const NAMES: Readonly<Record<Mark["kind"], Key>> = {
  inferred: "ai.inferred",
  mapped: "ai.mapped",
  label: "ai.label",
};

// why: FR-INSPECT-3, ddr-0050, rule 8 (H4 (b)) — the mockup `.ai-mark` (styles.css line 240): the
// name comes from a text node by `aria-labelledby`, and the reason shows in the shared `Tooltip`
// on hover, on keyboard focus and on a touch press; a second touch press, Escape or blur hides it.
// No attribute holds the reason
export function AiMark({ tip, mark }: { tip: Tip; mark: Mark }) {
  const id = useId();
  const ui = lang.value;
  const name = t(ui, NAMES[mark.kind]);
  const reason =
    mark.kind === "mapped" && mark.reason === ""
      ? t(ui, "ai.mappedDefault")
      : mark.reason;
  const text = reason === "" ? name : t(ui, "ai.tip", { name, reason });
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") tip.toggle(id, text, event);
  };
  return (
    <>
      <span
        class="ai-mark"
        tabIndex={0}
        role="note"
        aria-labelledby={`${id}-name`}
        {...tip.anchor(id, text)}
        onPointerDown={onPointerDown}
      >
        {t(ui, "ai.badge")}
      </span>
      <span id={`${id}-name`} hidden>
        {name}
      </span>
    </>
  );
}
