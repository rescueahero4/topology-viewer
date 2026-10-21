import type { ComponentChildren } from "preact";

// why: P17 — the mockup `.rd` mark (styles.css lines 159-173); its colour comes from the checked
// state of the control around it
export function RadioMark() {
  return <span class="rd" aria-hidden="true" />;
}

type Props = {
  checked: boolean;
  label: ComponentChildren;
  onSelect: () => void;
};

// why: P17 — the one single-select control
export function Radio({ checked, label, onSelect }: Props) {
  return (
    <span
      role="radio"
      tabIndex={0}
      class="check"
      aria-checked={checked}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        onSelect();
      }}
    >
      <RadioMark />
      {label}
    </span>
  );
}
