# topology-viewer

A graph explorer for your API payload: canvas, inspector, search, filters, layouts and an editable table. No runtime dependencies. No backend.

**[Documentation and live demos](https://rescueahero4.github.io/topology-viewer/)**

```sh
npm install git+https://github.com/rescueahero4/topology-viewer.git
```

Run the same command to update. A plain `npm install` keeps the commit in your lockfile.

```tsx
import { TopologyViewer } from "topology-viewer/react";

<div style={{ height: 600 }}>
  <TopologyViewer url="/api/graph" />
</div>;
```

Without React: `mountTopology(element, options)` from `topology-viewer`. See [`types/index.d.ts`](types/index.d.ts) for all options.

## Customizing

Change any style or behaviour with no fork. See [CUSTOMIZING.md](CUSTOMIZING.md).

```tsx
<TopologyViewer
  url="/api/graph"
  themes={{ dark: darkTheme }}
  colorMode="system"
  pageStyles
  parts={{
    "family-tab": { className: "bg-amber-200" },
    "inspector-notes": { render: ({ node }) => <OwnerCard node={node} /> },
    node: { render: ({ node, selected }) => <ServiceCard {...{ node, selected }} /> },
    table: { options: { validate: ({ value }) => (value === "" ? "Required" : undefined) } },
  }}
  onSave={async (changes) => { await api.patch(changes); }}
/>
```

For a change that no option reaches, see [FORKING.md](FORKING.md).

## Updating from 0.1

- `variant` now defaults to `"page"`. Set `variant="widget"` for the compact chat look, which also has the rounded frame.
- Full screen now fills the browser view. Set `fullscreen="native"` for the browser's Fullscreen API.
- `onSave` now gets only the changes since the last save. The full list is in its second argument, `info.all`. If it returns a promise, the bar waits for it, and a failure keeps the edits.
- The search shortcut no longer fires with Ctrl or Cmd held.

## Data

Give one of `data`, `url` or `load`.

```tsx
<TopologyViewer
  load={(signal) =>
    fetch("/api/graph", { signal, headers: { authorization } })
      .then((r) => r.json())
      .then((r) => r.result.graph)
  }
/>
```

```json
{
  "nodes": [{ "id": "a", "type": "service", "label": "Orders", "attrs": { "lang": "Go" } }],
  "edges": [{ "source": "a", "target": "b", "predicate": "dependsOn" }]
}
```

Optional keys: `types`, `predicates`, `view`, `links`, `neighborhood`, `shape`. A bad value gives a notice, not a throw. Limits: 2,000 nodes, 4,000 edges, 8 MB.

The default vocabulary has general predicates and no node types. For the QDIC vocabulary and icons: `profile={qdicProfile}` from `topology-viewer/profiles/qdic` (optional import, 70 KB).

## Integration

Each viewer has its own state and its own Shadow DOM root. It needs no `unsafe-eval` and no `unsafe-inline`. Add your API to `connect-src`. With `pageStyles`, `style-src` must also allow your stylesheets.

The React component is safe to server-render: it renders an empty element and mounts in the browser. `mountTopology` is browser only. All code runs in the browser, so keep secrets out of `load`.

## Repository

| Path | npm installs it | Purpose |
|---|---|---|
| `dist/`, `types/`, `CUSTOMIZING.md`, `FORKING.md`, `LICENSE`, `THIRD-PARTY-NOTICES.txt` | Yes | The package. |
| `src/`, `assets/`, `scripts/` | No | Source of `dist/`, and its tests. |
| `demo/` | No | A separate app with its own `package.json`. It uses only the public entries. |
| `docs/` | No | The documentation site, with live demos. It uses only the public entries. |

`npm run check` fails if this border or a dependency licence is broken.

```sh
npm install && npm run demo   # http://127.0.0.1:4601, with a mock API on port 4600
npm test && npm run typecheck && npm run check
npm audit && npm --prefix demo audit
npm --prefix demo run test:e2e
```

After a library change, run `npm run build` and reload the demo.

The documentation site runs on the same build:

```sh
npm run build && npm --prefix docs install && npm --prefix docs run dev   # http://localhost:4321/topology-viewer/
npm --prefix docs run test:e2e
```

## Licence

MIT. See `LICENSE`. Bundled libraries: `THIRD-PARTY-NOTICES.txt`.
