// why: epic question 13 (P4-1) — the user text of the canvas comes from the caller; EPIC-004 gives
// it from the string tables, so the renderer and the controller hold no text literal
export interface RendererText {
  groupLabel(typeLabel: string, count: number): string;
  collapsed: string;
  unknownType: string;
  canvasName: string;
}
