# topology-viewer

A graph explorer for your API payload: canvas, inspector, search, filters, layouts and an editable table. No runtime dependencies. No backend.

```sh
npm install git+https://github.com/rescueahero4/topology-viewer.git
```

```tsx
import { TopologyViewer } from "topology-viewer/react";

<div style={{ height: 600 }}>
  <TopologyViewer url="/api/graph" />
</div>;
```

Without React: `mountTopology(element, options)` from `topology-viewer`. See [`types/index.d.ts`](types/index.d.ts) for all options.

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

Each viewer has its own state and its own Shadow DOM root. It needs no `unsafe-eval` and no `unsafe-inline`. Add your API to `connect-src`. Mount in the browser only. All code runs in the browser, so keep secrets out of `load`.

## Repository

| Path | npm installs it | Purpose |
|---|---|---|
| `dist/`, `types/`, `LICENSE`, `THIRD-PARTY-NOTICES.txt` | Yes | The package. |
| `src/`, `assets/`, `scripts/` | No | Source of `dist/`, and its tests. |
| `demo/` | No | A separate app with its own `package.json`. It uses only the public entries. |

`npm run check` fails if this border or a dependency licence is broken.

```sh
npm install && npm run demo   # http://127.0.0.1:4601, with a mock API on port 4600
npm test && npm run typecheck && npm run check
npm audit && npm --prefix demo audit
npm --prefix demo run test:e2e
```

After a library change, run `npm run build` and reload the demo.

## Licence

MIT. See `LICENSE`. Bundled libraries: `THIRD-PARTY-NOTICES.txt`.
