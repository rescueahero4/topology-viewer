import {
  entityDrawnId,
  entityOfDrawnId,
  type Budget,
  type Graph,
  type Grouping,
  type LayoutName,
} from "#engine";
import { signal } from "@preact/signals";
import type { Actions } from "./actions";
import type { Canvas } from "./canvas/index";
import { live, peekOption } from "./custom";
import { cancelChanges, redoEdit, saveChanges, undoEdit } from "./edits";
import {
  closeWorkbench,
  isOpen,
  layout as splitLayout,
  openWorkbench,
  toggleWorkbench,
} from "./split";
import {
  canvasState,
  editHistory,
  editedGraph,
  saveState,
  selection,
} from "./state";

// The one way for the code of a developer to drive a viewer. Each command does what the matching
// control does, and an `on` handler or `onAction` can stop it.

export const liveActions = signal<Actions | null>(null);

// Set by the public core, which owns the display mode of the viewer.
export const display: {
  get(): "inline" | "fullscreen";
  set(mode: "inline" | "fullscreen"): void;
} = { get: () => "inline", set: () => undefined };

export const customFilters = signal<ReadonlySet<string>>(new Set());
export const liveCanvas = signal<Canvas | null>(null);

export type CustomFilter = {
  id: string;
  label: string;
  test: (node: PublicNode) => boolean;
  active?: boolean;
};

/** The filters run here, outside the engine, which takes only the list of ids that they leave out. */
export function applyCustomFilters(): void {
  const canvas = liveCanvas.peek();
  const graph = editedGraph.peek();
  if (canvas === null || graph === null) return;
  const given = peekOption<readonly CustomFilter[]>("filters", "custom") ?? [];
  const on = customFilters.peek();
  const active = given.filter((filter) => on.has(filter.id));
  const ids: string[] = [];
  if (active.length > 0) {
    const records = new Map(graph.records.map((one) => [one.id, one]));
    for (const entity of graph.entities) {
      const record = records.get(entity.records[0] as string);
      const node: PublicNode = {
        kind: "node",
        id: entity.id,
        label: entity.label,
        ...(entity.type === null ? {} : { type: entity.type }),
        attrs: { ...record?.attrs },
      };
      if (!active.every((filter) => filter.test(node))) ids.push(entity.id);
    }
  }
  canvas.setFilters({ kind: "entitiesOff", ids });
}

export function startCustomFilters(): void {
  const given = peekOption<readonly CustomFilter[]>("filters", "custom") ?? [];
  customFilters.value = new Set(
    given.filter((filter) => filter.active === true).map((filter) => filter.id),
  );
  if (given.length > 0) applyCustomFilters();
}

const act = (run: (actions: Actions) => void) => {
  const actions = liveActions.peek();
  if (actions !== null) run(actions);
};

// A public id is the id of an entity, or the drawn id of a group or the key of an edge.
const drawn = (id: string) => {
  const graph = editedGraph.peek();
  return graph !== null && indexOf(graph).entities.has(id)
    ? entityDrawnId(id)
    : id;
};

type Index = {
  entities: ReadonlyMap<string, Graph["entities"][number]>;
  records: ReadonlyMap<string, Graph["records"][number]>;
};

const indexes = new WeakMap<Graph, Index>();

function indexOf(graph: Graph): Index {
  let index = indexes.get(graph);
  if (index === undefined) {
    index = {
      entities: new Map(graph.entities.map((one) => [one.id, one])),
      records: new Map(graph.records.map((one) => [one.id, one])),
    };
    indexes.set(graph, index);
  }
  return index;
}

export type PublicNode = {
  kind: "node";
  id: string;
  label: string;
  type?: string;
  attrs: Readonly<Record<string, unknown>>;
};

/** The public form of an entity. */
export function nodeData(id: string): PublicNode | null {
  const graph = editedGraph.peek();
  if (graph === null) return null;
  const index = indexOf(graph);
  const entity = index.entities.get(id);
  if (entity === undefined) return null;
  const record = index.records.get(entity.records[0] as string);
  return {
    kind: "node",
    id,
    label: entity.label,
    ...(entity.type === null ? {} : { type: entity.type }),
    attrs: { ...record?.attrs },
  };
}

/** The entity of the current selection: the node, or the anchor of a selected edge. */
export function selectedNode(): PublicNode | null {
  const picked = selection.peek();
  if (picked === null) return null;
  const drawnId = "edge" in picked ? picked.anchor : picked.node;
  const id = entityOfDrawnId(drawnId);
  return id === null ? null : nodeData(id);
}

export const commands = {
  select: (id: string | null) =>
    act((a) => a.select(id === null ? null : drawn(id))),
  focus: (id: string) => act((a) => a.focus(id)),
  expand: (id: string) => act((a) => a.expand(drawn(id))),
  collapse: (id: string) => act((a) => a.collapse(drawn(id))),
  hide: (ids: readonly string[]) => act((a) => a.hide(ids.map(drawn))),
  restore: (ids: readonly string[]) => act((a) => a.restore(ids.map(drawn))),
  reveal: (ids: readonly string[]) => act((a) => a.reveal([...ids])),
  resetView: () => act((a) => a.resetView()),
  fit: () => act((a) => a.clearAndFit()),
  setLayout: (name: string) => act((a) => a.setLayout(name as LayoutName)),
  setBudget: (budget: number | "all") =>
    act((a) => a.setBudget(budget as Budget)),
  setGrouping: (grouping: number | "off") =>
    act((a) => a.setGrouping(grouping as Grouping)),
  showAllTypes: () => act((a) => a.showAllTypes()),
  setTypeVisible: (type: string | null, on: boolean) =>
    act((a) => a.toggleType(type, on)),
  setFamilyVisible: (family: string, on: boolean) =>
    act((a) => a.toggleFamily(family, on)),
  setPredicateVisible: (predicate: string, on: boolean) =>
    act((a) => a.togglePredicate(predicate, on)),
  setCustomFilter: (id: string, on: boolean) => {
    const next = new Set(customFilters.peek());
    if (on) next.add(id);
    else next.delete(id);
    customFilters.value = next;
    applyCustomFilters();
  },
  setDisplayMode: (mode: "inline" | "fullscreen") => display.set(mode),
  openTable: openWorkbench,
  closeTable: closeWorkbench,
  toggleTable: toggleWorkbench,
  setTableFilters: (change: Readonly<Record<string, unknown>>) =>
    live.table?.setFilters(change),
  setTableSort: (sort: unknown) => live.table?.setSort(sort),
  setTableColumn: (column: unknown, on: boolean) =>
    live.table?.setColumn(column, on),
  setTableSearch: (text: string) => live.table?.setText(text),
  setSearch: (text: string) => live.search?.set(text),
  setInspectorOpen: (open: boolean) => live.inspector?.set(open),
  saveEdits: () => saveChanges(),
  cancelEdits: () => act((a) => cancelChanges(a)),
  undo: () => act((a) => undoEdit(a)),
  redo: () => act((a) => redoEdit(a)),
  getState: () => {
    const state = canvasState.peek();
    const picked = selection.peek();
    const table = live.table?.get();
    return {
      selection:
        picked === null
          ? null
          : "node" in picked
            ? { node: entityOfDrawnId(picked.node) ?? picked.node }
            : { edge: picked.edge },
      layout: state?.layout ?? null,
      budget: state?.budget ?? null,
      grouping: state?.grouping ?? null,
      filters: state?.filters ?? null,
      customFilters: [...customFilters.peek()],
      displayMode: display.get(),
      inspectorOpen: live.inspector?.get() ?? false,
      search: live.search?.get() ?? "",
      table: {
        open: isOpen(),
        layout: splitLayout.peek(),
        filters: table?.filters ?? null,
        sort: table?.sort ?? null,
        search: table?.text ?? "",
      },
      edits: {
        dirty: editHistory.peek().history.dirty(),
        saving: saveState.peek().saving,
        error: saveState.peek().error,
      },
    };
  },
};

export type Commands = typeof commands;
