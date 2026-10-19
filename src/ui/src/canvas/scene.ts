import {
  canvasColor,
  entitySlots,
  guardColor,
  type CanvasState,
  type Designed,
  type DrawnId,
  type DrawnNode,
  type Frontier,
  type Hex,
  type Point,
  type Rgb,
  type Tier,
  type Vocab,
} from "@qdic-topology/engine";
import {
  iconMetrics,
  spriteColours,
  type RendererText,
  type Scene,
  type SceneNode,
} from "@qdic-topology/renderer";

export type SceneInput = {
  state: CanvasState;
  frontier: Frontier;
  vocab: Vocab;
  canvas: Hex;
};

type Box = { w: number; h: number; tier: Tier | "node" };
type Visual = SceneNode["visual"];

// why: mockup `opts.labelChars` (lib/topology.js line 424), the engine `LABEL_CHARS` of
// `layout/drawn.ts:37`; STORY-003-08 replaces the end cut with the middle truncation
const LABEL_CHARS = 22;
// why: mockup `iconFor` fallback (lib/topology.js line 306), the engine `boxOf` rank-0 box
const RANK_ZERO: Box = { w: 20, h: 20, tier: "leaf" };
// why: epic question 10 — the grey of Other and Custom, guarded like every canvas colour
const NO_MARK_GREY = canvasColor("#71717a");
// why: epic question 12, TL-9 — the subtitle reads only this slot entry
const SERVICE_SLOT = "data_source";
const SERVICE_FROM = "attribute service_name";
const HEX_CHANNELS = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/;

function rgbOf(hex: Hex | null | undefined): Rgb {
  const match = HEX_CHANNELS.exec(hex ?? "");
  if (match === null) throw new Error("sceneOf: a colour is not #rrggbb");
  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
}

// why: mockup `truncate` (lib/topology.js line 322) in UTF-16 units; a cut never leaves a lone
// high surrogate. "…" is a symbol, not UI text
function cut(label: string): string {
  if (label.length <= LABEL_CHARS) return label;
  const high = label.charCodeAt(LABEL_CHARS - 2);
  const end =
    high >= 0xd800 && high <= 0xdbff ? LABEL_CHARS - 2 : LABEL_CHARS - 1;
  return `${label.slice(0, end)}…`;
}

// why: the scene holds copies, so it keeps no reference into `vocab`
function visualOf(type: string | null, vocab: Vocab): Visual {
  const visual = type === null ? vocab.untyped : vocab.types.get(type)?.visual;
  if (visual === undefined || visual === null) return null;
  if (!("icon" in visual)) return { ...visual };
  // why: TL-7, gap G2, ISSUE-009 — an icon key with no sprite icon (`custom_category`) is drawn
  // as the outline circle until the engine gives that type a designed visual
  return Object.hasOwn(iconMetrics, visual.icon) ? { icon: visual.icon } : null;
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
  if (visual === null) return guardColor(rgbOf(NO_MARK_GREY), canvas);
  if ("icon" in visual)
    return guardColor(rgbOf(spriteColours.get(visual.icon)), canvas);
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
  input: SceneInput,
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
    label: cut(fullLabel),
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
    x: at.x,
    y: at.y,
  };
}

// why: SA §4.5 — the controller makes the scene from engine results; the scene keeps no
// reference to `vocab` or `state`
export function sceneOf(input: SceneInput, text: RendererText): Scene {
  const positions = new Map<DrawnId, Point>(input.state.positions);
  return {
    nodes: input.frontier.nodes.map((node) => {
      const at = positions.get(node.id);
      // why: SA §4.5, §5 — the engine commits positions before the first frame
      if (at === undefined)
        throw new Error("sceneOf: a drawn node has no position");
      return nodeOf(node, at, input, text);
    }),
  };
}
