import type { ComponentChildren } from "preact";

const TICK = "M3.5 8.5l3 3 6-7";
const DASH = "M4 8h8";

// why: P17, rule 17 — the mockup `.cb` mark (styles.css lines 159-172) with the tick and the dash
// as inline SVG, so their colour is a token stroke and no data URL holds a colour
export function CheckMark({
  checked,
  partial,
}: {
  checked: boolean;
  partial: boolean;
}) {
  return (
    <span class="cb" aria-hidden="true">
      {(checked || partial) && (
        <svg viewBox="0 0 16 16" fill="none">
          <path d={partial ? DASH : TICK} />
        </svg>
      )}
    </span>
  );
}

type Props = {
  checked: boolean;
  partial?: boolean;
  label: ComponentChildren;
  onChange: (checked: boolean, shift: boolean) => void;
};

// why: P17 — the one multi-select control; a partly checked box turns all on. STORY-004-07 rule 7
// — the Shift key goes with the change, so a Workbench tick can take a range
export function Checkbox({ checked, partial = false, label, onChange }: Props) {
  const toggle = (event: MouseEvent | KeyboardEvent) =>
    onChange(partial || !checked, event.shiftKey);
  return (
    <span
      role="checkbox"
      tabIndex={0}
      class="check"
      aria-checked={partial ? "mixed" : checked}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key !== " ") return;
        event.preventDefault();
        toggle(event);
      }}
    >
      <CheckMark checked={checked} partial={partial} />
      {label}
    </span>
  );
}
