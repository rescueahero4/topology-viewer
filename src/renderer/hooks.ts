import type { DrawnId } from "#engine";
import type { Layers } from "./layers";
import type { Scene, SceneEdge, SceneNode } from "./scene";

// What the customization of a developer adds to the drawing. It stays empty with no customization, so
// the renderer draws and audits as before.

export type TipInfo =
  | { kind: "node"; node: SceneNode }
  | { kind: "edge"; edge: SceneEdge; subject: SceneNode; object: SceneNode };

export type RenderHooks = {
  /** A custom node: the name of the slot that shows it, and whether its labels stay. */
  nodeSlot?: (node: SceneNode) => { name: string; labels: boolean } | null;
  nodeGone?: (id: DrawnId) => void;
  /** The slot of a custom tooltip, `false` for no tooltip, `null` for the default. */
  tip?: (info: TipInfo) => string | false | null;
  afterPaint?: (root: HTMLElement, layers: Layers, scene: Scene) => void;
};

export const renderHooks: RenderHooks = {};

export function setRenderHooks(next: RenderHooks): void {
  Object.assign(renderHooks, next);
}
