import type {
  Designed,
  DrawnId,
  EdgeKey,
  Hex,
  LayoutName,
  Tier,
} from "@qdic-topology/engine";

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
  structure: boolean;
  dashed: boolean;
  count: number;
};

export type SceneSelection = { node: DrawnId | null; edge: EdgeKey | null };

export type Scene = {
  nodes: SceneNode[];
  edges: SceneEdge[];
  selection: SceneSelection;
  layout: LayoutName;
};
