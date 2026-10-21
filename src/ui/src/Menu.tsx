import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useId, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { CheckMark } from "./Checkbox";
import { RadioMark } from "./Radio";

// why: mockup `closeMenus` (app.js lines 444-466) — one menu is open at a time
const openMenu = signal<object | null>(null);

type MenuProps = {
  label: ComponentChildren;
  buttonClass: string;
  children: ComponentChildren;
};

// why: P18, NF-5 — the first item takes focus on open; Escape closes the menu and gives the focus
// back to its button; a press outside closes it
export function Menu({ label, buttonClass, children }: MenuProps) {
  const me = useMemo(() => ({}), []);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const open = openMenu.value === me;
  const close = () => {
    if (openMenu.value === me) openMenu.value = null;
  };
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    const doc = list.current?.ownerDocument;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (button.current?.contains(target) || list.current?.contains(target))
        return;
      close();
    };
    doc?.addEventListener("click", outside);
    return () => doc?.removeEventListener("click", outside);
  }, [open]);
  return (
    <div class="menu-anchor">
      <button
        ref={button}
        id={id}
        type="button"
        class={buttonClass}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (openMenu.value = open ? null : me)}
      >
        {label}
      </button>
      <div
        ref={list}
        class="menu"
        role="menu"
        aria-labelledby={id}
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          close();
          button.current?.focus();
        }}
      >
        {children}
      </div>
    </div>
  );
}

type ItemProps = {
  kind: "radio" | "check" | "action";
  checked?: boolean;
  partial?: boolean;
  onSelect: () => void;
  children: ComponentChildren;
};

const ROLES = {
  radio: "menuitemradio",
  check: "menuitemcheckbox",
  action: "menuitem",
} as const;

// why: P18 — one line per option; a description goes into an info-icon tooltip, not the line
export function MenuItem(props: ItemProps) {
  const { kind, checked = false, partial = false, onSelect, children } = props;
  return (
    <button
      type="button"
      role={ROLES[kind]}
      class="menu-item"
      aria-checked={kind === "action" ? undefined : partial ? "mixed" : checked}
      onClick={onSelect}
    >
      {kind === "radio" && <RadioMark />}
      {kind === "check" && <CheckMark checked={checked} partial={partial} />}
      {children}
    </button>
  );
}
