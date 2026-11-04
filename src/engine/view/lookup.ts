import type { Graph } from "../data/normalize";
import type { CanvasState, DrawnId } from "../state/canvasState";
import type { Vocab } from "../vocab/resolve";
import { drawnView } from "./frontier";
import { topology } from "./group";
import { offTheCanvas, type OnCanvas } from "./hidden";

export type CanvasLookup = {
  onCanvas(id: string): OnCanvas;
  hiddenOf(id: string): DrawnId | null;
  drawnIdOf(id: string): DrawnId | null;
};

// why: `entityIndex` of view/hidden — an id names the first entity that has it as its id or as a
// record id; `topology().entityOf` keeps the last one, so `drawnIdOf` reads that map instead
function firstEntity(graph: Graph): Map<string, number> {
  const index = new Map<string, number>();
  graph.entities.forEach((entity, at) => {
    for (const id of [entity.id, ...entity.records])
      if (!index.has(id)) index.set(id, at);
  });
  return index;
}

// why: STORY-004-07 rule 2 (guardrail 10) — the entity of a record id, by the `entityIndex` rule
// of view/hidden; the Workbench reads it, so the shell keeps no copy of the rule
export function entityOfRecord(graph: Graph): (id: string) => string | null {
  const first = firstEntity(graph);
  return (id) => {
    const at = first.get(id);
    return at === undefined ? null : graph.entities[at].id;
  };
}

// why: `hiddenOf` of view/hidden — among the entries that still have a member off the canvas, the
// first entry that lists the entity as a member, else the first that lists it as a strand
function ownerOf(state: CanvasState, off: (id: string) => boolean) {
  const byMember = new Map<string, DrawnId>();
  const byStrand = new Map<string, DrawnId>();
  for (const entry of state.hidden) {
    if (!entry.members.some(off)) continue;
    for (const id of entry.members)
      if (!byMember.has(id)) byMember.set(id, entry.key);
    for (const id of entry.stranded)
      if (!byStrand.has(id)) byStrand.set(id, entry.key);
  }
  return (entity: string) => byMember.get(entity) ?? byStrand.get(entity);
}

// why: STORY-004-01 Rule A (G1) — one pass for many ids; each answer equals `onCanvas`, `hiddenOf`
// and `drawnIdOf` of view/hidden and view/frontier, which build these indexes on each call
export function canvasLookup(
  state: CanvasState,
  graph: Graph,
  vocab: Vocab,
): CanvasLookup {
  const top = topology(graph, vocab);
  const { drawnOf } = drawnView(top, state);
  const first = firstEntity(graph);
  const off = offTheCanvas(state);
  const owner = ownerOf(state, off);
  const typesOff = new Set(state.filters.typesOff);
  const entitiesOff = new Set(state.filters.entitiesOff);
  const shown = new Set(state.around?.shown);
  const hiddenOf = (id: string): DrawnId | null => {
    const at = first.get(id);
    if (at === undefined) return null;
    const entity = top.ids[at];
    return off(entity) ? (owner(entity) ?? null) : null;
  };
  const drawnIdOf = (id: string): DrawnId | null => {
    const entity = top.entityOf.get(id);
    return entity === undefined ? null : drawnOf[entity];
  };
  const onCanvas = (id: string): OnCanvas => {
    const at = first.get(id);
    if (at === undefined) return "not-drawn";
    const entity = top.ids[at];
    if (off(entity)) return hiddenOf(entity) === null ? "not-drawn" : "hidden";
    if (typesOff.has(top.types[at]) || entitiesOff.has(entity))
      return "not-drawn";
    if (state.around === null) return "drawn";
    const node = drawnIdOf(entity);
    return node !== null && !shown.has(node) ? "faded" : "drawn";
  };
  return { onCanvas, hiddenOf, drawnIdOf };
}
