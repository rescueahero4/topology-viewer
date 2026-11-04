// The reference of the stable parts. `Parts.astro` compares this list with `types/parts.d.ts`, and the
// build fails when they differ.

export type Control = "style" | "hidden" | "on" | "before/after" | "render" | "items" | "options";

export type PartDoc = {
  name: string;
  does: string;
  /** Where custom content goes, when the part keeps its own element. */
  inside?: boolean;
  controls: readonly Control[];
  options?: Readonly<Record<string, string>>;
  context?: Readonly<Record<string, string>>;
  actions?: readonly string[];
  items?: readonly string[];
  see?: string;
};

const WRAPPED: readonly Control[] = ["style", "hidden", "on", "before/after", "render"];
const STYLE: readonly Control[] = ["style", "hidden", "on"];

export const PART_GROUPS: readonly { title: string; parts: readonly PartDoc[] }[] = [
  {
    title: "Frame and canvas",
    parts: [
      { name: "viewer-frame", does: "The outer frame of the viewer.", controls: STYLE },
      {
        name: "canvas",
        does: "The area of the graph. Custom content goes over the graph, so position it yourself.",
        inside: true,
        controls: ["style", "on", "before/after", "render"],
        actions: ["select (a press on the empty canvas)"],
        see: "/components/canvas/",
      },
      {
        name: "node",
        does: "A node on the canvas. `style` and `className` get the data of the node. `render` draws your own component in place of the default.",
        controls: ["style", "on", "render", "options"],
        options: {
          sizes: "`{ [type]: { width, height } }`. The layout makes room by this size.",
          labels: "`boolean`. Keep the labels under a custom node. Default: false.",
          label: "`(node) => string`. The text of the label.",
          sublabel: "`(node) => string`. The line under the label.",
        },
        context: {
          node: "`{ id, kind, label, type, typeLabel, attrs, count, more, faded, width, height }`",
          selected: "`boolean`",
          commands: "All the [commands](/topology-viewer/reference/commands/)",
        },
        actions: ["select", "activate (a double press)", "press"],
        see: "/components/canvas/",
      },
      {
        name: "edge",
        does: "An edge on the canvas. `style` and `className` get the data of the edge.",
        controls: ["style", "on"],
        context: {
          edge: "`{ key, subject, object, label, muted, retired, dashed, count, selected }`",
        },
        actions: ["select"],
        see: "/components/canvas/",
      },
      {
        name: "tooltip",
        does: "The tooltip of a node or an edge on the canvas. `hidden` removes it.",
        controls: ["hidden", "render"],
        context: {
          kind: '`"node"` or `"edge"`',
          node: "The node, when `kind` is node",
          edge: "The edge, when `kind` is edge",
          subject: "The node at the start of the edge",
          object: "The node at the end of the edge",
        },
        see: "/components/canvas/",
      },
    ],
  },
  {
    title: "Filters",
    parts: [
      { name: "filter-bar", does: "The bar of family tabs and predicate pills.", controls: WRAPPED },
      {
        name: "filter-families",
        does: "The row of family tabs.",
        controls: [...WRAPPED, "options"],
        options: {
          off: "`string[]`. Families that start off.",
          hidden: "`string[]`. Families with no tab.",
          basicMax: "`number`. With more families than this, the row is a picker. Default: 10.",
        },
        see: "/components/filters/",
      },
      {
        name: "family-tab",
        does: "One family tab.",
        controls: WRAPPED,
        context: { family: "`string`", count: "`number`", on: "`boolean`" },
        actions: ["toggleFamily"],
      },
      { name: "family-picker", does: "The picker that replaces the tabs when there are many families.", controls: WRAPPED },
      {
        name: "filters",
        does: "The row of predicate pills, and your custom filters.",
        controls: [...WRAPPED, "options"],
        options: {
          off: "`string[]`. Predicates that start off.",
          hidden: "`string[]`. Predicates with no pill.",
          basicMax: "`number`. With more predicates than this, the row is a picker. Default: 10.",
          custom: "`{ id, label, test(node), active? }[]`. Your own filters.",
        },
        see: "/components/filters/",
      },
      {
        name: "predicate-pill",
        does: "One predicate pill.",
        controls: WRAPPED,
        context: { predicate: "`string`", family: "`string`", count: "`number`", on: "`boolean`" },
        actions: ["togglePredicate"],
      },
      { name: "predicate-picker", does: "The picker that replaces the pills when there are many predicates.", controls: WRAPPED },
    ],
  },
  {
    title: "Search and full screen",
    parts: [
      { name: "search-tools", does: "The card that holds the search and the full-screen button.", controls: STYLE },
      {
        name: "search",
        does: "The search box.",
        controls: [...WRAPPED, "options"],
        options: {
          placeholder: "`string`",
          debounce: "`number`. Milliseconds after the last key. Default: 120.",
          limit: "`number`. Results to show. Default: 50.",
          minLength: "`number`. Characters before it searches. Default: 1.",
          match: "`(node, query) => boolean`. Replaces the default matching.",
          source: "`(query, signal) => Promise<string[]>`. Ids from your own search API.",
        },
        actions: ["pick"],
        see: "/components/search/",
      },
      { name: "search-results", does: "The list of results.", controls: WRAPPED },
      {
        name: "search-result",
        does: "One result. Your content goes inside its row, so keyboard moves and selection keep working.",
        inside: true,
        controls: ["style", "on", "before/after", "render"],
        context: { id: "`string`", node: "The node, or null for an id outside the graph", query: "`string`", active: "`boolean`" },
        actions: ["pick"],
      },
      {
        name: "fullscreen-button",
        does: "The button next to the search.",
        controls: WRAPPED,
        context: { displayMode: '`"inline"` or `"fullscreen"`', toggle: "`() => void`" },
        actions: ["displayMode"],
        see: "/components/fullscreen/",
      },
    ],
  },
  {
    title: "Display options",
    parts: [
      {
        name: "display-options",
        does: "The bar at the bottom left.",
        controls: [...WRAPPED, "items"],
        items: ["scope-menu", "types-menu", "layout-menu", "grouping-menu", "dataset-button"],
        see: "/components/display-options/",
      },
      {
        name: "scope-menu",
        does: "How many nodes the canvas draws.",
        controls: [...WRAPPED, "options"],
        options: {
          budgets: '`(number | "all")[]`. The choices.',
          default: '`number | "all"`. The first choice. A view in the payload wins.',
        },
        actions: ["setBudget", "resetView"],
      },
      {
        name: "types-menu",
        does: "Which node types show.",
        controls: [...WRAPPED, "options"],
        options: { off: "`string[]`. Types that start off." },
        actions: ["toggleType", "showAllTypes"],
      },
      {
        name: "layout-menu",
        does: "The layout of the canvas.",
        controls: [...WRAPPED, "options"],
        options: {
          layouts: "`string[]`. The built-in layouts to keep: `force`, `atomic`, `bubbles`, `tree-h`, `tree-v`.",
          default: "`string`. The first layout, or `custom:<name>`. A view in the payload wins.",
        },
        actions: ["setLayout"],
      },
      {
        name: "grouping-menu",
        does: "How many nodes of a type make a group.",
        controls: [...WRAPPED, "options"],
        options: {
          values: '`(number | "off")[]`. The choices.',
          default: '`number | "off"`. The first choice.',
        },
        actions: ["setGrouping"],
      },
      { name: "dataset-button", does: "The button that opens the table.", controls: WRAPPED },
    ],
  },
  {
    title: "Inspector",
    parts: [
      {
        name: "inspector",
        does: "The card of the selected node.",
        controls: WRAPPED,
        context: { node: "The selected node, or null" },
        see: "/components/inspector/",
      },
      {
        name: "inspector-empty",
        does: "The card with nothing selected. Your content goes inside it.",
        inside: true,
        controls: ["before/after", "render"],
      },
      {
        name: "inspector-header",
        does: "The title, the counts and the buttons.",
        controls: WRAPPED,
        context: { node: "The selected node, or null" },
      },
      {
        name: "inspector-actions",
        does: "The buttons in the header.",
        controls: WRAPPED,
        context: { node: "The selected node, or null" },
        actions: ["focus", "hide", "expand", "collapse"],
      },
      {
        name: "inspector-body",
        does: "The sections under the header.",
        controls: ["style", "hidden", "on", "items"],
        items: ["inspector-attributes", "inspector-notes", "inspector-triples"],
        context: { node: "The selected node, or null. For a function in `items`." },
      },
      {
        name: "inspector-attributes",
        does: "The fields of the node.",
        controls: [...WRAPPED, "options"],
        options: {
          fields: "`{ key?, label?, value?(node), format?(value, node), hidden? }[]`",
          only: "`boolean`. Keep just the listed fields, in their order.",
          cap: "`number`. Rows before “Show more”. Default: 6.",
        },
        context: { node: "The selected node, or null" },
        see: "/components/inspector/",
      },
      {
        name: "attribute-row",
        does: "One field.",
        controls: WRAPPED,
        context: { key: "`string`", label: "`string`", value: "`unknown`", node: "The selected node" },
      },
      {
        name: "inspector-notes",
        does: "The notes of a node, such as how many neighbours are not drawn.",
        controls: WRAPPED,
        context: { node: "The selected node, or null" },
      },
      {
        name: "inspector-triples",
        does: "The list of relationships.",
        controls: [...WRAPPED, "options"],
        options: {
          tabs: "`boolean`. The All, Outgoing and Incoming tabs. Default: true.",
          filter: "`(triple) => boolean`. Which relationships show.",
        },
        context: { node: "The selected node, or null" },
      },
      {
        name: "triple-row",
        does: "One relationship.",
        controls: WRAPPED,
        context: { triple: "`{ key, subject, predicate, object, retired, muted, direction }`" },
        actions: ["select", "focus"],
      },
    ],
  },
  {
    title: "Table",
    parts: [
      { name: "workbench", does: "The whole table panel under the canvas.", controls: WRAPPED, see: "/components/table/" },
      {
        name: "workbench-toolbar",
        does: "The bar above the table.",
        controls: [...WRAPPED, "items"],
        items: ["table-filters", "spacer", "table-count", "table-search", "table-expand", "table-close"],
        context: { count: "`string`. For a function in `items`.", filters: "The table filters. For a function in `items`." },
      },
      {
        name: "table-filters",
        does: "The filters of the table.",
        controls: [...WRAPPED, "options"],
        options: { show: "`{ scope?, rowType?, kinds?, families?: boolean }`. Set one to false to remove it." },
        context: { filters: "The current filters", setFilters: "`(change) => void`" },
      },
      { name: "column-menu", does: "The menu that shows and hides columns.", controls: WRAPPED },
      {
        name: "bulk-bar",
        does: "The bar that shows when rows are ticked. Your content goes inside it.",
        inside: true,
        controls: ["style", "before/after", "render"],
        context: { rows: "The ticked rows", total: "`number`" },
        actions: ["reveal", "hide"],
      },
      {
        name: "table",
        does: "The table. Its options set the columns and the edit rules.",
        controls: ["style", "on", "options"],
        options: {
          columns: "`{ core?, attr?, label?, hidden?, editable?, editor?, value?(row), format?(value, row) }[]`",
          columnsOnly: "`boolean`. Show just the listed columns, in their order.",
          readOnly: "`boolean`. No cell takes an edit.",
          validate: "`({ row, column, value }) => string | undefined`. A text is the error to show.",
        },
        actions: ["edit (a saved cell)"],
        see: "/components/table/",
      },
      { name: "table-head", does: "The row of column names.", controls: STYLE },
      {
        name: "table-row",
        does: "One row.",
        controls: STYLE,
        actions: ["rowPress"],
      },
      {
        name: "table-cell",
        does: "One cell. Your content goes inside it, so keyboard moves and editing keep working.",
        inside: true,
        controls: ["style", "on", "before/after", "render"],
        context: { row: "The row", column: "A core name, or `{ attr }`", value: "`unknown`", text: "`string`. The default text." },
      },
      {
        name: "cell-editor",
        does: "The editor of a cell. `match` picks which cells take yours.",
        controls: ["style", "render"],
        context: {
          row: "The row",
          column: "A core name, or `{ attr }`",
          value: "`unknown`",
          name: "`string`",
          commit: "`(value) => void`. Checks and saves the value.",
          cancel: "`() => void`",
        },
        see: "/components/table/",
      },
      {
        name: "change-bar",
        does: "The bar with Undo, Redo, Cancel and Save. Your `render` shows all the time, so that it can show a clean state too.",
        controls: WRAPPED,
        context: {
          dirty: "`boolean`",
          saving: "`boolean`",
          error: "`string | null`",
          canUndo: "`boolean`",
          canRedo: "`boolean`",
          save: "`() => void`",
          cancel: "`() => void`",
          undo: "`() => void`",
          redo: "`() => void`",
        },
        actions: ["save"],
        see: "/components/saving/",
      },
      { name: "split-handle", does: "The handle between the canvas and the table.", controls: WRAPPED },
    ],
  },
  {
    title: "Panels and notices",
    parts: [
      { name: "hidden-panel", does: "The card that lists hidden nodes.", controls: WRAPPED, actions: ["restore"] },
      { name: "hidden-row", does: "One hidden node.", controls: WRAPPED, context: { row: "The hidden item" } },
      {
        name: "load-status",
        does: "What shows while the data loads, with no data, or after a failed load.",
        controls: WRAPPED,
        context: {
          state: '`"loading"`, `"empty"` or `"failed"`',
          kind: '`"network"`, `"http"`, `"parse"` or `"load"`, when it failed',
          status: "`number`. The HTTP status, when there is one.",
          retry: "`() => void`, when it failed",
        },
      },
      { name: "canvas-notice", does: "A notice over the canvas, such as a bad payload.", controls: WRAPPED },
      { name: "data-notice", does: "The chip that lists the warnings about the data.", controls: WRAPPED },
      { name: "focus-pill", does: "The pill that shows while the chart focuses on one node.", controls: WRAPPED },
      { name: "undo-toast", does: "The toast that can undo a big change of the view.", controls: WRAPPED },
    ],
  },
];
