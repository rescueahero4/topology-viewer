import { options, type VNode } from "preact";
import {
  custom,
  type PartConfig,
  type PartState,
  type PartStyle,
} from "./custom";
import { CLASS_PARTS, NOT_PARTS, TAG_PARTS } from "./partNames";

const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(map, key) ? map[key] : undefined;

const yes = (value: unknown) => value === true || value === "true";

function stateOf(props: Record<string, unknown>): PartState {
  const state = props["data-state"];
  return {
    selected: yes(props["aria-selected"]),
    pressed: yes(props["aria-pressed"]),
    expanded: yes(props["aria-expanded"]),
    checked: yes(props["aria-checked"]) || props.checked === true,
    disabled: props.disabled === true || yes(props["aria-disabled"]),
    state: typeof state === "string" ? state : null,
  };
}

function stateNames(state: PartState): string[] {
  const names: string[] = [];
  if (state.selected) names.push("selected");
  if (state.pressed) names.push("pressed");
  if (state.expanded) names.push("expanded");
  if (state.checked) names.push("checked");
  if (state.disabled) names.push("disabled");
  if (state.state !== null) names.push(`state-${state.state}`);
  return names;
}

function namesOf(type: string, props: Record<string, unknown>): string[] {
  const given = props.part;
  const names =
    typeof given === "string" && given !== "" ? given.split(/\s+/) : [];
  const classes = props.class;
  if (typeof classes === "string")
    for (const name of classes.split(/\s+/))
      if (name !== "") names.push(own(CLASS_PARTS, name) ?? name);
  if (names.length === 0) names.push(own(TAG_PARTS, type) ?? type);
  return names;
}

function styleOf(config: PartConfig, state: PartState): PartStyle | undefined {
  const { style } = config;
  return typeof style === "function" ? style(state) : style;
}

function classOf(config: PartConfig, state: PartState): string | undefined {
  const { className } = config;
  return typeof className === "function" ? className(state) : className;
}

// A style object goes through the DOM style API, so it needs no `unsafe-inline`.
function applyConfig(
  props: Record<string, unknown>,
  config: PartConfig,
  state: PartState,
): void {
  const extra = classOf(config, state);
  if (extra !== undefined && extra !== "") {
    const now = props.class;
    props.class = typeof now === "string" && now !== "" ? `${now} ${extra}` : extra;
  }
  const style = styleOf(config, state);
  if (style !== undefined) {
    const now = props.style;
    props.style = typeof now === "object" && now !== null ? { ...now, ...style } : style;
  }
  if (config.hidden === true)
    props.style = { ...(props.style as object | undefined), display: "none" };
}

function decorate(type: string, props: Record<string, unknown>): void {
  if (NOT_PARTS.has(type)) return;
  const names = namesOf(type, props);
  const state = stateOf(props);
  props.part = [...names, ...stateNames(state)].join(" ");
  const { parts } = custom.peek();
  for (const name of names) {
    const config = own(parts, name);
    if (config !== undefined) applyConfig(props, config, state);
  }
}

let installed = false;

export const partsOn = () => installed;

/**
 * Names every element of the shell, and adds the class and the style of the developer, in one place,
 * with no wrapper element. The public core installs this; the tests of the shell run without it.
 */
export function installPartHook(): void {
  if (installed) return;
  installed = true;
  const before = options.vnode;
  options.vnode = (vnode: VNode) => {
    if (typeof vnode.type === "string")
      decorate(vnode.type, vnode.props as Record<string, unknown>);
    before?.(vnode);
  };
}

/** The part names around an element, innermost first, from the path of an event. */
export function partsOnPath(path: readonly EventTarget[]): string[] {
  const names: string[] = [];
  for (const item of path) {
    if (!(item instanceof Element)) continue;
    const part = item.getAttribute("part");
    if (part === null) continue;
    for (const name of part.split(/\s+/)) if (name !== "") names.push(name);
  }
  return names;
}

/** For an element that the shell does not render through Preact. */
export function markPart(el: Element, name: string): void {
  el.setAttribute("part", name);
}
