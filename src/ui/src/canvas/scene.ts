import {
  entitySlots,
  fadeSet,
  type CanvasState,
  type Designed,
  type DrawnEdge,
  type DrawnId,
  type DrawnNode,
  type Frontier,
  type Hex,
  type IconMetrics,
  type Point,
  type Selection,
  type Tier,
  type Vocab,
} from "@qdic-topology/engine";
import {
  iconMetrics,
  spriteColours,
  type RendererText,
  type Scene,
  type SceneEdge,
  type SceneNode,
} from "@qdic-topology/renderer";
import { edgeStyles, guarded, type EdgeStyle } from "./edgeColours";
import { middleCut } from "./labels";
import { roomsOf, typesOf } from "./sceneBubbles";

export type SceneInput = {
  state: CanvasState;
  frontier: Frontier;
  vocab: Vocab;
  canvas: Hex;
};

type Box = { w: number; h: number; tier: Tier | "node" };
type Visual = SceneNode["visual"];

// why: mockup `iconFor` fallback (lib/topology.js line 306), the engine `boxOf` rank-0 box
const RANK_ZERO: Box = { w: 20, h: 20, tier: "leaf" };
// why: epic question 12, TL-9 — the subtitle reads only this slot entry
const SERVICE_SLOT = "data_source";
const SERVICE_FROM = "attribute service_name";

// why: the scene holds copies, so it keeps no reference into `vocab`
function visualOf(type: string | null, vocab: Vocab): Visual {
  const visual = type === null ? vocab.untyped : vocab.types.get(type)?.visual;
  if (visual === undefined || visual === null)
    throw new Error("sceneOf: a drawn type has no visual");
  return "icon" in visual ? { icon: visual.icon } : { ...visual };
}

// why: equal to the engine `boxOf` (`layout/drawn.ts:43-58`), so the drawing equals the layout
function boxOf(type: string | null, vocab: Vocab): Box {
  if (type === null) return RANK_ZERO;
  if (Object.hasOwn(iconMetrics, type)) return iconMetrics[type];
  const visual = vocab.types.get(type)?.visual;
  if (visual === undefined || "icon" in visual) return RANK_ZERO;
  return {
    w: visual.size,
    h: visual.size,
    tier: visual.rank === 0 ? "leaf" : "node",
  };
}

// why: hand-off item 3 — every canvas colour goes through `guardColor`; a designed colour is
// already guarded by `resolveVocab` against the same canvas
function colourOf(visual: Visual, canvas: Hex): Hex {
  if ("icon" in visual) return guarded(spriteColours.get(visual.icon), canvas);
  return (visual satisfies Designed).color;
}

// why: epic question 12, TL-9 — the first `service_name` entry of the `data_source` slot, its
// first UTF-16 unit in upper case; " · " is a separator symbol, not UI text
function subOf(vocab: Vocab, entity: string, typeLabel: string): string {
  const slot = entitySlots(vocab, entity)?.slots.find(
    (s) => s.slot === SERVICE_SLOT,
  );
  const entry = slot?.entries.find((e) => e.from === SERVICE_FROM);
  const service = entry === undefined ? "" : String(entry.value);
  if (service === "") return typeLabel;
  return `${service.charAt(0).toUpperCase()}${service.slice(1)} · ${typeLabel}`;
}

function typeLabelOf(type: string | null, vocab: Vocab, text: RendererText) {
  if (type === null) return text.unknownType;
  const resolved = vocab.types.get(type);
  if (resolved === undefined)
    throw new Error("sceneOf: a type is not in vocab");
  return resolved.label;
}

function nodeOf(
  node: DrawnNode,
  at: Point,
  input: SceneInput & {
    faded: ReadonlySet<DrawnId>;
    rooms: ReadonlyMap<DrawnId, number>;
  },
  text: RendererText,
): SceneNode {
  const { vocab, canvas } = input;
  const typeLabel = typeLabelOf(node.type, vocab, text);
  const visual = visualOf(node.type, vocab);
  const box = boxOf(node.type, vocab);
  const group = "members" in node;
  const fullLabel = group ? text.groupLabel(typeLabel, node.count) : node.label;
  return {
    id: node.id,
    kind: group ? "group" : "entity",
    type: node.type,
    // why: TL-13 — every node name takes the cut, a group label too (mockup line 999)
    label: middleCut(fullLabel),
    fullLabel,
    typeLabel,
    sub: group ? text.collapsed : subOf(vocab, node.entity, typeLabel),
    visual,
    colour: colourOf(visual, canvas),
    w: box.w,
    h: box.h,
    r: Math.max(box.w, box.h) / 2,
    tier: box.tier,
    count: group ? node.count : 0,
    more: node.more,
    opened: node.opened,
    group: group ? null : node.group,
    // why: FR-QDIC-4, TL-14 — an entity with `is_lost: true`; a group node has no lost mark
    lost: !group && vocab.entities.get(node.entity)?.lost === true,
    faded: input.faded.has(node.id),
    room: input.rooms.get(node.id) ?? 0,
    x: at.x,
    y: at.y,
  };
}

function edgeOf(
  edge: DrawnEdge,
  vocab: Vocab,
  styles: ReadonlyMap<string, EdgeStyle>,
): SceneEdge {
  const predicate = vocab.predicates.get(edge.predicate);
  const style = styles.get(edge.predicate);
  if (predicate === undefined || style === undefined)
    throw new Error("sceneOf: a predicate is not in vocab");
  return {
    key: edge.key,
    subject: edge.subject,
    object: edge.object,
    label: predicate.label,
    ...style,
    muted: edge.muted,
    retired: edge.retired,
    // why: FR-QDIC-5, story question 1 — a group edge counts the links behind it
    count: edge.count,
  };
}

// why: SA §6 row 19 — an edge pick keeps its anchor as the selected node
function selectionOf(selection: Selection): Scene["selection"] {
  if (selection === null) return { node: null, edge: null };
  if ("edge" in selection)
    return { node: selection.anchor, edge: selection.edge };
  return { node: selection.node, edge: null };
}

// why: SA §4.5 — the controller makes the scene from engine results; the scene keeps no
// reference to `vocab` or `state`. The icon metrics are those of the canvas (`createCanvas`)
export function sceneOf(
  input: SceneInput,
  text: RendererText,
  metrics: IconMetrics = iconMetrics,
): Scene {
  const { state, frontier, vocab, canvas } = input;
  const positions = new Map<DrawnId, Point>(state.positions);
  const styles = edgeStyles(vocab, canvas);
  // why: FR-CANVAS-14, hand-off item 16 — the fade flags come from `fadeSet` only, never from
  // `around.shown`, and they join by the drawn id
  const faded = new Set(fadeSet(state, frontier).map((f) => f.id));
  const rooms = roomsOf(state.layout, frontier, vocab, metrics);
  const nodes = frontier.nodes.map((node) => {
    const at = positions.get(node.id);
    // why: SA §4.5, §5 — the engine commits positions before the first frame; Security round 2
    // item 2 — a saved state with a position that is not finite never reaches an attribute
    if (at === undefined || !Number.isFinite(at.x) || !Number.isFinite(at.y))
      throw new Error("sceneOf: a drawn node has no finite position");
    return nodeOf(node, at, { ...input, faded, rooms }, text);
  });
  return {
    nodes,
    edges: frontier.edges.map((edge) => edgeOf(edge, vocab, styles)),
    selection: selectionOf(state.selection),
    layout: state.layout,
    types: typesOf(state.layout, nodes),
  };
}
