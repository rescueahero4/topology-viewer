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
  tipEdgeAction(
    label: string,
    muted: boolean,
    count: number,
    retired: boolean,
  ): string;
  // why: FR-CANVAS-15 — the count part of the bubble pill `<Type> · N`, with its separator
  bubbleCount(count: number): string;
  // why: FR-QDIC-4, TL-14 — the text of the badge of a lost entity
  lostMark: string;
  // why: FR-QDIC-5, TL-15 — the predicate pill text of a retired edge
  pillRetired(label: string): string;
}
