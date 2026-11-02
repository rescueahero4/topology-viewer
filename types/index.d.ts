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

export type TopologyProfile = {
  vocabulary: Record<string, unknown>;
  sprite?: Record<string, unknown>;
};

export type TopologyOptions = {
  /** Takes priority over `url` and `load`. */
  data?: TopologyPayload | unknown;
  /** GET, JSON answer. Use `load` for headers, auth or an envelope. */
  url?: string;
  load?: (signal: AbortSignal) => Promise<unknown>;
  /** Read at mount. */
  profile?: TopologyProfile;
  /** Read at mount. Default: `"widget"`. */
  variant?: "widget" | "page";
  lang?: "en" | "ja";
  /** Replaces interface text by key. */
  strings?: Record<string, string>;
  onError?: (error: TopologyLoadError) => void;
  onSelect?: (selection: TopologySelection) => void;
  /** All changes so far, on "Save changes". */
  onSave?: (changes: readonly TopologyCellChange[]) => void;
};

export type TopologyViewerHandle = {
  /** Loads again only when `data` or `url` changes. */
  update(options: TopologyOptions): void;
  reload(): void;
  destroy(): void;
};

/** `element` must have a height. */
export declare function mountTopology(
  element: HTMLElement,
  options: TopologyOptions,
): TopologyViewerHandle;
