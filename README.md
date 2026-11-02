# topology-viewer

A UI library that renders a graph payload from an external API. It gives a canvas, an inspector, search, filters, layouts and an editable table. The library has no backend and does not know your API.

## Install

Install from the git repository:

```sh
npm install git+https://github.com/<owner>/topology-viewer.git
```

npm builds the package during the install. Your app installs no other runtime dependency. React is an optional peer dependency (18 or later). The UI runs on an internal copy of Preact, which your app does not see.

## Connect to an API

```tsx
import { TopologyViewer } from "topology-viewer/react";

export function Graph() {
  return (
    <div style={{ height: 600 }}>
      <TopologyViewer url="https://api.example.com/graph" />
    </div>
  );
}
```

The viewer shows a loading state, a failure state with "Try again", and then the chart. Each viewer fills its parent, so give the parent a height. The default minimum height is 480 px.

## Three ways to give data

| Prop | Use |
|---|---|
| `url` | The viewer sends the request and reads the answer as JSON. Use `requestInit` for headers, method or credentials. |
| `load` | Your own client (axios, GraphQL). The viewer gives an `AbortSignal` and takes a promise. |
| `data` | A payload that you already have. It takes priority over `url` and `load`. |

If the API puts the payload inside an envelope, use `select`:

```tsx
<TopologyViewer url="/api/graph" select={(answer) => answer.result.graph} />
```

Change `reloadKey` to load again from the same source, or call `reload()` on the ref.

Do not put a secret in `requestInit` that the browser must not see. All of this code runs in the browser.

## Payload

The smallest payload is a list of nodes and a list of edges:

```json
{
  "nodes": [
    { "id": "a", "type": "service", "label": "Orders", "attrs": { "language": "Go" } },
    { "id": "b", "type": "store", "label": "orders-db" }
  ],
  "edges": [{ "source": "a", "target": "b", "predicate": "dependsOn" }]
}
```

All fields are optional. The viewer also reads:

- `types`: the look of each node type (`label`, `rank`, `shape`, `color`, `abbr`, `glyph`). Each shape belongs to one rank. If `rank` and `shape` disagree, `rank` decides.
- `predicates`: the look of each edge type (`label`, `category`, `inverse`, `role`).
- `view`: the first view (`root`, `layout`, `budget`, `approach`, `reveal`).
- `links`, `neighborhood`, tuples, and `shape` hints for rows and trees.

A bad value does not crash the viewer. The viewer skips or replaces the value and shows a notice.

## Vocabulary

By default, the viewer gives no meaning to a node type name. The default vocabulary has only general predicates such as `contains`, `dependsOn` and `ownedBy`, with their families.

To use the QDIC catalog vocabulary and icons, import the preset. The preset adds 37 KB to your bundle only if you import it.

```tsx
import { qdicProfile } from "topology-viewer/profiles/qdic";

<TopologyViewer url="/api/graph" profile={qdicProfile} />;
```

## Events

| Prop | When |
|---|---|
| `onLoadStart`, `onLoad`, `onError` | The load starts, ends or fails. |
| `onSelect` | The user selects a node, a group or an edge, or clears the selection. |
| `onEditsChange` | Each cell edit, undo, redo and cancel in the Dataset table. |
| `onEditsSave` | The user presses "Save changes". Send the changes to your API here. |
| `onOpenLink`, `onCopyDetails` | Replace the default new tab and clipboard actions. |

The viewer does not send an edit to a server. Your app decides what to do with it.

## Other options

| Prop | Default | Use |
|---|---|---|
| `lang` | Browser language | `"en"` or `"ja"`. |
| `strings` | None | Replaces interface text by key, in the active language. |
| `variant` | `"widget"` | `"widget"` is the compact look with a full-screen button. `"page"` is the wider look with text labels. |
| `className`, `style` | None | For the outer element. |

## Without React

```ts
import { mountTopology } from "topology-viewer";

const viewer = mountTopology(element, { url: "/api/graph" });
viewer.update({ url: "/api/other" });
viewer.destroy();
```

## Page integration

- **CSS:** The viewer is in a Shadow DOM root. Its CSS does not touch your page, and your CSS does not touch the viewer.
- **Theme:** A rule on the outer element can set a design token, for example `--focus`.
- **Shortcuts:** `/`, `Escape`, `[`, `]` and `Ctrl+.` work only while the pointer or the focus is in the viewer.
- **Several viewers:** Each viewer has its own state, so one page can show several.
- **CSP:** The viewer needs no `unsafe-eval` and no `unsafe-inline`. Add your API to `connect-src`.
- **SSR:** Mount the viewer only in the browser. The React component mounts in an effect.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
```

The source came from `qdic-data-visualization-mcp-app` (branch `dev`, commit `f7bd303`), with its history. The tests run with the QDIC profile. The build uses the neutral profile by default.

## Licence

The licence is not decided, so the package is `private` and `UNLICENSED`. See `THIRD-PARTY-NOTICES.txt` for the bundled libraries.
