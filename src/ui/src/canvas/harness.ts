import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  firstView,
  frontier,
  normalize,
  place,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type CanvasState,
  type DrawnId,
  type Graph,
  type Hex,
  type LayoutName,
  type Vocab,
} from "@qdic-topology/engine";
import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type Intent,
  type Renderer,
  type RendererText,
  type Scene,
  type SceneNode,
} from "@qdic-topology/renderer";
import { auditStrings, domAudit } from "./domAudit";
import { sceneOf } from "./scene";
import "../tokens.css";

// why: epic question 14 — a dev page for the QA browser checks (S19); never exported or bundled.
// Its labels are dev text after the mockup, not product text: EPIC-004 gives the real strings (P4-1)
const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
  tipGroup: (count, typeLabel) =>
    `${count} × ${typeLabel} · double-click to expand`,
  tipOpened: (sub) => `${sub} · expanded · double-click to collapse`,
  tipMore: (sub, more) =>
    `${sub} · ${more} more connection${more === 1 ? "" : "s"} · double-click to show`,
  tipMember: (sub) => `${sub} · double-click to collapse`,
  tipEdge: (subject, object) => `${subject} → ${object}`,
  tipEdgeAction: (label, muted, count) =>
    `${label}${muted ? " (filtered out)" : ""}${count > 1 ? ` · ${count} links` : ""} · click to select`,
};
const LAYOUTS: LayoutName[] = [
  "force",
  "atomic",
  "bubbles",
  "tree-h",
  "tree-v",
];
const NOW = "2026-10-19";
const CANVAS = canvasColor("#F4F4F5") as Hex;
// why: STORY-003-04 S15 — a built scene above the big-mode limit of 1,200 nodes; no fixture under
// the caps draws that many nodes
const BUILT = "built-1500";
const BUILT_COUNT = 1500;

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const fixturePick = byId<HTMLSelectElement>("fixture");
const layoutPick = byId<HTMLSelectElement>("layout");
const container = byId<HTMLDivElement>("canvas");
const report = byId<HTMLPreElement>("report");
const filters = byId<HTMLDivElement>("filters");
const log = byId<HTMLPreElement>("intents");
const zoom = byId<HTMLSpanElement>("zoom");

type Drawn = {
  graph: Graph;
  vocab: Vocab;
  state: CanvasState;
  renderer: Renderer;
  scene: Scene | null;
};
let drawn: Drawn | null = null;

function option(select: HTMLSelectElement, value: string): void {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = value;
  select.appendChild(item);
}

const note = (line: string) => {
  log.textContent = `${line}\n${log.textContent ?? ""}`;
};

// why: S15 — the zoom readout after each settle, and the reports (`zero-size`, `ended`) in the log
function rendererIn(): Renderer {
  const renderer = createRenderer(container, { text: TEXT });
  renderer.onSettle((c) => {
    zoom.textContent = `k ${c.k.toFixed(3)}`;
  });
  renderer.onReport((r) => note(`report ${r.kind}`));
  return renderer;
}

function redraw(d: Drawn, anchor: DrawnId | null = null): void {
  const view = frontier(d.state, d.graph, d.vocab);
  d.scene = sceneOf(
    { state: d.state, frontier: view, vocab: d.vocab, canvas: CANVAS },
    TEXT,
  );
  d.renderer.draw(d.scene, { anchor });
  const { node, edge } = d.scene.selection;
  const picked = edge === null ? "" : `, edge ${edge}`;
  report.textContent =
    `${fixturePick.value}: ${view.nodes.length} nodes, ${view.edges.length} edges, ` +
    `${d.state.layout}; selection: ${node ?? "none"}${picked}`;
}

function act(action: Action): void {
  if (drawn === null) return;
  drawn.state = transition(drawn.state, action, drawn.graph, drawn.vocab);
  redraw(drawn);
}

// why: S15 — a group expand or an explore through the engine `place`, drawn with its anchor, so the
// camera keeps the clicked node at its screen point (TL-4)
function expand(d: Drawn, node: SceneNode): void {
  const action: Action =
    node.kind === "group"
      ? { kind: "expandGroup", group: node.id }
      : { kind: "explore", id: node.id.slice(2) };
  const next = transition(d.state, action, d.graph, d.vocab);
  const before = frontier(d.state, d.graph, d.vocab);
  const after = frontier(next, d.graph, d.vocab);
  d.state = place(next, { action, before, after }, d.vocab, iconMetrics).state;
  redraw(d, node.id);
}

// why: STORY-003-03 T5 — the controller of STORY-003-05 routes the intents; the harness applies the
// two selection intents, a group expand and an explore, and only logs the other activations
function onIntent(intent: Intent): void {
  note(JSON.stringify(intent));
  if (intent.kind !== "activate") return act(intent);
  const node = drawn?.scene?.nodes.find((n) => n.id === intent.node);
  if (drawn === null || node === undefined) return;
  if (node.kind === "group" || node.more > 0) expand(drawn, node);
}

function toggle(name: string, on: boolean, change: (on: boolean) => void) {
  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = on;
  box.addEventListener("change", () => change(box.checked));
  label.append(box, name);
  filters.appendChild(label);
}

function filterPanel(d: Drawn): void {
  filters.replaceChildren();
  const off = d.state.filters;
  for (const { key } of d.vocab.families)
    toggle(key, !off.familiesOff.includes(key), (on) =>
      act({ kind: "toggleFamily", family: key, on }),
    );
  for (const key of [...d.vocab.predicates.keys()].sort())
    toggle(key, !off.predicatesOff.includes(key), (on) =>
      act({ kind: "togglePredicate", predicate: key, on }),
    );
}

function builtNode(i: number): SceneNode {
  // why: a sunflower spiral spreads the nodes evenly with no layout run
  const angle = i * 2.399963;
  const radius = 30 * Math.sqrt(i);
  const { w, h, tier } = iconMetrics.table;
  return {
    id: `built:${i}`,
    kind: "entity",
    type: "table",
    label: `node ${i}`,
    fullLabel: `node ${i}`,
    typeLabel: "Table",
    sub: "Table",
    visual: { icon: "table" },
    colour: "#864627" as Hex,
    w,
    h,
    r: Math.max(w, h) / 2,
    tier,
    count: 0,
    more: 0,
    opened: 0,
    group: null,
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle),
  };
}

function loadBuilt(): void {
  const nodes = Array.from({ length: BUILT_COUNT }, (_, i) => builtNode(i));
  const edges = nodes.slice(1).map((n, i) => ({
    key: `built:${i}|${i + 1}`,
    subject: nodes[i].id,
    object: n.id,
    label: "next",
    colour: "#2e9d6a" as Hex,
    muted: false,
    structure: false,
    dashed: false,
    count: 1,
  }));
  filters.replaceChildren();
  rendererIn().draw({
    nodes,
    edges,
    selection: { node: null, edge: null },
    layout: "force",
  });
  report.textContent = `${BUILT}: ${nodes.length} nodes, ${edges.length} edges`;
}

function load(key: string, layout: LayoutName | null): void {
  drawn = null;
  log.textContent = "";
  if (key === BUILT) return loadBuilt();
  const result = normalize(loadFixture(key).input, { now: NOW });
  if (!result.ok) {
    container.replaceChildren();
    filters.replaceChildren();
    report.textContent = `fatal: ${result.fatal.code}`;
    return;
  }
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, CANVAS);
  const first = firstView(graph, vocab, payload, hash);
  const name = layout ?? first.layout;
  layoutPick.value = name;
  const state = setLayout(
    first,
    frontier(first, graph, vocab),
    vocab,
    name,
    iconMetrics,
  );
  const renderer = rendererIn();
  renderer.onIntent(onIntent);
  drawn = { graph, vocab, state, renderer, scene: null };
  filterPanel(drawn);
  redraw(drawn);
}

function audit(): void {
  const root = container.firstElementChild;
  if (drawn?.scene == null || root === null) return;
  const strings = auditStrings(drawn.graph, drawn.vocab, drawn.scene);
  const findings = domAudit(root, strings, TEXT.canvasName);
  report.textContent =
    findings.length === 0 ? "domAudit: no finding" : findings.join("\n");
}

for (const key of Object.keys(fixtures).sort()) option(fixturePick, key);
option(fixturePick, BUILT);
for (const name of LAYOUTS) option(layoutPick, name);
fixturePick.addEventListener("change", () => load(fixturePick.value, null));
layoutPick.addEventListener("change", () =>
  load(fixturePick.value, layoutPick.value as LayoutName),
);
byId<HTMLButtonElement>("audit").addEventListener("click", audit);
byId<HTMLButtonElement>("clear").addEventListener("click", () =>
  act({ kind: "select", node: null }),
);
byId<HTMLButtonElement>("fit").addEventListener("click", () =>
  drawn?.renderer.fit(),
);
// why: S15, owner decision H8 — the root leaves the page, so the renderer ends itself
byId<HTMLButtonElement>("remove").addEventListener("click", () => {
  drawn = null;
  container.replaceChildren();
});
load(fixturePick.value, null);
