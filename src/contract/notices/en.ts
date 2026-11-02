import type { z } from "zod";
import type { NoticeCode, NoticeText } from "./codes";
import type { valueTextsSchema } from "./values";

export const AI_SHAPE =
  '{ "nodes": [{ "id", "type", "label" }], "edges": [{ "source", "target", "predicate" }] }';

const SKIP_AI =
  "Give every node a unique `id`, and include every node an edge's `source` or `target` points at.";

const RESEND =
  "Copy the details and paste them into the chat so it knows what to fix.";

const HINTS =
  '`{ kind: "rows", subject, object, predicate?, type? }` for a list of flat rows, or `{ kind: "tree", children, label, id? }` for a nested object; each value is the name of a key in your data';

export const en = {
  "no-id": {
    title: "Some nodes have no id",
    body: "{count} node(s) had no `id` and were skipped.",
    user: [
      `The rest of the result is drawn. Ask the data provider to resend the result with an id on every node. ${RESEND}`,
    ],
    ai: SKIP_AI,
  },
  "duplicate-id": {
    title: "Some nodes reuse an id",
    body: "{count} node(s) reused an id that was already taken; only the first one was kept.",
    user: [
      `The rest of the result is drawn. Ask the data provider to resend the result with a unique id on every node. ${RESEND}`,
    ],
    ai: SKIP_AI,
  },
  "dangling-edge": {
    title: "Some relationships point at missing nodes",
    body: "{count} relationship(s) point at nodes that aren't in the result and were left out.",
    user: [
      `The rest of the result is drawn. Ask the data provider to resend the result with the nodes these relationships connect. ${RESEND}`,
    ],
    ai: SKIP_AI,
  },
  "unknown-type": {
    title: "Some node types are not known",
    body: "{count} node(s) use a type that is not declared in `types` and is not a known node type.",
    user: [
      `Ask the data provider to declare the node types that it uses. ${RESEND}`,
    ],
    ai: "Use a known node type name, or declare each type that you use in `types` with a `label` and a `rank` (0 to 6).",
  },
  "constraint-violation": {
    title: "Some relationships break a vocabulary rule",
    body: "{count} relationship(s) connect node types that the edge constraints do not allow for their predicate. They are drawn, but they can be wrong.",
    user: [
      `Check these relationships in the Dataset table. Ask the data provider to check them. ${RESEND}`,
    ],
    ai: "Use a predicate that the edge constraints allow between the node types of `subject` and `object`, or make sure that the two ends are correct.",
  },
  "glyph-rejected": {
    title: "Some node marks can't be used",
    body: "The mark of {count} node type(s) can't be used, so these types show two letters instead.",
    user: [
      "The chart is drawn. To get the marks, copy the details and ask the data provider to resend the node types.",
    ],
    ai: "`types[t].glyph` must be SVG path data for a 24×24 box: only the path letters M, L, H, V, C, S, Q, T, A, Z (upper or lower case), numbers, spaces, commas, dots, minus signs and `e`, at most 512 characters. `types[t].abbr` must be at most 2 characters.",
  },
  "color-rejected": {
    title: "Some node colors can't be used",
    body: "The color of {count} node type(s) can't be read, so these types use their default color.",
    user: [
      "The chart is drawn. To get the colors, copy the details and ask the data provider to resend the node types.",
    ],
    ai: "`types[t].color` must be a CSS color, for example `#2f6f8f`, at most 64 characters.",
  },
  "rank-rejected": {
    title: "Some node sizes or shapes can't be used",
    body: "The rank or the shape of {count} node type(s) can't be used. A bad rank becomes 0; a bad shape gives the shape of the rank.",
    user: [
      "The chart is drawn. To fix the node sizes and shapes, copy the details and ask the data provider to resend the node types.",
    ],
    ai: "`types[t].rank` must be a whole number from 0 to 6; the rank sets the size and the shape. `types[t].shape` is optional and must be one of `circle`, `triangle`, `square`, `diamond`, `pentagon`, `hexagon`, `heptagon`, `octagon`.",
  },
  "layout-rejected": {
    title: "Some layout settings can't be used",
    body: "{count} layout setting(s) can't be used and were ignored, so the default layout rules apply.",
    user: [
      "The chart is drawn with the default layout. To change it, copy the details and ask the data provider to resend the settings.",
    ],
    ai: `\`view.layout\` must be one of \`force\`, \`atomic\`, \`bubbles\`, \`tree-h\`, \`tree-v\`. \`types[t].role\` must be \`structure\`, \`attribute\` or \`curation\`. \`types[t].level\` must be a whole number 0–n. The top-level \`shape\` hint (not \`types[t].shape\`) must be ${HINTS}.`,
  },
  "budget-rejected": {
    title: "The node budget can't be used",
    body: "The budget of the first view can't be used, so the default budget applies.",
    user: [
      "The chart is drawn. Change the budget in the chart if you need more or fewer nodes.",
    ],
    ai: '`view.budget` must be 10, 20, 50 or `"all"`.',
  },
  "schema-version-unknown": {
    title: "The schema version is not known",
    body: "The data names a schema version that this chart doesn't know, so it was read as version 1.",
    user: [
      "The chart is drawn. If something looks wrong, copy the details and ask the data provider to resend the result.",
    ],
    ai: 'Send `schemaVersion: "1"`, or leave `schemaVersion` out.',
  },
  "inferred-rejected": {
    title: "Some inferred notes can't be read",
    body: "The `_inferred` notes of {count} node(s) can't be read and were ignored, so these fields show no inferred mark.",
    user: [
      "The chart is drawn. Copy the details and ask the data provider to resend the notes.",
    ],
    ai: '`_inferred` must be an object that maps a field name to a short reason, for example `{ "description": "summarised from the DDL comment" }`.',
  },
  "unknown-key": {
    title: "Some keys are not known",
    body: "{count} key(s) that this chart doesn't know were ignored: at the top level, in `view` or `defaults`, or inside an entry of `types`, `predicates` or `fields` or inside the `shape` hint.",
    user: [
      "The chart is drawn. Copy the details and ask the data provider to resend the result without these keys.",
    ],
    ai: "Use only the documented keys. Top level: `schemaVersion`, `nodes`, `edges`, `links`, `neighborhood`, `defaults`, `types`, `predicates`, `fields`, `vocabulary`, `view`, `shape`. `view`: `approach`, `root`, `reveal`, `layout`, `budget`. `types[t]`: `label`, `rank`, `shape`, `color`, `abbr`, `glyph`, `level`, `role`. `predicates[p]`: `label`, `category`, `inverse`, `role`. `fields[k]`: `label`, `slot`, `why`. `defaults`: `type`, `predicate`. An unknown key inside one of these entries, inside `defaults` or inside the `shape` hint is dropped and reported with this code. There is no `title` key: put the title and all other text in your reply. Unknown keys inside a node are kept as its attributes.",
  },
  "root-not-found": {
    title: "The chosen root is not in the data",
    body: "The root that the data provider chose is not in the result, so the most connected node is the root.",
    user: [
      "The chart is drawn from the most connected node. To start from another node, select it in the chart or ask the data provider again.",
    ],
    ai: "Set `view.root` to the `id` of a node in `nodes`.",
  },
  "reveal-not-found": {
    title: "Some nodes to show first are not in the data",
    body: "{count} node(s) in the reveal list are not in the result and were ignored.",
    user: [
      "The rest of the chart is drawn. Search for the nodes that you need, or copy the details and ask the data provider.",
    ],
    ai: "Put in `view.reveal` only the `id` values of nodes in `nodes`.",
  },
  "shaped-from": {
    title: "The data was shaped into a graph",
    body: "The data arrived as {kind}, not as nodes and edges. The chart made {count} relationship(s) from it and marks what it made as inferred.",
    user: [
      "Check the result. If it is not correct, copy the details and ask the data provider to send nodes and edges.",
    ],
    ai: `The chart shaped your data with the \`shape\` hint or with a built-in rule. To control the result, send \`nodes\` and \`edges\`, or a \`shape\` hint: ${HINTS}.`,
  },
  "field-rejected": {
    title: "Some values have the wrong type",
    body: "{count} value(s) in the data had the wrong type and were not used. The chart uses the default for each of them.",
    user: [
      "The chart is drawn. Copy the details and ask the data provider to resend these values in the right type.",
    ],
    ai: 'A value was rejected and a fallback was used. The issue `path` names the field. Send each value in the right type in a node (`type`, `label`, `attrs` and the catalog names), an edge (`predicate`, `isActive`, `valid_from`, `valid_to`, `attrs`), `types`, `predicates`, `fields`, `vocabulary`, `defaults` and `view.approach`: text as a string; `attrs`, `attributes`, `defaults` and each entry as an object; the `vocabulary` lists as arrays; `isActive` and `isWritable` as `true` or `false`; `view.approach` as `"active"` or `"passive"`.',
  },
  "not-object": {
    title: "This data isn't a graph",
    body: "The chart expects an object with a `nodes` list and an `edges` list, but received {got}.",
    user: [`Ask the data provider to resend the result as a graph. ${RESEND}`],
    ai: `Send ${AI_SHAPE}.`,
  },
  "nodes-not-array": {
    title: "The node list is malformed",
    body: "`nodes` should be a list of node objects, but it is {got}. Without nodes there is nothing to draw.",
    user: [`Ask the data provider to resend the result. ${RESEND}`],
    ai: `Send \`nodes\` as an array: ${AI_SHAPE}.`,
  },
  "edges-not-array": {
    title: "The relationship list is malformed",
    body: "`edges` should be a list of relationships, but it is {got}.",
    user: [`Ask the data provider to resend the result. ${RESEND}`],
    ai: `Send \`edges\` as an array (an empty array is fine): ${AI_SHAPE}.`,
  },
  "no-valid-nodes": {
    title: "None of the nodes can be identified",
    body: "All {rawNodes} node(s) arrived without an `id`, so relationships can't be attached to them and nothing can be drawn.",
    user: [
      `Ask the data provider to resend the result with an id on every node. ${RESEND}`,
    ],
    ai: "Give every node a unique `id`, and use those ids as each edge's `source` and `target`.",
  },
  "too-large": {
    title: "This result is too large to draw",
    body: "This result has {got}, more than the limit of {limit}, so nothing is drawn.",
    user: [
      `Ask the data provider for a smaller result: only the part that answers your question. ${RESEND}`,
    ],
    ai: "Send at most 2,000 nodes, 4,000 edges and 256 KB of JSON in one call. Send a smaller result: filter it to the part that answers the question, or send the most relevant part first.",
  },
  "not-a-graph": {
    title: "This data can't be read as a graph",
    body: "The data has no `nodes` list, and the chart can't shape it into a graph from rows or from a tree, so nothing can be drawn.",
    user: [
      `Ask the data provider to resend the result as nodes and relationships. ${RESEND}`,
    ],
    ai: `Send \`nodes\` and \`edges\`: ${AI_SHAPE}. Or keep the raw data and add a \`shape\` hint: ${HINTS}. A tree can have at most 64 levels.`,
  },
  "no-data": {
    title: "No results to draw",
    body: "The data provider sent this chart with no nodes and no relationships, so there is nothing to show. Usually the question matched nothing in the catalog, or the search was scoped too narrowly.",
    user: [
      "Ask the data provider to search more broadly: a shorter name, the parent schema or database, or fewer filters.",
      "Check the spelling of the asset name in your question.",
    ],
    ai: "Send at least one node in `nodes`. If the catalog has no match, say so in the reply and don't attach a chart.",
  },
  "edges-only": {
    title: "Relationships arrived without their nodes",
    body: "This result has {rawEdges} relationship(s) but an empty `nodes` list, so none of them can be drawn.",
    user: [
      "Ask the data provider to resend the result with the nodes these relationships connect.",
    ],
    ai: "Include every node referenced by an edge's `source` and `target` in `nodes`.",
  },
  "types-off": {
    title: "All node types are switched off",
    body: "All {typeCount} node type(s) are turned off in the Types menu, so nothing is drawn. What you expanded and hid is kept.",
    user: [
      "Show all types again, or turn on only the ones you need in the Types menu below.",
    ],
    ai: "",
  },
  "empty-fallback": {
    title: "Nothing is drawn right now",
    body: "This result has {rawNodes} node(s), but none are drawn with the current settings.",
    user: [
      "Go back to the chart's first view, or find the rows in the Dataset table.",
    ],
    ai: "",
  },
  "error-fallback": {
    title: "Something went wrong while drawing this chart",
    body: "The data arrived, but the chart couldn't be drawn.",
    user: [
      "Try again.",
      "Open the Dataset table to look at the rows that arrived.",
      "If it keeps failing, copy the details and ask the data provider to resend a smaller result.",
    ],
    ai: "Resend the result. If it is large, send the most relevant part first (for example up to 500 nodes).",
  },
} satisfies Record<NoticeCode, NoticeText>;

// why: STORY-002-09 T1 — the `got` texts are the mockup `kindOf` strings (lib/topology.js line 336),
// the measures follow the approved `too-large` text and the kinds follow HINTS
export const enValues = {
  got: {
    array: "a list",
    string: "text",
    number: "a number",
    boolean: "true/false",
    null: "null",
    object: "an object",
    missing: "nothing (the field is missing)",
  },
  measure: {
    nodes: "{count} nodes",
    edges: "{count} edges",
    kb: "{count} KB",
    levels: "{count} levels of nesting",
  },
  kind: {
    rows: "a list of flat rows",
    tree: "a nested object",
  },
} satisfies z.infer<typeof valueTextsSchema>;
