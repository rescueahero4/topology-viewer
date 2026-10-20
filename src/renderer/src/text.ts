// why: epic question 13 (P4-1) — the user text of the canvas comes from the caller; EPIC-004 gives
// it from the string tables, so the renderer and the controller hold no text literal
export interface RendererText {
  groupLabel(typeLabel: string, count: number): string;
  collapsed: string;
  unknownType: string;
  canvasName: string;
  tipGroup(count: number, typeLabel: string): string;
  tipOpened(sub: string): string;
  tipMore(sub: string, more: number): string;
  tipMember(sub: string): string;
  tipEdge(subjectLabel: string, objectLabel: string): string;
  tipEdgeAction(label: string, muted: boolean, count: number): string;
  // why: FR-CANVAS-15 — the count part of the bubble pill `<Type> · N`, with its separator
  bubbleCount(count: number): string;
}
