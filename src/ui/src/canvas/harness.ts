import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  firstView,
  frontier,
  normalize,
  resolveVocab,
  setLayout,
  transition,
  type Action,
  type CanvasState,
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

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const fixturePick = byId<HTMLSelectElement>("fixture");
const layoutPick = byId<HTMLSelectElement>("layout");
const container = byId<HTMLDivElement>("canvas");
const report = byId<HTMLPreElement>("report");
const filters = byId<HTMLDivElement>("filters");
const log = byId<HTMLPreElement>("intents");

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

function redraw(d: Drawn): void {
  const view = frontier(d.state, d.graph, d.vocab);
  d.scene = sceneOf(
    { state: d.state, frontier: view, vocab: d.vocab, canvas: CANVAS },
    TEXT,
  );
  d.renderer.draw(d.scene);
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

// why: STORY-003-03 T5 — the controller of STORY-003-05 routes the intents; the harness applies
// the two selection intents and only logs `activate`
function onIntent(intent: Intent): void {
  log.textContent = `${JSON.stringify(intent)}\n${log.textContent ?? ""}`;
  if (intent.kind !== "activate") act(intent);
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

function load(key: string, layout: LayoutName | null): void {
  drawn = null;
  log.textContent = "";
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
  const renderer = createRenderer(container, { text: TEXT });
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
for (const name of LAYOUTS) option(layoutPick, name);
fixturePick.addEventListener("change", () => load(fixturePick.value, null));
layoutPick.addEventListener("change", () =>
  load(fixturePick.value, layoutPick.value as LayoutName),
);
byId<HTMLButtonElement>("audit").addEventListener("click", audit);
byId<HTMLButtonElement>("clear").addEventListener("click", () =>
  act({ kind: "select", node: null }),
);
load(fixturePick.value, null);
