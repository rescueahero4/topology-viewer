import {
  entityOfDrawnId,
  setCustomLayouts,
  type DrawnId,
  type LayoutRun,
} from "#engine";
import {
  iconMetrics,
  setRenderHooks,
  type Scene,
  type SceneEdge,
  type SceneNode,
} from "#renderer";
import { commands, nodeData } from "./commands";
import {
  custom,
  peekOption,
  type CustomLayout,
  type PartConfig,
  type PartStyle,
} from "./custom";
import { markPart } from "./partDom";
import { newSlotName, publishSlot, removeSlot } from "./Part";

// The way from the `node`, `edge` and `tooltip` parts to the renderer. The canvas is SVG that D3
// draws, so a custom node is a `<foreignObject>` with a native `<slot>`: the React component of the
// developer lives outside the Shadow DOM and shows inside the transformed node group, so it moves,
// zooms and fades with the node, and a press on it selects the node.

const configOf = (id: string): PartConfig | undefined => {
  const { parts } = custom.peek();
  return Object.hasOwn(parts, id) ? parts[id] : undefined;
};

type NodeOption = {
  width?: number;
  height?: number;
  labels?: boolean;
};

function publicOf(node: SceneNode) {
  const id = entityOfDrawnId(node.id);
  const data = id === null ? null : nodeData(id);
  return {
    id: id ?? node.id,
    kind: node.kind === "group" ? ("group" as const) : ("node" as const),
    label: node.fullLabel,
    type: node.type,
    typeLabel: node.typeLabel,
    attrs: data?.attrs ?? {},
    count: node.count,
    more: node.more,
    faded: node.faded,
    width: node.w,
    height: node.h,
  };
}

const nodeSlots = new Map<DrawnId, string>();

function nodeSlot(node: SceneNode) {
  const config = configOf("node");
  if (config?.render === undefined) return null;
  const data = publicOf(node);
  if (config.match !== undefined && !config.match({ node: data })) return null;
  if (config.match === undefined && node.kind === "group") return null;
  let name = nodeSlots.get(node.id);
  if (name === undefined) {
    name = newSlotName();
    nodeSlots.set(node.id, name);
  }
  return {
    name,
    labels: peekOption<NodeOption["labels"]>("node", "labels") === true,
  };
}

function nodeGone(id: DrawnId): void {
  const name = nodeSlots.get(id);
  if (name === undefined) return;
  nodeSlots.delete(id);
  removeSlot(name);
}

export function releaseNodeSlots(): void {
  for (const name of nodeSlots.values()) removeSlot(name);
  nodeSlots.clear();
}

let tipSlotName: string | null = null;

function tip(info: Parameters<NonNullable<Parameters<typeof setRenderHooks>[0]["tip"]>>[0]) {
  const config = configOf("tooltip");
  if (config === undefined) return null;
  if (config.hidden === true) return false;
  if (config.render === undefined) return null;
  tipSlotName ??= newSlotName();
  const ctx =
    info.kind === "node"
      ? { kind: "node", node: publicOf(info.node) }
      : {
          kind: "edge",
          edge: publicEdge(info.edge),
          subject: publicOf(info.subject),
          object: publicOf(info.object),
        };
  publishSlot({
    name: tipSlotName,
    part: "tooltip",
    place: "render",
    ctx: { ...ctx, commands },
  });
  return tipSlotName;
}

function publicEdge(edge: SceneEdge) {
  return {
    key: edge.key,
    subject: entityOfDrawnId(edge.subject) ?? edge.subject,
    object: entityOfDrawnId(edge.object) ?? edge.object,
    label: edge.label,
    muted: edge.muted,
    retired: edge.retired,
    dashed: edge.dashed,
    count: edge.count,
  };
}

function setStyle(el: SVGElement, style: PartStyle | undefined): void {
  if (style === undefined) return;
  for (const [name, value] of Object.entries(style)) {
    if (value === undefined) continue;
    const css = name.startsWith("--")
      ? name
      : name.replace(/[A-Z]/g, (one) => `-${one.toLowerCase()}`);
    el.style.setProperty(css, String(value));
  }
}

function dress(el: SVGElement, config: PartConfig | undefined, data: unknown) {
  if (config === undefined) return;
  const given = config.style as
    | PartStyle
    | ((data: unknown) => PartStyle | undefined)
    | undefined;
  setStyle(el, typeof given === "function" ? given(data) : given);
  const name = config.className as
    | string
    | ((data: unknown) => string | undefined)
    | undefined;
  const extra = typeof name === "function" ? name(data) : name;
  if (extra !== undefined && extra !== "")
    for (const one of extra.split(/\s+/)) el.classList.add(one);
}

const datum = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;

function afterPaint(
  root: HTMLElement,
  layers: { svg: SVGSVGElement; nodes: SVGGElement; edges: SVGGElement },
  scene: Scene,
): void {
  markPart(root, "canvas-root");
  if (root.parentElement !== null) markPart(root.parentElement, "canvas-layer");
  markPart(layers.svg, "canvas-svg");
  const nodeConfig = configOf("node");
  const edgeConfig = configOf("edge");
  for (const el of layers.nodes.querySelectorAll<SVGGElement>("g.qt-node")) {
    const node = datum<SceneNode>(el);
    const selected = scene.selection.node === node.id;
    markPart(
      el,
      [
        "node",
        node.kind === "group" ? "node-group" : "",
        selected ? "selected" : "",
        node.faded ? "faded" : "",
      ]
        .filter((one) => one !== "")
        .join(" "),
    );
    const slot = nodeSlots.get(node.id);
    const reads =
      slot !== undefined ||
      typeof nodeConfig?.style === "function" ||
      typeof nodeConfig?.className === "function";
    const data = reads ? { ...publicOf(node), selected } : null;
    dress(el, nodeConfig, data);
    for (const text of el.querySelectorAll("text.qt-name"))
      markPart(text, "node-label");
    for (const text of el.querySelectorAll("text.qt-sub"))
      markPart(text, "node-sublabel");
    if (slot !== undefined)
      publishSlot({
        name: slot,
        part: "node",
        place: "render",
        ctx: { node: data, selected, commands },
      });
  }
  for (const el of layers.edges.querySelectorAll<SVGPathElement>("path.qt-edge")) {
    const edge = datum<SceneEdge>(el);
    const picked = scene.selection.edge === edge.key;
    markPart(el, picked ? "edge selected" : "edge");
    dress(el, edgeConfig, { ...publicEdge(edge), selected: picked });
  }
}

/** The fixed size of the custom nodes of each type, which the layout and the drawing both read. */
function syncSizes(): void {
  const sizes = peekOption<
    Readonly<Record<string, { width: number; height: number }>>
  >("node", "sizes");
  for (const [type, size] of Object.entries(sizes ?? {}))
    iconMetrics[type] = { w: size.width, h: size.height, tier: "asset" };
}

function syncLayouts(given: Readonly<Record<string, CustomLayout>> | undefined) {
  const runs = new Map<string, LayoutRun>();
  for (const [name, layout] of Object.entries(given ?? {}))
    runs.set(`custom:${name}`, ({ nodes, edges }) => {
      const ids = new Map(
        nodes.map((node) => [entityOfDrawnId(node.id) ?? node.id, node.id]),
      );
      const placed = layout.run({
        nodes: nodes.map((node) => ({
          id: entityOfDrawnId(node.id) ?? node.id,
          type: node.type,
          label: node.label,
          width: node.w,
          height: node.h,
        })),
        edges: edges.map((edge) => ({
          source: entityOfDrawnId(edge.subject) ?? edge.subject,
          target: entityOfDrawnId(edge.object) ?? edge.object,
          predicate: edge.predicate,
        })),
      });
      const out = new Map<string, { x: number; y: number }>();
      for (const [id, at] of Object.entries(placed)) {
        const drawn = ids.get(id);
        if (drawn !== undefined && Number.isFinite(at.x) && Number.isFinite(at.y))
          out.set(drawn, { x: at.x, y: at.y });
      }
      return out;
    });
  setCustomLayouts(runs);
}

let installed = false;

/** Called by the public core with each new customization. */
export function syncCanvasCustom(): void {
  syncSizes();
  syncLayouts(custom.peek().layouts);
  if (installed) return;
  installed = true;
  setRenderHooks({ nodeSlot, nodeGone, tip, afterPaint });
}
