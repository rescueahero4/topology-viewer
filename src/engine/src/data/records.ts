import {
  inferredField,
  profile,
  type Issue,
  type RenderInput,
} from "@qdic-topology/contract";
import { guardDepth, type Attrs } from "./hash";
import type { EdgeRecord, NodeRecord, Triple } from "./merge";
import { isRecord, nullRecord, own } from "./tally";

export type Path = Issue["path"];

type NodeItem = NonNullable<RenderInput["nodes"]>[number];
type EdgeItem = NonNullable<RenderInput["edges"]>[number];
type Defaults = RenderInput["defaults"];

export type NodeList = { path: Path; items: NodeItem[]; defaults: boolean };
export type EdgeList = { path: Path; items: EdgeItem[] };

// why: the known keys of the contract edge object (input.ts `edgeObject`); every other key of an
// edge is an attribute (PRD FR-DATA-1)
const EDGE_KEYS = new Set([
  "subject",
  "predicate",
  "object",
  "source",
  "target",
  "subjectNodeId",
  "objectNodeId",
  "isActive",
  "valid_from",
  "valid_to",
  "attrs",
]);

const INFERRED = "_inferred";

// why: question 8 and lead decision D48 — the default predicate is profile data, not a name in code
function defaultPredicate(): string {
  const found = profile.shapeHeuristics.find(
    (heuristic) => heuristic.kind === "rows" && heuristic.hintDefault === true,
  );
  if (found === undefined)
    throw new Error("The profile has no default rows predicate.");
  return found.predicate;
}

const DEFAULT_PREDICATE = defaultPredicate();

type Shape = {
  id?: string;
  idField: string | number;
  idSource: "id" | "globalId";
  globalId: boolean;
  type?: string;
  label?: string;
  attrs: Attrs;
  attrsPath: Path;
  inferred?: Record<string, string>;
  logicalName?: string;
  isWritable?: boolean;
};

function shapeOf(item: NonNullable<NodeItem>, path: Path): Shape {
  if (Array.isArray(item)) {
    const [id, type, label, attrs] = item;
    return {
      id,
      idField: 0,
      idSource: "id",
      globalId: false,
      type,
      label,
      attrs: attrs ?? {},
      attrsPath: [...path, 3],
    };
  }
  const fromGlobal = item.id === undefined && item.globalId !== undefined;
  return {
    id: item.id ?? item.globalId,
    idField: fromGlobal ? "globalId" : "id",
    idSource: fromGlobal ? "globalId" : "id",
    globalId: item.globalId !== undefined,
    type: item.type ?? item.nodeType,
    label: item.label ?? item.physicalName,
    attrs: { ...item.attributes, ...item.attrs },
    attrsPath: [...path, "attrs"],
    inferred: item._inferred,
    logicalName: item.logicalName,
    isWritable: item.isWritable,
  };
}

// why: question 18, lead decision D14, SA ruling S9 — `attrs._inferred` is checked by the contract
// schema; it never stays in `attrs`, so it is never in the merge key
function splitInferred(shape: Shape, issues: Issue[]) {
  const { [INFERRED]: raw, ...attrs } = shape.attrs;
  let inferred = shape.inferred;
  if (Object.hasOwn(shape.attrs, INFERRED)) {
    const checked = inferredField.safeParse(raw);
    if (!checked.success)
      issues.push({
        code: "inferred-rejected",
        path: [...shape.attrsPath, INFERRED],
      });
    else inferred ??= checked.data;
  }
  return {
    attrs,
    inferred: nullRecord(Object.entries(inferred ?? {})),
  };
}

function guarded(attrs: Attrs, path: Path, issues: Issue[]): Attrs {
  const result = guardDepth(attrs);
  if (result.dropped) issues.push({ code: "field-rejected", path });
  return result.attrs;
}

function present<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function nodeRecord(
  shape: Shape & { id: string },
  defaultType: string | undefined,
  position: number,
  issues: Issue[],
): NodeRecord {
  const split = splitInferred(shape, issues);
  return present({
    id: shape.id,
    type: shape.type ?? defaultType,
    label: shape.label ?? shape.id,
    attrs: guarded(split.attrs, shape.attrsPath, issues),
    idSource: shape.idSource,
    logicalName: shape.logicalName,
    isWritable: shape.isWritable,
    inferred: split.inferred,
    position,
  });
}

// why: PRD FR-DATA-3 — a record without an id, a reused id and an edge to a missing node are
// skipped and counted; the first record of an id is kept (mockup `normalise`, lines 341-352)
export function readNodes(
  lists: NodeList[],
  defaults: Defaults,
  issues: Issue[],
): { records: NodeRecord[]; identities: Set<string> } {
  const records: NodeRecord[] = [];
  const identities = new Set<string>();
  const seen = new Set<string>();
  let position = 0;
  for (const list of lists) {
    list.items.forEach((item, index) => {
      const path = [...list.path, index];
      const shape = item === null ? null : shapeOf(item, path);
      if (shape === null || shape.id === undefined || shape.id === "")
        issues.push({ code: "no-id", path });
      else if (seen.has(shape.id))
        issues.push({
          code: "duplicate-id",
          path: [...path, shape.idField, shape.id],
        });
      else {
        seen.add(shape.id);
        if (shape.globalId) identities.add(shape.id);
        const fill = list.defaults ? defaults?.type : undefined;
        records.push(
          nodeRecord({ ...shape, id: shape.id }, fill, position, issues),
        );
      }
      position++;
    });
  }
  return { records, identities };
}

type Ends = {
  subject?: string;
  predicate?: string;
  object?: string;
  fields: [string | number, string | number];
  attrs: Attrs;
  attrsPath: Path;
  rest: Pick<EdgeRecord, "isActive" | "validFrom" | "validTo">;
};

function endsOf(item: NonNullable<EdgeItem>, path: Path): Ends {
  if (Array.isArray(item)) {
    const [subject, predicate, object, attrs] = item;
    return {
      subject,
      predicate,
      object,
      fields: [0, 2],
      attrs: attrs ?? {},
      attrsPath: [...path, 3],
      rest: {},
    };
  }
  const extra = Object.entries(item).filter(([key]) => !EDGE_KEYS.has(key));
  return {
    subject: item.subject ?? item.source ?? item.subjectNodeId,
    predicate: item.predicate,
    object: item.object ?? item.target ?? item.objectNodeId,
    fields: ["subject", "object"],
    attrs: { ...Object.fromEntries(extra), ...item.attrs },
    attrsPath: [...path, "attrs"],
    rest: {
      isActive: item.isActive,
      validFrom: item.valid_from,
      validTo: item.valid_to,
    },
  };
}

function danglingPath(ends: Ends, path: Path, ids: Set<string>): Path | null {
  const pairs: [string | undefined, string | number][] = [
    [ends.subject, ends.fields[0]],
    [ends.object, ends.fields[1]],
  ];
  for (const [id, field] of pairs) {
    if (id === undefined) return path;
    if (!ids.has(id)) return [...path, field, id];
  }
  return null;
}

const DATE = /^\d{4}-\d{2}-\d{2}/;

// why: question 5 — `now` is an argument, so the function stays pure; dates compare by day
function before(date: string | undefined, now: string): boolean {
  if (date === undefined || !DATE.test(date) || !DATE.test(now)) return false;
  return date.slice(0, 10) < now.slice(0, 10);
}

// why: PRD FR-QDIC-3 — an inverse name folds to its canonical predicate with the ends swapped
function folded(subject: string, predicate: string, object: string) {
  if (!Object.hasOwn(profile.inverses, predicate))
    return { subject, predicate, object };
  return {
    subject: object,
    predicate: profile.inverses[predicate].predicate,
    object: subject,
    sourcePredicate: predicate,
  };
}

type ShapedRecord = EdgeRecord & Pick<Triple, "inferred">;

// why: lead decision D32 — the reason of a shaped predicate goes into the Triple `inferred`; only
// an edge that `data/shape` made carries it, so a model-sent edge `_inferred` stays an attribute
function splitReason(attrs: Attrs): {
  attrs: Attrs;
  inferred?: Triple["inferred"];
} {
  const { [INFERRED]: raw, ...rest } = attrs;
  const predicate = isRecord(raw) ? own(raw, "predicate") : undefined;
  return typeof predicate === "string"
    ? { attrs: rest, inferred: nullRecord([["predicate", predicate]]) }
    : { attrs: rest };
}

export function readEdges(
  lists: EdgeList[],
  ids: Set<string>,
  defaults: Defaults,
  now: string,
  issues: Issue[],
  shapedFrom: number,
): { edges: ShapedRecord[]; paths: Path[] } {
  const edges: ShapedRecord[] = [];
  const paths: Path[] = [];
  for (const list of lists) {
    list.items.forEach((item, index) => {
      const path = [...list.path, index];
      const id = paths.push(path) - 1;
      const ends = item === null ? null : endsOf(item, path);
      const dangling = ends === null ? path : danglingPath(ends, path, ids);
      if (ends === null || dangling !== null) {
        issues.push({ code: "dangling-edge", path: dangling ?? path });
        return;
      }
      const predicate =
        ends.predicate ?? defaults?.predicate ?? DEFAULT_PREDICATE;
      const { isActive, validTo } = ends.rest;
      const split =
        id >= shapedFrom ? splitReason(ends.attrs) : { attrs: ends.attrs };
      edges.push(
        present({
          id,
          ...folded(ends.subject as string, predicate, ends.object as string),
          attrs: guarded(split.attrs, ends.attrsPath, issues),
          ...ends.rest,
          retired: isActive === false || before(validTo, now),
          inferred: split.inferred,
        }),
      );
    });
  }
  return { edges, paths };
}
