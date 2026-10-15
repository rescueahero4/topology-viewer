# Topology chart: guidance for the AI client

<!-- id: when-to-render -->
## When to render

Call `render_topology` when the answer is a set of things and the links between them. Examples are lineage, ownership, access, structure and dependencies.

Do not call it for one fact or for a list with no links. Do not call it when the catalog has no match. Say so in the reply.

One call draws one chart. A second call replaces the chart.

<!-- id: shape-data -->
## How to shape data

Send `nodes` and `edges`.

- A node has a unique `id`. It can also have `type`, `label` and `attrs`.
- An edge has `subject`, `predicate` and `object`. The `subject` and the `object` are node `id` values. It can also have `attrs`.

```json
{
  "nodes": [
    { "id": "tbl-orders", "type": "table", "label": "ORDERS" },
    { "id": "usr-jane", "type": "user", "label": "Jane Doe" }
  ],
  "edges": [{ "subject": "tbl-orders", "predicate": "ownedBy", "object": "usr-jane" }]
}
```

The compact form is shorter. Write a node as `[id, type, label, attrs]` and an edge as `[subject, predicate, object, attrs]`. Use it for large results.

Use these recipes for data that is not a graph yet:

1. Give each thing a unique `id`. Make one node for each thing.
2. Make one edge for each link between two things.
3. Put the other fields of a thing in `attrs`.
4. Use a QDIC predicate when one fits, for example `contains`, `ownedBy`, `taggedWith` or `classifiedAs`.

The app can shape two raw forms. Add a `shape` hint to name the keys of your data:

- A list of flat rows (a CSV file or a SQL result): `shape` is `{ "kind": "rows", "subject": "<key>", "object": "<key>" }`. The keys `predicate` and `type` are optional. Each is a key name or a fixed value.
- A nested object (a JSON tree): `shape` is `{ "kind": "tree", "children": "<key>", "label": "<key>" }`. The key `id` is optional. A tree has at most 64 levels.

With no `shape` hint, the app tries these column pairs: `source` and `target`, `from` and `to`, `parent` and `child`, `subject` and `object`, `*_id` pairs, and `children` or `items`. Send a `shape` hint when you are not sure. The app marks what it makes as inferred and reports `shaped-from`.

<!-- id: quollio-passthrough -->
## Results of `quollio-mcpserver`

Send the results of `quollio-mcpserver` unchanged.

- Send the results of `get_neighborhood`, `get_related_nodes` and `get_nodes` as `nodes` and `edges`.
- Send the results of `get_node_types` and `get_predicates` as `vocabulary`.

Do not rename keys. Do not remove fields. Do not reshape the result. The app reads the QDIC names, for example `globalId`, `nodeType`, `physicalName`, `subjectNodeId` and `objectNodeId`. Use the recipes of the previous section only for other sources.

<!-- id: how-much -->
## How much to send

One call takes at most 2,000 nodes, 4,000 edges and 256 KB of JSON. A larger call draws nothing and returns `too-large`.

First filter the data to the part that answers the question. Then send that part. Send the most relevant part first when the answer is still large.

<!-- id: first-view -->
## What to draw first

Use `view` to set the first view. It has these keys and no others:

- `view.root`: the `id` of the node that the question is about.
- `view.reveal`: a list of node `id` values to draw first. Use only `id` values that are in `nodes`.
- `view.budget`: the size of the first view. The value is 10, 20, 50 or `"all"`.
- `view.layout`: one of `force`, `atomic`, `bubbles`, `tree-h` or `tree-v`.

<!-- id: approach -->
## Which approach

The key `view.approach` is `active` or `passive`.

- If you have a root, send `active`. The chart opens with the root selected and its neighbors lit.
- If the request has no hint (a vague request), send `passive`. The chart opens with nothing selected.
- If the `view.root` is not in `nodes`, the chart opens `active` on the most connected node. The result has the warning `root-not-found`.

When you send no `view.approach`, the chart is `active` with a root and `passive` without a root.

<!-- id: node-design -->
## Node design

QDIC node types have their own icons. Do not declare them.

Declare every other node type in `types`, one entry for each type. Follow `NODE_DESIGN_GUIDE`. An entry can have `label`, `rank`, `shape`, `color`, `abbr`, `glyph`, `level` and `role`.

<!-- id: inferences-and-fields -->
## Inferences and field labels

If you infer or summarise a value, name the field in `_inferred` on the node. Give a short reason for each field. The chart marks the value as inferred and displays the reason.

```json
{ "id": "tbl-orders", "_inferred": { "description": "summarised from the DDL comment" } }
```

If a key in the data has no name that the app knows, label it in `fields`. An entry has `label`, `slot` and `why`. Use `slot` to map the key to a slot of the catalog. Use `why` to give the reason. The chart marks each mapping as made by the AI.

<!-- id: notice-vocabulary -->
## Notice vocabulary

The summary of a result names the codes of the warnings. If a code appears, read its text below. Then fix the data in your next call.

Warnings. The chart is drawn, and the code names a problem:

```text
`no-id`: Give every node a unique `id`, and include every node an edge's `source` or `target` points at.
`duplicate-id`: Give every node a unique `id`, and include every node an edge's `source` or `target` points at.
`dangling-edge`: Give every node a unique `id`, and include every node an edge's `source` or `target` points at.
`unknown-type`: Use a QDIC node type name, or declare each type that you use in `types` with a `label` and a `rank` (0 to 6).
`constraint-violation`: Use a predicate that the edge constraints allow between the node types of `subject` and `object`, or make sure that the two ends are correct.
`glyph-rejected`: `types[t].glyph` must be SVG path data for a 24×24 box: only the path letters M, L, H, V, C, S, Q, T, A, Z (upper or lower case), numbers, spaces, commas, dots, minus signs and `e`, at most 512 characters. `types[t].abbr` must be at most 2 characters.
`color-rejected`: `types[t].color` must be a CSS color, for example `#2f6f8f`, at most 64 characters.
`rank-rejected`: `types[t].rank` must be a whole number from 0 to 6; the rank sets the size and the shape. `types[t].shape` is optional and must be one of `circle`, `triangle`, `square`, `diamond`, `pentagon`, `hexagon`, `heptagon`, `octagon`.
`layout-rejected`: `view.layout` must be one of `force`, `atomic`, `bubbles`, `tree-h`, `tree-v`. `types[t].role` must be `structure`, `attribute` or `curation`. `types[t].level` must be a whole number 0–n. The top-level `shape` hint (not `types[t].shape`) must be `{ kind: "rows", subject, object, predicate?, type? }` for a list of flat rows, or `{ kind: "tree", children, label, id? }` for a nested object; each value is the name of a key in your data.
`budget-rejected`: `view.budget` must be 10, 20, 50 or `"all"`.
`schema-version-unknown`: Send `schemaVersion: "1"`, or leave `schemaVersion` out.
`inferred-rejected`: `_inferred` must be an object that maps a field name to a short reason, for example `{ "description": "summarised from the DDL comment" }`.
`unknown-key`: Use only the documented keys. Top level: `schemaVersion`, `nodes`, `edges`, `links`, `neighborhood`, `defaults`, `types`, `predicates`, `fields`, `vocabulary`, `view`, `shape`. `view`: `approach`, `root`, `reveal`, `layout`, `budget`. `types[t]`: `label`, `rank`, `shape`, `color`, `abbr`, `glyph`, `level`, `role`. `predicates[p]`: `label`, `category`, `inverse`, `role`. `fields[k]`: `label`, `slot`, `why`. An unknown key inside one of these entries or inside the `shape` hint is dropped and reported with this code. There is no `title` key: put the title and all other text in your reply. Unknown keys inside a node are kept as its attributes.
`root-not-found`: Set `view.root` to the `id` of a node in `nodes`.
`reveal-not-found`: Put in `view.reveal` only the `id` values of nodes in `nodes`.
`shaped-from`: The chart shaped your data with the `shape` hint or with a built-in rule. To control the result, send `nodes` and `edges`, or a `shape` hint: `{ kind: "rows", subject, object, predicate?, type? }` for a list of flat rows, or `{ kind: "tree", children, label, id? }` for a nested object; each value is the name of a key in your data.
`field-rejected`: A value was rejected and a fallback was used. The issue `path` names the field. Send each value in the right type in a node (`type`, `label`, `attrs` and the QDIC names), an edge (`predicate`, `isActive`, `valid_from`, `valid_to`, `attrs`), `types`, `predicates`, `fields`, `vocabulary`, `defaults` and `view.approach`: text as a string; `attrs`, `attributes`, `defaults` and each entry as an object; the `vocabulary` lists as arrays; `isActive` and `isWritable` as `true` or `false`; `view.approach` as `"active"` or `"passive"`.
```

Fatal codes. Nothing is drawn:

```text
`not-object`: Send { "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] }.
`nodes-not-array`: Send `nodes` as an array: { "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] }.
`edges-not-array`: Send `edges` as an array (an empty array is fine): { "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] }.
`no-valid-nodes`: Give every node a unique `id`, and use those ids as each edge's `source` and `target`.
`too-large`: Send at most 2,000 nodes, 4,000 edges and 256 KB of JSON in one call. Send a smaller result: filter it to the part that answers the question, or send the most relevant part first.
`not-a-graph`: Send `nodes` and `edges`: { "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] }. Or keep the raw data and add a `shape` hint: `{ kind: "rows", subject, object, predicate?, type? }` for a list of flat rows, or `{ kind: "tree", children, label, id? }` for a nested object; each value is the name of a key in your data. A tree can have at most 64 levels.
```

Notices of the chart. The user sees them in the chart:

```text
`no-data`: Send at least one node in `nodes`. If the catalog has no match, say so in the reply and don't attach a chart.
`edges-only`: Include every node referenced by an edge's `source` and `target` in `nodes`.
`types-off`: (no instruction for the AI client)
`empty-fallback`: (no instruction for the AI client)
`error-fallback`: Resend the result. If it is large, send the most relevant part first (for example up to 500 nodes).
```

<!-- id: reply -->
## What to say in the reply

Put the question, the story and all explanations in your reply. Put no text in the chart. The chart has no key for text.

If the summary names records that the app skipped, tell the user.
