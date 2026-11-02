import type {
  Designed,
  DrawnId,
  EdgeKey,
  Hex,
  LayoutName,
  Tier,
} from "#engine";

export type SceneVisual = { icon: string } | Designed;

export type SceneNode = {
  id: DrawnId;
  kind: "entity" | "group";
  type: string | null;
  label: string;
  fullLabel: string;
  typeLabel: string;
  sub: string;
  visual: SceneVisual;
  colour: Hex;
  w: number;
  h: number;
  r: number;
  tier: Tier | "node";
  count: number;
  more: number;
  opened: number;
  group: DrawnId | null;
  // why: FR-CANVAS-14, epic hand-off item 16 — the controller sets it from the engine `fadeSet` only
  faded: boolean;
  // why: FR-QDIC-4, TL-14 — the controller sets it for an entity with `is_lost: true` only
  lost: boolean;
  // why: STORY-003-01 `bubbleRooms`, epic question 7 — the room of the node in its bubble; 0 when
  // the layout is not `bubbles`
  room: number;
  x: number;
  y: number;
};

export type SceneEdge = {
  key: EdgeKey;
  subject: DrawnId;
  object: DrawnId;
  label: string;
  colour: Hex;
  muted: boolean;
  // why: owner decision H5, FR-QDIC-5 — the engine `DrawnEdge.retired`
  retired: boolean;
  structure: boolean;
  dashed: boolean;
  count: number;
};

export type SceneSelection = { node: DrawnId | null; edge: EdgeKey | null };

// why: FR-CANVAS-15 — the label and the guarded colour of a type for its bubble
export type SceneType = { label: string; colour: Hex };

export type Scene = {
  nodes: SceneNode[];
  edges: SceneEdge[];
  selection: SceneSelection;
  layout: LayoutName;
  // why: FR-CANVAS-15 — in layout `bubbles` the types of the scene nodes in first-use order, else
  // empty; a type key is a `Map` key only
  types: [type: string | null, SceneType][];
};
