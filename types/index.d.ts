import type { TopologyPartName } from "./parts";

export type { TopologyPartName };

export type TopologyPayload = {
  nodes?: readonly unknown[];
  edges?: readonly unknown[];
  links?: readonly unknown[];
  types?: Record<string, Record<string, unknown>>;
  predicates?: Record<string, Record<string, unknown>>;
  view?: {
    root?: string;
    layout?: "force" | "atomic" | "bubbles" | "tree-h" | "tree-v";
    budget?: 10 | 20 | 50 | "all";
    approach?: "active" | "passive";
    reveal?: readonly string[];
  };
  [key: string]: unknown;
};

export declare class TopologyLoadError extends Error {
  readonly kind: "network" | "http" | "parse" | "load";
  readonly status?: number;
}

export type TopologyNode = {
  kind: "node";
  id: string;
  label: string;
  type?: string;
  attrs: Readonly<Record<string, unknown>>;
};

export type TopologySelection =
  | {
      kind: "node";
      id: string;
      label: string;
      type?: string;
      attrs: Record<string, unknown>;
    }
  | { kind: "group"; id: string }
  | { kind: "edge"; subject: string; predicate: string; object: string }
  | null;

export type TopologyCellChange = {
  row: { record: string } | { triple: string };
  column: string | { attr: string } | { fact: string };
  before: unknown;
  after: unknown;
};

// ---- Profile

export type TopologyProfile = {
  vocabulary: Record<string, unknown>;
  sprite?: Record<string, unknown>;
};

export type TopologyProfileInput = {
  /** The profile to add to. Default: the neutral profile. */
  extends?: TopologyProfile;
  /** New filter families, before "Other". */
  families?: readonly string[];
  nodeTypes?: Readonly<
    Record<
      string,
      {
        label?: string;
        category?: string;
        /** SVG text. Read with an allow-list; a script or an event attribute is an error. */
        icon?: string;
        /** `#rrggbb` */
        color?: string;
        /** With no icon: the size rank, 0 to 6, and the two capital letters of the drawn mark. */
        rank?: number;
        abbr?: string;
        level?: number;
        tier?: "source" | "group" | "container" | "asset" | "leaf";
      }
    >
  >;
  predicates?: Readonly<
    Record<
      string,
      {
        family?: string;
        inverse?: string;
        direction?: "out" | "in" | "both";
        layoutRole?: "lineage" | "structure";
      }
    >
  >;
};

/** A vocabulary and icons from a short description. Safe to call on a server. */
export declare function defineProfile(input: TopologyProfileInput): TopologyProfile;
export declare const neutralProfile: TopologyProfile;

// ---- Theme

/**
 * Public tokens. A key names `--tv-<kebab-case-key>`, and a key that starts with `--` is used as it
 * stands. See CUSTOMIZING.md for the list. `canvas` should be a colour that the browser can read, for
 * the contrast check of the node colours.
 */
export type TopologyTheme = {
  canvas?: string;
  surface?: string;
  text?: string;
  textMuted?: string;
  border?: string;
  accent?: string;
  focus?: string;
  danger?: string;
  font?: string;
  radius?: string;
  frameRadius?: string;
  frameBorder?: string;
  fullscreenZ?: string | number;
  /** The CSS `color-scheme` of this theme. Default: `dark` for a theme named dark, else `light`. */
  colorScheme?: string;
  [token: string]: string | number | undefined;
};

export type TopologyFamilyLook = {
  main: string;
  tint?: string;
  border?: string;
  /** The name of a built-in interface icon. */
  icon?: string;
};

// ---- Parts

export type TopologyPartState = {
  selected: boolean;
  pressed: boolean;
  expanded: boolean;
  checked: boolean;
  disabled: boolean;
  state: string | null;
};

export type TopologyEvent = {
  /** The action: `select`, `focus`, `hide`, `setLayout`, `press`, `pick`, `save`, ... */
  type: string;
  /** The part whose handler runs. */
  part: string | null;
  args: readonly unknown[];
  target: EventTarget | null;
  defaultPrevented: boolean;
  /** Stops the action. */
  preventDefault(): void;
  [key: string]: unknown;
};

/**
 * The content of a place in a part. With React: a function that gets the context and gives a node, or
 * a node. With `mountTopology`: a function `(context, element) => cleanup`, or a DOM node, or a text.
 */
export type TopologyContent =
  | ((context: any, element: HTMLElement) => unknown)
  | unknown;

export type TopologyPart = {
  /** A class of the page or of `styles`. With `pageStyles` a Tailwind class works here. */
  className?: string | ((state: any) => string | undefined);
  /** An inline style. Applied by the DOM style API, so it needs no `unsafe-inline`. */
  style?:
    | Readonly<Record<string, string | number | undefined>>
    | ((state: any) => Readonly<Record<string, string | number | undefined>> | undefined);
  hidden?: boolean;
  /** The settings of this part. See CUSTOMIZING.md. */
  options?: Readonly<Record<string, unknown>>;
  /** See or stop an action that starts in this part. */
  on?: Readonly<Record<string, ((event: TopologyEvent) => void) | undefined>>;
  /** Your content before the default. */
  before?: TopologyContent;
  /** Your content after the default. */
  after?: TopologyContent;
  /** Your content instead of the default. */
  render?: TopologyContent;
  /** Which items of this part take `render`, such as the nodes of one type. */
  match?: (context: any) => boolean;
  /** The children of a container part: reorder them, leave some out, or add `{ id, render }`. */
  items?: readonly (string | { id: string; render: TopologyContent })[];
};

export type TopologyKeyboard =
  | false
  | Partial<
      Record<
        "search" | "toggleTable" | "tableSmaller" | "tableLarger" | "undo" | "redo" | "escape",
        /** Such as `/`, `mod+k`, `mod+shift+z`. `mod` is Ctrl or Cmd. */
        string | false
      >
    >;

export type TopologyFullscreen =
  /** Fills the browser view. The default. */
  | "viewport"
  /** The Fullscreen API of the browser. */
  | "native"
  /** No full-screen button; "Expand table" stays in the frame. */
  | false
  /** Your behaviour. A rejected promise keeps the current mode. */
  | {
      enter(context: { element: HTMLElement }): void | Promise<void>;
      exit(context: { element: HTMLElement }): void | Promise<void>;
    };

export type TopologyLayout = {
  label: string;
  description?: string;
  /** A pure function: the same graph gives the same places. */
  run(graph: {
    nodes: readonly {
      id: string;
      type: string | null;
      label: string;
      width: number;
      height: number;
    }[];
    edges: readonly { source: string; target: string; predicate: string }[];
  }): Readonly<Record<string, { x: number; y: number }>>;
};

export type TopologySaveAnswer = void | { error?: string };

export type TopologyState = {
  selection: { node: string } | { edge: string } | null;
  layout: string | null;
  budget: number | "all" | null;
  grouping: number | "off" | null;
  filters: unknown;
  customFilters: readonly string[];
  displayMode: "inline" | "fullscreen";
  inspectorOpen: boolean;
  search: string;
  table: {
    open: boolean;
    layout: string;
    filters: unknown;
    sort: unknown;
    search: string;
  };
  edits: { dirty: boolean; saving: boolean; error: string | null };
};

export type TopologyCommands = {
  /** Selects a node by its id, or clears the selection with `null`. */
  select(id: string | null): void;
  /** Selects a node and centres the chart around it. */
  focus(id: string): void;
  /** Draws the neighbours of a node, or opens a group. */
  expand(id: string): void;
  /** Takes back what `expand` drew. */
  collapse(id: string): void;
  /** Moves nodes to the Hidden panel. */
  hide(ids: readonly string[]): void;
  /** Brings hidden nodes back. */
  restore(ids: readonly string[]): void;
  /** Draws these nodes, with what they need to connect. */
  reveal(ids: readonly string[]): void;
  /** Goes back to the first view of the data. */
  resetView(): void;
  /** Clears the selection and fits the chart in the view. */
  fit(): void;
  /** A built-in name, or `custom:<name>` for a layout of `layouts`. */
  setLayout(name: string): void;
  /** Sets how many nodes the canvas draws. */
  setBudget(budget: number | "all"): void;
  /** Sets how many nodes of a type make a group. */
  setGrouping(grouping: number | "off"): void;
  /** Turns on every node type. */
  showAllTypes(): void;
  /** Turns one node type on or off. `null` is the nodes with no type. */
  setTypeVisible(type: string | null, on: boolean): void;
  /** Turns one filter family on or off. */
  setFamilyVisible(family: string, on: boolean): void;
  /** Turns one predicate on or off. */
  setPredicateVisible(predicate: string, on: boolean): void;
  /** Turns one of your custom filters on or off. */
  setCustomFilter(id: string, on: boolean): void;
  /** Enters or leaves full screen, by the `fullscreen` strategy. */
  setDisplayMode(mode: "inline" | "fullscreen"): void;
  /** Opens the table under the canvas. */
  openTable(): void;
  /** Closes the table. */
  closeTable(): void;
  /** Opens or closes the table. */
  toggleTable(): void;
  /** Changes the filters of the table: `scope`, `rowType`, `kinds`, `families`. */
  setTableFilters(change: Readonly<Record<string, unknown>>): void;
  /** Sorts the table by `{ column, dir }`, where `dir` is 1 or -1, or clears it with `null`. */
  setTableSort(sort: unknown): void;
  /** Shows or hides a column: `{ core: "name" }` or `{ attr: "owner" }`. */
  setTableColumn(column: unknown, on: boolean): void;
  /** Sets the text of the table search. */
  setTableSearch(text: string): void;
  /** Sets the text of the canvas search, and runs it. */
  setSearch(text: string): void;
  /** Opens or collapses the inspector card. */
  setInspectorOpen(open: boolean): void;
  /** Does what "Save changes" does, so it calls `onSave`. */
  saveEdits(): void | Promise<void>;
  /** Takes back every unsaved edit. */
  cancelEdits(): void;
  /** Undoes the last edit. */
  undo(): void;
  /** Redoes the last undone edit. */
  redo(): void;
  /** Reads the current state. It follows the settled chart, so a change shows here when its move ends. */
  getState(): TopologyState;
};

export type TopologyOptions = {
  /** Takes priority over `url` and `load`. */
  data?: TopologyPayload | unknown;
  /** GET, JSON answer. Use `load` for headers, auth or an envelope. */
  url?: string;
  /** Your own loading. Use it for headers, auth, or an API that wraps its answer. Return the graph. */
  load?: (signal: AbortSignal) => Promise<unknown>;
  /** Read at mount. To change it, give the viewer a new `key`. */
  profile?: TopologyProfile;
  /** Read at mount. Default: `"page"`. `"widget"` is the compact look for a chat host. */
  variant?: "widget" | "page";
  /** The language of the interface. Default: the language of the browser, when it is one of these. */
  lang?: "en" | "ja";
  /** Replaces interface text by key. */
  strings?: Record<string, string>;

  // Style
  /** Tokens for every colour mode. */
  theme?: TopologyTheme;
  /** Tokens for each colour mode, over `theme`. The library ships light; you add dark. */
  themes?: Readonly<Record<string, TopologyTheme>>;
  /** A name in `themes`, or `"system"` for `light` or `dark` by the system. Default: `"light"`. */
  colorMode?: string;
  /** Your CSS inside the viewer. Internal class names are not a stable API; prefer `parts`. */
  styles?: string | CSSStyleSheet | readonly (string | CSSStyleSheet)[];
  /** The stylesheets of the page also apply inside the viewer, so a Tailwind class works on a part. */
  pageStyles?: boolean;
  /** Colours for a family of a custom profile. */
  familyLooks?: Readonly<Record<string, TopologyFamilyLook>>;

  // Behaviour
  /** Every sub-component, by its name. See CUSTOMIZING.md. */
  parts?: Partial<Record<TopologyPartName, TopologyPart>> & Readonly<Record<string, TopologyPart>>;
  /** Your own layouts. Each one is in the layout menu, and its name is `custom:<key>`. */
  layouts?: Readonly<Record<string, TopologyLayout>>;
  /** Change or switch off the keys. */
  keyboard?: TopologyKeyboard;
  /** What full screen does. Default: `"viewport"`. */
  fullscreen?: TopologyFullscreen;
  /** Controls the mode: the viewer changes it only by this prop. */
  displayMode?: "inline" | "fullscreen";
  /** Default: true. Only for `fullscreen: "viewport"`. */
  lockPageScroll?: boolean;
  /** Opens a link in the data. Default: a new tab. The link is already checked to be safe. */
  openLink?: (href: string) => void | Promise<void>;
  /** The "Copy for AI" action. Default: the clipboard. */
  copyForAi?: (text: string) => Promise<unknown>;

  // Events
  /** A load failed. The viewer also shows the failure, with a retry button. */
  onError?: (error: TopologyLoadError) => void;
  /** The selection changed. */
  onSelect?: (selection: TopologySelection) => void;
  /**
   * The changes since the last save, on "Save changes". The bar waits for a promise. A rejected
   * promise, a thrown error or `{ error: "text" }` keeps the edits and shows a failure.
   */
  onSave?: (
    changes: readonly TopologyCellChange[],
    info: { all: readonly TopologyCellChange[] },
  ) => TopologySaveAnswer | Promise<TopologySaveAnswer>;
  /** Every action of every control, before it runs. `preventDefault` stops it. */
  onAction?: (event: TopologyEvent) => void;
  /** The display mode changed. With `displayMode` set, this is a request, and your state decides. */
  onDisplayModeChange?: (mode: "inline" | "fullscreen") => void;
  /** A filter changed. */
  onFiltersChange?: (filters: unknown) => void;
  /** The table gained its first unsaved edit, or has none left. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Anything in `TopologyState` changed. */
  onStateChange?: (state: TopologyState) => void;
};

export type TopologyViewerOptions = TopologyOptions;

export type TopologyViewerHandle = {
  /** Loads again only when `data` or `url` changes. */
  update(options: TopologyOptions): void;
  reload(): void;
  destroy(): void;
  commands: TopologyCommands;
};

/** `element` must have a height. */
export declare function mountTopology(
  element: HTMLElement,
  options: TopologyOptions,
): TopologyViewerHandle;

/** Later options win; `parts`, `theme` and `themes` merge by key. */
export declare function mergeOptions<T extends TopologyOptions>(
  ...all: readonly (Partial<T> | undefined)[]
): T;
