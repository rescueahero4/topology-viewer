import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  normalize,
  resolveVocab,
  type Budget,
  type Hex,
  type LayoutName,
} from "@qdic-topology/engine";
import { fixtures, generate, loadFixture } from "@qdic-topology/fixtures";
import {
  createRenderer,
  iconMetrics,
  type RendererText,
  type SceneNode,
} from "@qdic-topology/renderer";
import { auditStrings, domAudit } from "./domAudit";
import { measure } from "./harness-timing";
import {
  createCanvas,
  type Canvas,
  type CanvasEvent,
  type CanvasModel,
} from "./index";
import { sceneOf } from "./scene";
import "../tokens.css";

// why: epic question 14 — a dev page for the QA browser checks (S27, S29); never exported or
// bundled. Its labels are dev text after the mockup, not product text: EPIC-004 gives them (P4-1)
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
const NOW = "2026-10-19";
const COLOURS: Record<string, Hex> = {
  light: canvasColor("#F4F4F5") as Hex,
  dark: canvasColor("#18181b") as Hex,
};
const LAYOUTS = ["force", "atomic", "bubbles", "tree-h", "tree-v"];
const BUDGETS = ["10", "20", "50", "all"];
// why: STORY-003-04 S15 — a built scene above the big-mode limit of 1,200 nodes; no fixture under
// the caps draws that many nodes
const BUILT = "built-1500";

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const pick = (id: string) => byId<HTMLSelectElement>(id);
const container = byId<HTMLDivElement>("canvas");
const report = byId<HTMLPreElement>("report");
const log = byId<HTMLPreElement>("events");
const zoom = byId<HTMLSpanElement>("zoom");
const target = byId<HTMLInputElement>("target");

type Open = {
  model: CanvasModel;
  canvas: Canvas;
  last: CanvasEvent["settle"] | null;
};
let open: Open | null = null;
const counts = new Map<string, number>();

function options(select: HTMLSelectElement, values: string[]): void {
  for (const value of values) {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = value;
    select.appendChild(item);
  }
}

// why: Security notes "Harness" — the log shows event names and counts by `textContent`, no JSON
// of the payload, the state or the frontier
function count(name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1);
  log.textContent = [...counts].map(([k, n]) => `${k} ${n}`).join("\n");
}

function show(o: Open): void {
  const e = o.last;
  if (e === null) return;
  zoom.textContent = `k ${e.camera.k.toFixed(3)}`;
  const s = e.state.selection;
  const picked =
    s === null ? "none" : "edge" in s ? `edge, anchor ${s.anchor}` : s.node;
  report.textContent =
    `${pick("fixture").value}: ${e.frontier.nodes.length} nodes, ${e.frontier.edges.length} edges, ` +
    `${e.state.layout}, budget ${e.state.budget}, hidden ${e.state.hidden.length}; selection: ${picked}`;
}

function modelOf(input: unknown, canvas: Hex): CanvasModel | null {
  const r = normalize(input, { now: NOW });
  if (!r.ok) {
    report.textContent = `fatal: ${r.fatal.code}`;
    return null;
  }
  const { vocab } = resolveVocab(r.graph, r.payload, profile, canvas);
  return { graph: r.graph, payload: r.payload, hash: r.hash, vocab, canvas };
}

// why: H8 — new data, a canvas colour switch and Undo are each a new canvas; the old one ends
function start(model: CanvasModel, keep: Open | null = null): void {
  const canvas = createCanvas(container, {
    text: TEXT,
    model,
    state: keep?.last?.state,
    camera: keep?.last?.camera,
  });
  const o: Open = { model, canvas, last: null };
  open = o;
  canvas.on("settle", (e) => {
    o.last = e;
    count("settle");
    show(o);
  });
  canvas.on("select", () => count("select"));
  canvas.on("explore", () => count("explore"));
  canvas.on("notice", (e) => count(`notice ${e.kind}`));
}

function load(): void {
  counts.clear();
  log.textContent = "";
  const key = pick("fixture").value;
  if (key === BUILT) return loadBuilt();
  const model = modelOf(loadFixture(key).input, COLOURS[pick("colour").value]);
  if (model === null) container.replaceChildren();
  else start(model);
}

function builtNode(i: number): SceneNode {
  // why: a sunflower spiral spreads the nodes evenly with no layout run
  const angle = i * 2.399963;
  const radius = 30 * Math.sqrt(i);
  const { w, h, tier } = iconMetrics.table;
  const label = `node ${i}`;
  return {
    id: `built:${i}`,
    kind: "entity",
    type: "table",
    label,
    fullLabel: label,
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
  open = null;
  const nodes = Array.from({ length: 1500 }, (_, i) => builtNode(i));
  const renderer = createRenderer(container, { text: TEXT });
  renderer.onSettle((c) => (zoom.textContent = `k ${c.k.toFixed(3)}`));
  renderer.draw({
    nodes,
    edges: [],
    selection: { node: null, edge: null },
    layout: "force",
  });
  report.textContent = `${BUILT}: ${nodes.length} nodes`;
}

function audit(o: Open): void {
  const root = container.firstElementChild;
  if (o.last === null || root === null) return;
  const { state, frontier } = o.last;
  const { vocab, canvas, graph } = o.model;
  const scene = sceneOf({ state, frontier, vocab, canvas }, TEXT);
  const findings = domAudit(
    root,
    auditStrings(graph, vocab, scene),
    TEXT.canvasName,
  );
  report.textContent =
    findings.length === 0 ? "domAudit: no finding" : findings.join("\n");
}

const selected = (o: Open) => {
  const s = o.last?.state.selection ?? null;
  return s === null ? null : "edge" in s ? s.anchor : s.node;
};
const ids = () => target.value.split(/\s+/).filter((id) => id !== "");

// why: one control per SA §4.5 method; each acts on the open canvas
const ACTIONS: Record<string, (o: Open) => void> = {
  setdata: (o) => {
    if (o.last !== null) o.canvas.setData(o.last.frontier);
  },
  clear: (o) => o.canvas.select(null),
  expand: (o) => o.canvas.expand(selected(o) ?? ""),
  collapse: (o) => o.canvas.collapse(selected(o) ?? ""),
  hide: (o) => o.canvas.hide([selected(o) ?? ""]),
  restore: (o) =>
    o.canvas.restore(o.last?.state.hidden.map((h) => h.key) ?? []),
  focus: (o) => o.canvas.focus(ids()[0] ?? ""),
  reveal: (o) => o.canvas.reveal(ids()),
  oncanvas: (o) => {
    report.textContent = `onCanvas: ${o.canvas.onCanvas(ids()[0] ?? "")}`;
  },
  reset: (o) => o.canvas.resetView(),
  showall: (o) => o.canvas.setFilters({ kind: "showAllTypes" }),
  fit: (o) => o.canvas.fit(),
  audit,
};

for (const [id, act] of Object.entries(ACTIONS))
  byId<HTMLButtonElement>(id).addEventListener(
    "click",
    () => open !== null && act(open),
  );

options(pick("fixture"), [...Object.keys(fixtures).sort(), BUILT]);
options(pick("layout"), LAYOUTS);
options(pick("colour"), Object.keys(COLOURS));
options(pick("budget"), BUDGETS);
options(pick("approach"), ["active", "passive"]);
pick("fixture").addEventListener("change", load);
pick("layout").addEventListener("change", () =>
  open?.canvas.setLayout(pick("layout").value as LayoutName),
);
pick("budget").addEventListener("change", () => {
  const v = pick("budget").value;
  open?.canvas.setBudget((v === "all" ? v : Number(v)) as Budget);
});
pick("approach").addEventListener("change", () =>
  open?.canvas.setApproach(pick("approach").value as "active" | "passive"),
);
// why: S27, NF-9 — a new canvas for the new canvas colour with the state and camera of the last settle
pick("colour").addEventListener("change", () => {
  const was = open;
  if (was === null) return;
  const key = pick("fixture").value;
  const model = modelOf(loadFixture(key).input, COLOURS[pick("colour").value]);
  if (model !== null) start(model, was);
});
// why: STORY-003-04 S15, owner decision H8 — the root leaves the page, so the canvas ends itself
byId<HTMLButtonElement>("remove").addEventListener("click", () => {
  open = null;
  container.replaceChildren();
});
byId<HTMLButtonElement>("timing").addEventListener("click", () => {
  const out = byId<HTMLPreElement>("timings");
  out.textContent = "";
  const big = (n: number, e: number, layout: object = {}) =>
    modelOf(
      { ...generate.random(n, e, 1), view: { budget: "all", ...layout } },
      COLOURS.light,
    );
  const models = {
    force: big(500, 1000),
    atomic: big(500, 1000, { layout: "atomic" }),
    big: big(2000, 4000),
  };
  if (models.force === null || models.atomic === null || models.big === null)
    return;
  void measure(
    container,
    TEXT,
    { force: models.force, atomic: models.atomic, big: models.big },
    (line) => {
      out.textContent = `${out.textContent ?? ""}${line}\n`;
    },
  );
});
load();
