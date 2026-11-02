/**
 * The public types of topology-viewer. This file is the only type contract of the package.
 * The library does not know your API. It takes one payload and renders it.
 */

/** A node in a payload. All fields are optional: the viewer skips and counts a node with no id. */
export type TopologyNode = {
  id?: string;
  type?: string;
  label?: string;
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
};

/** An edge in a payload. The viewer reads `source`/`target` or `subject`/`object`. */
export type TopologyEdge = {
  source?: string;
  target?: string;
  subject?: string;
  object?: string;
  predicate?: string;
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * The payload shape that the viewer reads best. The viewer also accepts tuples, `links`,
 * `neighborhood`, and rows or trees with a `shape` hint. A bad value shows a notice, not a crash.
 */
export type TopologyPayload = {
  nodes?: readonly (TopologyNode | readonly unknown[])[];
  edges?: readonly (TopologyEdge | readonly unknown[])[];
  links?: readonly (TopologyEdge | readonly unknown[])[];
  /** The look of each node type: `label`, `rank`, `shape`, `color`, `abbr`, `glyph`, `level`, `role`. If `rank` and `shape` disagree, `rank` decides. */
  types?: Record<string, Record<string, unknown>>;
  /** The look of each predicate: `label`, `category`, `inverse`, `role`. */
  predicates?: Record<string, Record<string, unknown>>;
  /** The first view: `root`, `layout`, `budget`, `approach`, `reveal`. */
  view?: {
    root?: string;
    layout?: "force" | "atomic" | "bubbles" | "tree-h" | "tree-v";
    budget?: 10 | 20 | 50 | "all";
    approach?: "active" | "passive";
    reveal?: readonly string[];
  };
  [key: string]: unknown;
};

/** The reason that a load failed. The viewer shows it with a "Try again" button. */
export type TopologyLoadErrorKind = "network" | "http" | "parse" | "select" | "load";

export declare class TopologyLoadError extends Error {
  readonly kind: TopologyLoadErrorKind;
  /** The HTTP status, only for the kind `http`. */
  readonly status?: number;
}

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

/** One changed cell of the Dataset table. */
export type TopologyCellChange = {
  row: { record: string } | { triple: string };
  column: string | { attr: string } | { fact: string };
  before: unknown;
  after: unknown;
};

export type TopologyEdits = {
  /** All changes that are now on the canvas, in order. */
  changes: readonly TopologyCellChange[];
  /** True while the user has changes that "Save changes" did not save. */
  unsaved: boolean;
};

/** A vocabulary preset, for example `qdicProfile` from `topology-viewer/profiles/qdic`. */
export type TopologyProfile = Record<string, unknown>;

export type TopologyOptions = {
  /** A payload that you already have. It takes priority over `url` and `load`. */
  data?: unknown;
  /** An endpoint that gives the payload as JSON with `GET`, or as `requestInit` sets. */
  url?: string;
  /** Headers, method, body or credentials for `url`. A change does not cause a new load. */
  requestInit?: RequestInit;
  /** Your own client (axios, GraphQL). Used when there is no `data` and no `url`. */
  load?: (signal: AbortSignal) => Promise<unknown>;
  /** Gets the payload out of the API answer, for example `(r) => r.data.graph`. */
  select?: (response: unknown) => unknown;
  /** Change this value to load again from the same source. */
  reloadKey?: unknown;

  /** A vocabulary preset. Read one time, when the viewer mounts. Default: no node types. */
  profile?: TopologyProfile;
  /** `"widget"` is the compact look with a full-screen button. Read one time, when the viewer mounts. */
  variant?: "widget" | "page";
  /** Default: the browser language. */
  lang?: "en" | "ja";
  /** Replaces interface text by key, in the active language. */
  strings?: Record<string, string>;

  onLoadStart?: () => void;
  onLoad?: (payload: unknown) => void;
  onError?: (error: TopologyLoadError) => void;
  onSelect?: (selection: TopologySelection) => void;
  /** Each edit, undo, redo and cancel. */
  onEditsChange?: (edits: TopologyEdits) => void;
  /** The "Save changes" press. Send the changes to your API here. */
  onEditsSave?: (edits: TopologyEdits) => void;
  /** Default: opens a new tab with `noopener`. */
  onOpenLink?: (url: string) => void;
  /** Default: copies to the clipboard. Return `false` to show the "could not copy" text. */
  onCopyDetails?: (text: string) => void | boolean | Promise<void | boolean>;
};

export type TopologyViewerHandle = {
  /** Replaces the options. Loads again only when `data`, `url` or `reloadKey` changes. */
  update(options: TopologyOptions): void;
  /** Loads again from the current source. */
  reload(): void;
  destroy(): void;
};

/** Mounts a viewer into `element`, in a Shadow DOM root. The element must have a height. */
export declare function mountTopology(
  element: HTMLElement,
  options: TopologyOptions,
): TopologyViewerHandle;
