import { signal } from "@preact/signals";

// The customization that a developer gives to one viewer. The core of each viewer has its own copy
// of this module, so two viewers share nothing. With no customization the shell behaves as if this
// module did not exist.

export type PartState = {
  selected: boolean;
  pressed: boolean;
  expanded: boolean;
  checked: boolean;
  disabled: boolean;
  state: string | null;
};

export type PartStyle = Readonly<Record<string, string | number | undefined>>;

export type PartEvent = {
  type: string;
  part: string | null;
  args: readonly unknown[];
  target: EventTarget | null;
  defaultPrevented: boolean;
  preventDefault(): void;
  [key: string]: unknown;
};

export type PartItem = string | { id: string; render: unknown };

export type PartConfig = {
  className?: string | ((state: PartState) => string | undefined);
  style?: PartStyle | ((state: PartState) => PartStyle | undefined);
  hidden?: boolean;
  options?: Readonly<Record<string, unknown>>;
  on?: Readonly<Record<string, ((event: PartEvent) => void) | undefined>>;
  before?: unknown;
  after?: unknown;
  render?: unknown;
  // Which items of this part take `render`; the others keep the default.
  match?: (ctx: Readonly<Record<string, unknown>>) => boolean;
  items?: readonly PartItem[];
};

export type KeyName =
  | "search"
  | "toggleTable"
  | "tableSmaller"
  | "tableLarger"
  | "undo"
  | "redo"
  | "escape";

export type KeyboardMap =
  false | Partial<Readonly<Record<KeyName, string | false>>>;

export type SaveAnswer = void | { error?: string } | undefined;

export type Custom = {
  parts: Readonly<Record<string, PartConfig>>;
  onAction?: ((event: PartEvent) => void) | undefined;
  onSave?:
    | ((
        changes: readonly unknown[],
        info: { all: readonly unknown[] },
      ) => SaveAnswer | Promise<SaveAnswer>)
    | undefined;
  keyboard?: KeyboardMap | undefined;
  layouts?: Readonly<Record<string, CustomLayout>> | undefined;
};

export type LayoutNode = {
  id: string;
  type: string | null;
  label: string;
  width: number;
  height: number;
};

export type CustomLayout = {
  label: string;
  description?: string;
  run: (graph: {
    nodes: readonly LayoutNode[];
    edges: readonly { source: string; target: string; predicate: string }[];
  }) => Readonly<Record<string, { x: number; y: number }>>;
};

const NOTHING: Custom = { parts: {} };

export const custom = signal<Custom>(NOTHING);

export function setCustom(next: Custom): void {
  custom.value = next;
}

/** Only own keys, so that a part name such as `constructor` finds nothing. */
export function partConfig(id: string): PartConfig | undefined {
  const { parts } = custom.value;
  return Object.hasOwn(parts, id) ? parts[id] : undefined;
}

export function peekConfig(id: string): PartConfig | undefined {
  const { parts } = custom.peek();
  return Object.hasOwn(parts, id) ? parts[id] : undefined;
}

export function optionOf<T>(id: string, key: string): T | undefined;
export function optionOf<T>(id: string, key: string, fallback: T): T;
export function optionOf<T>(id: string, key: string, fallback?: T) {
  const options = partConfig(id)?.options;
  if (options === undefined || !Object.hasOwn(options, key)) return fallback;
  const value = options[key] as T | undefined;
  return value === undefined ? fallback : value;
}

export function peekOption<T>(id: string, key: string): T | undefined {
  const options = peekConfig(id)?.options;
  if (options === undefined || !Object.hasOwn(options, key)) return undefined;
  return options[key] as T | undefined;
}

// The parts around the element of the running input event, innermost first. An action that the
// event starts takes its source from this path.
let eventPath: readonly string[] = [];
let eventTarget: EventTarget | null = null;

export function setEventPath(
  path: readonly string[],
  target: EventTarget | null,
): void {
  eventPath = path;
  eventTarget = target;
}

function makeEvent(
  type: string,
  args: readonly unknown[],
  extra: Readonly<Record<string, unknown>>,
): PartEvent {
  const event: PartEvent = {
    ...extra,
    type,
    part: null,
    args,
    target: eventTarget,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event;
}

/**
 * Runs the `on` handlers of the source parts, innermost first, then `onAction`. Returns false when
 * a handler called `preventDefault`.
 */
export function dispatch(
  type: string,
  args: readonly unknown[] = [],
  extra: Readonly<Record<string, unknown>> = {},
  source: readonly string[] = eventPath,
): boolean {
  const { onAction, parts } = custom.peek();
  if (onAction === undefined && Object.keys(parts).length === 0) return true;
  const event = makeEvent(type, args, extra);
  for (const id of source) {
    const handler = peekConfig(id)?.on?.[type];
    if (handler === undefined) continue;
    event.part = id;
    handler(event);
    if (event.defaultPrevented) return false;
  }
  event.part = source[0] ?? null;
  onAction?.(event);
  return !event.defaultPrevented;
}

// The running pieces of one viewer, for the commands. Each piece registers itself while it is
// mounted, and it keeps its own state.
export type LiveTable = {
  get(): {
    filters: Readonly<Record<string, unknown>>;
    sort: unknown;
    text: string;
  };
  setFilters(change: Readonly<Record<string, unknown>>): void;
  setSort(sort: unknown): void;
  setColumn(column: unknown, on: boolean): void;
  setText(text: string): void;
};

export type Live = {
  table: LiveTable | null;
  search: { get(): string; set(text: string): void } | null;
  inspector: { get(): boolean; set(open: boolean): void } | null;
  exitOnEscape: (() => boolean) | null;
};

export const live: Live = {
  table: null,
  search: null,
  inspector: null,
  exitOnEscape: null,
};

// Keyboard: the default key of each name, which a `keyboard` map can change or switch off.
const KEYS: Readonly<Record<KeyName, string>> = {
  search: "/",
  toggleTable: "mod+.",
  tableSmaller: "[",
  tableLarger: "]",
  undo: "mod+z",
  redo: "mod+shift+z",
  escape: "escape",
};

function comboOf(name: KeyName): string | false {
  const map = custom.peek().keyboard;
  if (map === false) return false;
  const given = map?.[name];
  return given === undefined ? KEYS[name] : given;
}

const MODIFIERS = new Set(["mod", "ctrl", "meta", "shift", "alt"]);

function matches(event: KeyboardEvent, combo: string): boolean {
  const tokens = combo.toLowerCase().split("+");
  const key = tokens.filter((one) => !MODIFIERS.has(one)).join("+") || "+";
  if (event.key.toLowerCase() !== key) return false;
  const mod = tokens.includes("mod");
  const wantCtrl = tokens.includes("ctrl");
  const wantMeta = tokens.includes("meta");
  const command = event.ctrlKey || event.metaKey;
  if (mod ? !command : event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta)
    return false;
  if (event.altKey !== tokens.includes("alt")) return false;
  // A character such as `/` or `[` can need Shift on some keyboards, so Shift counts only when the
  // combination has a command key or names it.
  return !(mod || tokens.includes("shift")) || event.shiftKey === tokens.includes("shift");
}

export function keyIs(name: KeyName, event: KeyboardEvent): boolean {
  const combo = comboOf(name);
  return combo !== false && matches(event, combo);
}
