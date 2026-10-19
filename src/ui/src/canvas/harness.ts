import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  firstView,
  frontier,
  normalize,
  resolveVocab,
  setLayout,
  type Graph,
  type Hex,
  type LayoutName,
  type Vocab,
} from "@qdic-topology/engine";
import { fixtures, loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type Scene,
} from "@qdic-topology/renderer";
import { auditStrings, domAudit } from "./domAudit";
import { sceneOf } from "./scene";

// why: epic question 14 — a dev page for the QA browser checks (S19); never exported or bundled.
// Its labels are dev text, not product text: EPIC-004 gives the real strings (P4-1)
const TEXT: RendererText = {
  groupLabel: (typeLabel, count) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
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

type Drawn = { graph: Graph; vocab: Vocab; scene: Scene };
let drawn: Drawn | null = null;

function option(select: HTMLSelectElement, value: string): void {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = value;
  select.appendChild(item);
}

function draw(key: string, layout: LayoutName | null): void {
  drawn = null;
  const result = normalize(loadFixture(key).input, { now: NOW });
  if (!result.ok) {
    container.replaceChildren();
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
  const view = frontier(state, graph, vocab);
  const scene = sceneOf({ state, frontier: view, vocab, canvas: CANVAS }, TEXT);
  createRenderer(container, { text: TEXT }).draw(scene);
  drawn = { graph, vocab, scene };
  report.textContent = `${key}: ${scene.nodes.length} nodes, ${name}`;
}

function audit(): void {
  const root = container.firstElementChild;
  if (drawn === null || root === null) return;
  const strings = auditStrings(drawn.graph, drawn.vocab, drawn.scene);
  const findings = domAudit(root, strings, TEXT.canvasName);
  report.textContent =
    findings.length === 0 ? "domAudit: no finding" : findings.join("\n");
}

for (const key of Object.keys(fixtures).sort()) option(fixturePick, key);
for (const name of LAYOUTS) option(layoutPick, name);
fixturePick.addEventListener("change", () => draw(fixturePick.value, null));
layoutPick.addEventListener("change", () =>
  draw(fixturePick.value, layoutPick.value as LayoutName),
);
byId<HTMLButtonElement>("audit").addEventListener("click", audit);
draw(fixturePick.value, null);
