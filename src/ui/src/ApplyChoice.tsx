import type { Lang } from "@qdic-topology/engine";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import type { Ask } from "./cellEdit";
import { MenuItem } from "./Menu";
import { t } from "./strings/index";

type Props = {
  ui: Lang;
  ask: Ask;
  label: string;
  onPick: (all: boolean) => void;
  onCancel: () => void;
};

const ITEM = '[role="menuitem"]';

// why: STORY-008-07 rule 5 (NF-5) — a press outside the choice closes it and saves nothing
function usePressOutside(
  box: { current: HTMLDivElement | null },
  go: () => void,
) {
  const latest = useRef(go);
  latest.current = go;
  useEffect(() => {
    const doc = box.current?.ownerDocument;
    const onPress = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && box.current?.contains(target)) return;
      latest.current();
    };
    doc?.addEventListener("pointerdown", onPress, true);
    return () => doc?.removeEventListener("pointerdown", onPress, true);
  }, [box]);
}

// why: STORY-008-07 rule 5 — ArrowDown and ArrowUp move between the items, Enter picks, Escape
// closes; the event stops here, so the editor neither saves nor cancels
function keysOf(box: { current: HTMLDivElement | null }, onCancel: () => void) {
  return (event: KeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    const at = items.indexOf(event.target as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[Math.max(0, Math.min(items.length - 1, at + step))]?.focus();
    } else if (event.key === "Enter") items[at]?.click();
    else if (event.key === "Escape") onCancel();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
}

// why: STORY-008-07 rules 2, 5 (PRD-002 FR-CELL-6; P18) — "Apply to this row only" or "Apply to all
// N rows (M not shown)" under the cell, one line per option, with the parts of the `Menu`
// primitive (`.menu`, `role="menu"`, `MenuItem`); it opens with no button, so it keeps its own
// keys and press outside (Implementer readiness). The texts are fixed texts with numbers
export function ApplyChoice({ ui, ask, label, onPick, onCancel }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    box.current?.querySelector<HTMLElement>(ITEM)?.focus();
  }, []);
  usePressOutside(box, onCancel);
  const { count, hidden } = ask;
  return (
    <div
      ref={box}
      class="menu"
      role="menu"
      aria-labelledby={label}
      onKeyDown={keysOf(box, onCancel)}
    >
      <MenuItem kind="action" onSelect={() => onPick(false)}>
        {t(ui, "edit.thisRow")}
      </MenuItem>
      <MenuItem kind="action" onSelect={() => onPick(true)}>
        {hidden > 0
          ? t(ui, "edit.allRowsHidden", { count, hidden })
          : t(ui, "edit.allRows", { count })}
      </MenuItem>
    </div>
  );
}
