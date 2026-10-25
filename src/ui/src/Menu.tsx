import { signal } from "@preact/signals";
import type { ComponentChildren, JSX, RefObject } from "preact";
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { useElementId } from "./ids";
import { CheckMark } from "./Checkbox";
import { RadioMark } from "./Radio";

// why: mockup `closeMenus` (app.js lines 444-466) — one menu is open at a time
const openMenu = signal<object | null>(null);

// why: STORY-004-09 rule 5 (NF-5, f-0019) — the Escape key of the App closes an open menu first
export function closeMenu(): boolean {
  if (openMenu.value === null) return false;
  openMenu.value = null;
  return true;
}

type MenuProps = {
  label: ComponentChildren;
  name?: string;
  buttonClass: string;
  menuClass?: string;
  closeOnPick?: boolean;
  anchor?: JSX.HTMLAttributes<HTMLButtonElement>;
  children: ComponentChildren;
};

// why: mockup `[data-menu]` handler (app.js line 495) — the first control of the menu takes the
// focus: a search box, an item, or a checkbox row
const FIRST = 'input, [role^="menuitem"], [role="checkbox"]';
// why: mockup scope, layout and grouping handlers (app.js lines 438-441, 470-489) — a pick of a
// radio or an action closes its menu; a check item keeps it open
const PICK = '[role="menuitemradio"], [role="menuitem"]';

// why: P18, NF-5 — the first item takes focus on open; a press outside closes the menu
function useOpenMenu(
  open: boolean,
  button: RefObject<HTMLButtonElement>,
  list: RefObject<HTMLDivElement>,
  close: () => void,
) {
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(FIRST)?.focus();
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
}

// why: P18, NF-5 — Escape closes the menu and gives the focus back to its button
export function Menu(props: MenuProps) {
  const { label, name, buttonClass, menuClass, closeOnPick, children } = props;
  const me = useMemo(() => ({}), []);
  const id = useElementId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const open = openMenu.value === me;
  const close = () => {
    if (openMenu.value === me) openMenu.value = null;
  };
  useOpenMenu(open, button, list, close);
  return (
    <div class="menu-anchor">
      <button
        {...props.anchor}
        ref={button}
        id={id}
        type="button"
        class={buttonClass}
        aria-label={name}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(event) => {
          // why: STORY-007-03 rule 5 — a press of the button also hides the shown tip of its anchor
          props.anchor?.onClick?.(event);
          openMenu.value = open ? null : me;
        }}
      >
        {label}
      </button>
      <div
        ref={list}
        class={menuClass === undefined ? "menu" : `menu ${menuClass}`}
        role="menu"
        aria-labelledby={id}
        hidden={!open}
        onClick={(event) => {
          if (!closeOnPick || !(event.target as Element).closest(PICK)) return;
          close();
          button.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          close();
          button.current?.focus();
        }}
      >
        {children}
      </div>
    </div>
  );
}

type ItemProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "class" | "onSelect" | "role"
> & {
  kind: "radio" | "check" | "action";
  checked?: boolean;
  partial?: boolean;
  class?: string;
  onSelect: () => void;
  children: ComponentChildren;
};

const ROLES = {
  radio: "menuitemradio",
  check: "menuitemcheckbox",
  action: "menuitem",
} as const;

// why: P18 — one line per option; a description goes into an info-icon tooltip, not the line
export function MenuItem({
  kind,
  checked = false,
  partial = false,
  class: extra,
  onSelect,
  children,
  ...attributes
}: ItemProps) {
  return (
    <button
      {...attributes}
      type="button"
      role={ROLES[kind]}
      class={extra === undefined ? "menu-item" : `menu-item ${extra}`}
      aria-checked={kind === "action" ? undefined : partial ? "mixed" : checked}
      onClick={onSelect}
    >
      {kind === "radio" && <RadioMark />}
      {kind === "check" && <CheckMark checked={checked} partial={partial} />}
      {children}
    </button>
  );
}
