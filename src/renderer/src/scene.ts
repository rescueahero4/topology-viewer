import type { Designed, DrawnId, Hex, Tier } from "@qdic-topology/engine";

export type SceneVisual = { icon: string } | Designed | null;

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
  x: number;
  y: number;
};

export type Scene = { nodes: SceneNode[] };
