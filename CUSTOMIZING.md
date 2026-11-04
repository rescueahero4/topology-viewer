# Customizing topology-viewer

The [documentation site](https://rescueahero4.github.io/topology-viewer/) has all of this with live demos. This file is the short form, for reading offline.

There are three levels. Start at the first one that does what you need.

| Level | What it is | Use it when |
|---|---|---|
| 1. Options | Props on one viewer | One screen needs a change |
| 2. Reusable viewer | `createTopologyViewer(preset)` with your own components | The whole project needs the same viewer |
| 3. Fork | Change the source | You need something no option reaches. See [FORKING.md](FORKING.md) |

Levels 1 and 2 use the same options. A preset is just options kept in a shared file.

```tsx
import { createTopologyViewer, defineProfile } from "topology-viewer/react";

export const CatalogViewer = createTopologyViewer({
  profile: defineProfile({ nodeTypes: { table: { label: "Table", icon: tableSvg } } }),
  themes: { dark: darkTheme },
  parts: {
    "inspector-notes": { render: ({ node }) => <OwnerCard node={node} /> },
  },
});

// Props win over the preset, and `parts` merge by name.
<CatalogViewer url="/api/graph" colorMode="system" />;
```

Without React, `mountTopology(element, options)` takes the same options. See [Without React](#without-react).

## Parts

Every element in the viewer has a public name, its **part**. The same name works in CSS and in the `parts` option.

```
viewer-frame
├ canvas: node, edge, tooltip
├ filter-bar
│ ├ filter-families: family-tab, family-picker
│ └ filters: predicate-pill, predicate-picker
├ search-tools
│ ├ search: search-results, search-result
│ └ fullscreen-button
├ display-options: scope-menu, types-menu, layout-menu, grouping-menu, dataset-button
├ inspector
│ ├ inspector-empty
│ ├ inspector-header, inspector-actions
│ └ inspector-body
│   ├ inspector-attributes: attribute-row
│   ├ inspector-notes
│   └ inspector-triples: triple-row
├ hidden-panel: hidden-row
├ workbench
│ ├ workbench-toolbar: table-filters, column-menu
│ ├ bulk-bar
│ ├ table: table-head, table-row, table-cell, cell-editor
│ └ change-bar
├ split-handle
└ load-status, canvas-notice, data-notice, focus-pill, undo-toast
```

**Stability.** The 52 names above are stable: they, their options and their context keep working across minor versions (`TopologyPartName` lists them). Every other element also has a name, so that you can style it, but those style-only names can change in a minor version until 1.0. To find one, inspect the element in your browser and read its `part` attribute.

Each part takes the same keys:

| Key | Does | Kind |
|---|---|---|
| `className`, `style` | Adds a class or an inline style. Either can be a function of the state | Style |
| `hidden` | Removes the part | Modify |
| `options` | The settings of this part | Modify |
| `on` | Sees or stops an action that starts in this part | Modify |
| `before`, `after` | Your content around the default | Extend |
| `items` | Reorders, removes or adds children of a container | Extend |
| `render` | Your content instead of the default | Replace |
| `match` | Which items take `render`, such as the nodes of one type | Replace |

## Style

Pick the first of these that does the job.

### Tokens

`theme` sets public tokens. A key names `--tv-<kebab-case-key>`: `frameRadius` is `--tv-frame-radius`, and `family0Tint` is `--tv-family-0-tint`. You can also set them in your own CSS.

```tsx
<TopologyViewer theme={{ frameRadius: "0", radius: "4px", font: "Inter", accent: "#7c3aed" }} />
```

```css
.my-viewer { --tv-frame-radius: 0; --tv-accent: #7c3aed; }
```

| Tokens | |
|---|---|
| Frame | `frame-radius`, `frame-border`, `fullscreen-z` |
| Type | `font`, `font-canvas`, `font-size-1` to `font-size-7` (8, 9, 10, 11, 12, 13 and 14 px) |
| Shape | `radius-xs`, `radius-sm`, `radius`, `radius-lg`, `radius-pill`, `shadow`, `shadow-popup` |
| Motion | `motion-duration`, `motion-easing` |
| Surfaces | `canvas`, `surface`, `surface-subtle`, `surface-hover`, `card-bg`, `overlay-bg`, `backdrop` |
| Lines | `border`, `border-strong`, `rule`, `rule-subtle` |
| Text | `text`, `text-soft`, `text-muted`, `text-faint`, `text-strong`, `control-text`, `control-text-soft`, `pill-text`, `predicate-text`, `link` |
| States | `accent`, `focus`, `danger`, `danger-tint`, `warning`, `picked` |
| Canvas | `node-label`, `node-sublabel`, `node-label-halo`, `node-outline`, `group-sublabel`, `badge`, `chip-line`, `chip-text`, `chip-open`, `edge-muted`, `edge-dim`, `edge-pill-text`, `lost-fill`, `lost-text` |
| Tooltip | `tooltip-bg`, `tooltip-text`, `tooltip-subtext` |
| Table | `table-node-tint`, `table-node-text`, `table-edge-tint`, `table-edge-text`, `handle-drag` |
| AI marks | `ai-tint`, `ai-text`, `ai-bg`, `ai-note-text` |
| Families | `family-0-tint`, `family-0-border`, `family-0-main`, up to `family-5-*` |

### Light and dark

The library ships a light look. You add the rest.

```tsx
<TopologyViewer themes={{ dark: darkTheme }} colorMode="system" />
```

`colorMode` is a name in `themes`, or `"system"`. Changing it keeps the chart and the selection. A dark theme has to set the colour tokens above, or text falls back to the dark default. [`demo/src/dark-theme.ts`](demo/src/dark-theme.ts) is a complete example to copy.

`canvas` also feeds the contrast check of the node colours, so give it a colour in a theme. If you set `--tv-canvas` only by CSS, the viewer reads it when it renders.

### One element

```css
.my-viewer::part(viewer-frame) { border-radius: 0; }
.my-viewer::part(table-row selected) { background: gold; }
```

`::part` beats the viewer's own rules. The states are part names too: `selected`, `pressed`, `expanded`, `checked`, `disabled` and `state-<value>`. A Tailwind variant works on the host:

```tsx
<TopologyViewer className="[&::part(viewer-frame)]:rounded-none" />
```

### Inline style

```tsx
parts={{
  "triple-row": { style: { paddingBlock: 9 } },
  "table-row": { style: ({ selected }) => (selected ? { background: "gold" } : undefined) },
}}
```

An inline style goes through the DOM style API, so it needs no `unsafe-inline`.

### Tailwind and your own classes

Page CSS cannot reach inside the Shadow DOM. `pageStyles` copies your stylesheets into it, so a class works on a part:

```tsx
<TopologyViewer
  pageStyles
  parts={{
    "family-tab": { className: "bg-amber-200 shadow-lg" },
    "inspector-title": { className: "text-red-600 underline" },
  }}
/>
```

Tested with Tailwind 4. Its utilities win over the viewer, and its reset stays under it. A rule of yours with no layer, such as a global `.row {}`, also reaches the viewer while this is on.

You do not need `pageStyles` for your own content in `render`, `before`, `after` or `items`. That content lives outside the Shadow DOM, so your CSS already applies.

### Raw CSS

```tsx
<TopologyViewer styles=".insp-title { letter-spacing: 2px; }" />
```

Internal class names are not a stable API, so prefer a part.

## Behaviour

### Your own content

```tsx
parts={{
  "inspector-notes": { render: ({ node }) => <OwnerCard id={node?.id} /> },
  "triple-row": { before: ({ triple }) => <RiskBadge triple={triple} /> },
  "display-options": {
    items: [
      "layout-menu",
      "scope-menu",
      { id: "export", render: ({ commands }) => <button onClick={() => commands.fit()}>Fit</button> },
    ],
  },
}}
```

The content lives outside the Shadow DOM and shows at its place through a native `<slot>`. So your CSS and your React context (a theme provider, a query client) keep working. Viewer tokens inherit into it, so text takes the colour of the viewer unless you set one.

Each function gets a context with the data of the part and `commands`. A part that lives inside a fixed element puts your content inside that element: `table-cell`, `search-result`, `bulk-bar`, `inspector-empty` and `canvas`.

`render` replaces a part and cannot wrap its default. To keep most of a component, replace one of its smaller parts instead.

### Actions

Every control goes through one pipeline, so you can watch or stop any action.

```tsx
parts={{
  "family-tab": {
    on: { toggleFamily: (event) => { if (!allowed) event.preventDefault(); } },
  },
  node: { on: { activate: (event) => router.push(`/assets/${event.id}`) } },
}}
onAction={(event) => analytics.track(event.type, event.args)}
```

- **Actions:** `select`, `activate`, `focus`, `expand`, `collapse`, `hide`, `restore`, `reveal`, `resetView`, `clearAndFit`, `setLayout`, `setBudget`, `setGrouping`, `showAllTypes`, `toggleType`, `toggleFamily`, `togglePredicate`, `groupAroundRoot`.
- **Also:** `press` (a click on any part), `pick` (a search result), `rowPress` (a table row), `edit` (a cell), `save`, `displayMode`.

A handler on a part runs for actions that start inside that part, innermost part first.

### Commands and state

```tsx
const viewer = useRef<TopologyViewerRef>(null);
<TopologyViewer ref={viewer} onStateChange={(state) => setState(state)} />;

viewer.current?.focus("orders");
viewer.current?.setLayout("tree-v");
viewer.current?.setTableFilters({ rowType: "edges" });
viewer.current?.getState();
```

`TopologyCommands` lists them all. `getState` reads the settled chart, so a layout change shows there when its move ends, and `onStateChange` tells you when. Events: `onSelect`, `onAction`, `onStateChange`, `onFiltersChange`, `onDirtyChange`, `onDisplayModeChange`, `onSave`, `onError`.

### Keys

```tsx
keyboard={{ search: "mod+k", toggleTable: false }}  // mod is Ctrl or Cmd
keyboard={false}                                    // no keys at all
```

Names: `search`, `toggleTable`, `tableSmaller`, `tableLarger`, `undo`, `redo`, `escape`.

### Other host behaviour

`openLink(href)` replaces `window.open`, and `copyForAi(text)` replaces the clipboard write.

## The options of each part

### Filters

```tsx
parts={{
  "filter-families": { options: { off: ["Lineage"], hidden: ["Other"], basicMax: 6 } },
  filters: {
    options: {
      off: ["relatedTo"],
      hidden: ["mapsTo"],
      basicMax: 8,
      custom: [
        { id: "prod", label: "Production", active: true, test: (node) => node.attrs.env === "prod" },
      ],
    },
  },
  "types-menu": { options: { off: ["column"] } },
}}
```

`off` starts a filter off, and `hidden` removes its control. A `custom` filter shows as one more pill and leaves out the nodes that fail its `test`. With more options than `basicMax`, a row becomes a picker.

### Display options

```tsx
parts={{
  "scope-menu": { options: { budgets: [25, 100, "all"], default: 25 } },
  "layout-menu": { options: { layouts: ["force", "tree-h"], default: "custom:radial" } },
  "grouping-menu": { options: { values: [3, 8, "off"], default: 3 } },
  "display-options": { items: ["layout-menu", "scope-menu"] },
}}
layouts={{
  radial: { label: "Radial", run: ({ nodes, edges }) => placeThem(nodes, edges) },
}}
```

A view in the payload wins over `default`. A custom layout returns `{ [id]: { x, y } }`, must be a pure function, and appears in the layout menu as `custom:<key>`.

### Search

```tsx
parts={{
  search: {
    options: {
      debounce: 300,
      limit: 20,
      minLength: 2,
      placeholder: "Find an asset",
      match: (node, query) => node.attrs.sku?.includes(query),
      source: (query, signal) =>
        fetch(`/api/search?q=${query}`, { signal }).then((r) => r.json()),
    },
    on: { pick: (event) => { event.preventDefault(); router.push(`/assets/${event.id}`); } },
  },
  "search-result": { render: ({ node, query, active }) => <AssetResult {...{ node, query, active }} /> },
}}
```

`match` replaces the default matching. `source` returns the ids of the hits, with its own loading and failed states, and a new query cancels the last one. A hit outside the loaded graph has no node to focus, so handle it in `pick`. The query leaves the page only through your `source`.

### Full screen

By default, full screen fills the browser view with no browser API. "Expand table" takes the same way.

```tsx
fullscreen="viewport"   // the default
fullscreen="native"     // the Fullscreen API of the browser
fullscreen={false}      // no button, and Expand table stays in the frame
fullscreen={{ enter: ({ element }) => openLayout(element), exit: () => closeLayout() }}

displayMode={expanded ? "fullscreen" : "inline"}   // your state drives it
onDisplayModeChange={(mode) => setExpanded(mode === "fullscreen")}
```

In `viewport` mode, Escape closes an open menu first and then the full view, and the selection stays. The page behind does not scroll (`lockPageScroll={false}` turns this off), and `--tv-fullscreen-z` sets the layer.

A parent with `transform`, `filter` or `contain` traps a fixed element, so the viewer only fills that parent. A parent with `isolation` or its own `z-index` keeps the view under what is above that parent, such as a sticky header. The viewer warns in the console in both cases. Remove that style from the parent, or use `"native"` or your own `{ enter, exit }` there.

### Inspector

```tsx
parts={{
  "inspector-attributes": {
    options: {
      cap: 12,
      only: false,
      fields: [
        { key: "owner_email", label: "Owner" },
        { key: "etag", hidden: true },
        { key: "cost", label: "Cost", format: (value) => `$${value}` },
        { label: "Team", value: (node) => teamOf(node.attrs.owner_email) },
      ],
    },
  },
  "inspector-triples": { options: { tabs: false, filter: (triple) => !triple.retired } },
  "inspector-body": { items: ["inspector-triples", "inspector-attributes"] },
}}
```

A field with a `key` changes or hides that row, and a field with a `value` adds a row. `only: true` keeps just the listed fields, in their order, and can show keys that are normally skipped.

### Table

```tsx
parts={{
  table: {
    options: {
      readOnly: false,
      columnsOnly: false,
      validate: ({ row, column, value }) => (value === "" ? "Required" : undefined),
      columns: [
        { core: "name", label: "Display name" },
        { core: "kind", hidden: true },
        { core: "id", editable: false },
        { attr: "status", label: "Status", editor: { select: ["draft", "live"], message: "Pick one." } },
        { attr: "cost", editor: "number", editable: (row) => row.kind === "node" },
        { attr: "risk", label: "Risk", value: (row) => riskOf(row), format: (value) => `${value}%` },
      ],
    },
  },
  "table-filters": { options: { show: { rowType: false } } },
  "workbench-toolbar": { items: ["table-filters", "table-search", { id: "submit", render: () => <Submit /> }] },
  "table-cell": {
    match: ({ column }) => column === "name",
    render: ({ row, text }) => <a href={`/assets/${row.id}`}>{text}</a>,
  },
  "cell-editor": {
    match: ({ column }) => column?.attr === "owner",
    render: ({ value, commit, cancel }) => <UserPicker value={value} onPick={commit} onClose={cancel} />,
  },
  "change-bar": {
    render: ({ dirty, saving, error, save, cancel }) => <MyBar {...{ dirty, saving, error, save, cancel }} />,
  },
}}
```

Core columns: `canvas`, `id`, `type`, `kind`, `name`, `system`, `description`, `predicate`, `subject`, `object`, `family`, `attributes`. Editors: `"text"`, `"number"`, `"date"`, `"boolean"`, `{ select: [...] }`. A column with `value` is computed and read only. `columnsOnly: true` shows just the listed columns, in their order.

**Saving to your backend:**

```tsx
onSave={async (changes, { all }) => {
  const answer = await fetch("/api/graph", { method: "PATCH", body: JSON.stringify(changes) });
  if (!answer.ok) return { error: "The server is busy. Try again." };
}}
```

`changes` holds only what is new since the last save, and `all` holds everything so far. While a promise runs, the bar shows it and the table takes no edit. A rejected promise, a thrown error or `{ error }` keeps the edits and shows a failure. The text comes only from `{ error }`, so a server message never appears unless you choose to show it.

The table edits cells. Adding and deleting rows is not built in yet.

### Canvas nodes and edges

A node can be any component:

```tsx
parts={{
  node: {
    match: ({ node }) => node.type === "service",
    options: {
      sizes: { service: { width: 160, height: 48 } },
      labels: false,
      label: (node) => node.attrs.title,
      sublabel: (node) => node.attrs.team,
    },
    render: ({ node, selected, commands }) => (
      <ServiceCard node={node} selected={selected} onOpen={() => commands.focus(node.id)} />
    ),
    style: (node) => (node.faded ? { opacity: 0.4 } : undefined),
    on: { activate: (event) => openDetails(event.id) },
  },
  edge: { style: (edge) => (edge.label === "calls" ? { strokeWidth: 3 } : undefined) },
  tooltip: { render: ({ kind, node, edge }) => <MyTip {...{ kind, node, edge }} /> },
}}
```

- **Moves with the canvas.** The node is a `<foreignObject>` in the node group, so it pans, zooms, drags and fades with the canvas.
- **Give it a size.** `sizes` is by type, and the layout uses it to make room. A node with no size keeps the box of its type.
- **Pressing it selects it,** and a double press activates it. A press on a control (`button`, `a`, `input`, `select`, `textarea`, `label`, or anything with `data-tv-control`) belongs to that control: it does not select, drag or pan.
- **Group nodes keep the default,** unless a `match` takes them.
- **Cost.** Each custom node is one component, so keep them light when you draw thousands.
- **Browsers.** Tested in Chromium. Safari has a history of bugs with content in `foreignObject`, so test there if you support it.

The renderer itself cannot be swapped without a [fork](FORKING.md), because it owns the state of the chart.

### Icons and types

```tsx
const profile = defineProfile({
  extends: neutralProfile,            // or qdicProfile
  families: ["Traffic"],
  nodeTypes: {
    robot: { label: "Robot", category: "Machines", icon: robotSvg, color: "#123456" },
    person: { label: "Person", category: "People", color: "#7c3aed", rank: 2, abbr: "PE" },
  },
  predicates: { drives: { family: "Traffic", inverse: "drivenBy" } },
});

<TopologyViewer
  profile={profile}
  familyLooks={{ Traffic: { main: "#ff0000", tint: "#ffeeee", border: "#ff8888", icon: "bot" } }}
/>;
```

An icon is SVG text. It is read with an allow-list and built from data, never as markup: a script, an event attribute, a `url()` or `<use>` is an error. Its `viewBox` must start at `0 0`. One icon shows everywhere that the type shows. `defineProfile` is safe to call on a server.

`profile` is read at mount. To change it, give the viewer a new `key`.

## Without React

`mountTopology` takes the same options. A function in a part gets the context and an element, and can return a cleanup.

```ts
const viewer = mountTopology(element, {
  url: "/api/graph",
  parts: {
    "inspector-notes": {
      render: ({ node }, element) => {
        element.textContent = `Notes of ${node?.label}`;
        return () => { /* runs before the next render */ };
      },
    },
  },
});

viewer.commands.focus("orders");
```

A part can also take a DOM node or a text.
