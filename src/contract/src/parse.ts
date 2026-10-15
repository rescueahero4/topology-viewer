import { z } from "zod";
import { checkCounts } from "./caps";
import { fieldIssues } from "./fieldIssues";
import {
  edgeSchema,
  inferredField,
  nodeObject,
  nodeSchema,
  renderInputSchema,
  shapeHint,
  TYPE_FIELD_CODES,
  typeFields,
  VIEW_FIELD_CODES,
  viewFields,
  viewSchema,
  type Issue,
  type RenderInput,
} from "./input";
import type { IssueCode } from "./notices/codes";
import {
  at,
  EDGE_LISTS,
  isRecord,
  NODE_LISTS,
  own,
  type Path,
  type Raw,
} from "./raw";
import { SCHEMA_VERSION } from "./schemaVersion";

type Node = z.infer<typeof nodeSchema>;
type Edge = z.infer<typeof edgeSchema>;
type View = z.infer<typeof viewSchema>;

const TOP_KEYS = new Set(Object.keys(renderInputSchema.shape));
const NODE_KEYS = new Set(Object.keys(nodeObject.shape));
const VIEW_KEYS = new Set(Object.keys(viewSchema.shape));

function length(raw: Raw, lists: Path[]): number {
  return lists.reduce((sum, path) => {
    const list = at(raw, path);
    return sum + (Array.isArray(list) ? list.length : 0);
  }, 0);
}

function fail(fatal: Issue) {
  return { ok: false as const, fatal };
}

// why: SA §4.1 — only the structure of the payload is fatal; the caps run before any element schema
function checkStructure(raw: Raw): Issue | null {
  const neighborhood = own(raw, "neighborhood");
  if (neighborhood !== undefined && !isRecord(neighborhood)) {
    return { code: "not-object", path: ["neighborhood"] };
  }
  const lists: [IssueCode, Path[]][] = [
    ["nodes-not-array", NODE_LISTS],
    ["edges-not-array", EDGE_LISTS],
  ];
  for (const [code, paths] of lists) {
    const bad = paths.find((path) => {
      const value = at(raw, path);
      return value !== undefined && !Array.isArray(value);
    });
    if (bad) return { code, path: bad };
  }
  return checkCounts(length(raw, NODE_LISTS), length(raw, EDGE_LISTS));
}

function rejected(
  schema: z.ZodType,
  owner: Raw,
  key: string,
  prefix: Path,
  code: IssueCode,
): Issue[] {
  const value = own(owner, key);
  if (value === undefined) return [];
  const result = schema.safeParse(value);
  if (result.success) return [];
  const detail = result.error.issues[0].path.filter(
    (part): part is string | number => typeof part !== "symbol",
  );
  return [{ code, path: [...prefix, key, ...detail] }];
}

function typeIssues(raw: Raw): Issue[] {
  const types = own(raw, "types");
  if (!isRecord(types)) return [];
  return Object.entries(types).flatMap(([type, entry]) =>
    isRecord(entry)
      ? Object.entries(TYPE_FIELD_CODES).flatMap(([field, code]) =>
          rejected(
            typeFields[field as keyof typeof TYPE_FIELD_CODES],
            entry,
            field,
            ["types", type],
            code,
          ),
        )
      : [],
  );
}

// why: PRD FR-CANVAS-7 — each bad entry gets its own issue; the valid ids stay
function revealIssues(view: Raw): Issue[] {
  const reveal = own(view, "reveal");
  if (reveal === undefined) return [];
  if (!Array.isArray(reveal))
    return [{ code: "reveal-not-found", path: ["view", "reveal"] }];
  return reveal.flatMap((id: unknown, index) =>
    typeof id === "string"
      ? []
      : [{ code: "reveal-not-found", path: ["view", "reveal", index] }],
  );
}

function viewIssues(raw: Raw): Issue[] {
  const view = own(raw, "view");
  if (!isRecord(view)) return [];
  const unknown = Object.keys(view)
    .filter((key) => !VIEW_KEYS.has(key))
    .map((key): Issue => ({ code: "unknown-key", path: ["view", key] }));
  const values = Object.entries(VIEW_FIELD_CODES).flatMap(([field, code]) =>
    rejected(
      viewFields[field as keyof typeof VIEW_FIELD_CODES],
      view,
      field,
      ["view"],
      code,
    ),
  );
  return [...values, ...revealIssues(view), ...unknown];
}

function inferredIssues(raw: Raw): Issue[] {
  return NODE_LISTS.flatMap((path) => {
    const list = at(raw, path);
    if (!Array.isArray(list)) return [];
    return list.flatMap((node: unknown, index) =>
      isRecord(node)
        ? rejected(
            inferredField,
            node,
            "_inferred",
            [...path, index],
            "inferred-rejected",
          )
        : [],
    );
  });
}

function collectIssues(raw: Raw, rawTree: boolean): Issue[] {
  // why: STORY-001-02 T7 memo — a bad hint on a graph payload is dropped with `layout-rejected`;
  // in a raw tree payload the root keys are the payload, so they are not `unknown-key`
  const unknown = rawTree
    ? []
    : Object.keys(raw)
        .filter((key) => !TOP_KEYS.has(key))
        .map((key): Issue => ({ code: "unknown-key", path: [key] }));
  return [
    ...rejected(
      z.literal(SCHEMA_VERSION),
      raw,
      "schemaVersion",
      [],
      "schema-version-unknown",
    ),
    ...unknown,
    ...rejected(shapeHint, raw, "shape", [], "layout-rejected"),
    ...inferredIssues(raw),
    ...typeIssues(raw),
    ...viewIssues(raw),
    ...fieldIssues(raw),
  ];
}

function present<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function presentRecord<T extends object>(
  record: Record<string, T | undefined>,
): Record<string, T> {
  const entries = Object.entries(record).filter(
    (entry): entry is [string, T] => entry[1] !== undefined,
  );
  return Object.fromEntries(
    entries.map(([key, value]) => [key, present(value)]),
  );
}

// why: PRD FR-DATA-1 — unknown node keys are kept as attributes; an explicit `attrs` entry wins
function cleanNode(node: Node): Node {
  if (node === null || Array.isArray(node)) return node;
  const entries = Object.entries(node).filter(
    ([, value]) => value !== undefined,
  );
  const known: Raw = Object.fromEntries(
    entries.filter(([key]) => NODE_KEYS.has(key)),
  );
  const extra = entries.filter(([key]) => !NODE_KEYS.has(key));
  if (extra.length > 0)
    known.attrs = { ...Object.fromEntries(extra), ...node.attrs };
  return known;
}

function cleanEdge(edge: Edge): Edge {
  return edge === null || Array.isArray(edge) ? edge : present(edge);
}

function cleanView(view: View): View {
  const { reveal, ...rest } = view;
  return present({
    ...rest,
    reveal: reveal?.filter((id): id is string => id !== undefined),
  });
}

function rows<T extends object>(list: (T | undefined)[] | undefined) {
  return list?.filter((row): row is T => row !== undefined).map(present);
}

function clean(input: RenderInput): RenderInput {
  // why: PRD FR-DATA-8 — an absent or unknown version reads as the current one (S25)
  const { schemaVersion = SCHEMA_VERSION, ...rest } = input;
  const {
    nodes,
    edges,
    links,
    neighborhood,
    types,
    predicates,
    fields,
    vocabulary,
    view,
  } = rest;
  return present({
    schemaVersion,
    ...rest,
    nodes: nodes?.map(cleanNode),
    edges: edges?.map(cleanEdge),
    links: links?.map(cleanEdge),
    neighborhood: neighborhood
      ? present({
          ...neighborhood,
          nodes: neighborhood.nodes?.map(cleanNode),
          edges: neighborhood.edges?.map(cleanEdge),
        })
      : undefined,
    types: types ? presentRecord(types) : undefined,
    predicates: predicates ? presentRecord(predicates) : undefined,
    fields: fields ? presentRecord(fields) : undefined,
    vocabulary: vocabulary
      ? present({
          ...vocabulary,
          nodeTypes: rows(vocabulary.nodeTypes),
          predicates: rows(vocabulary.predicates),
          edgeConstraints: rows(vocabulary.edgeConstraints),
        })
      : undefined,
    view: view ? cleanView(view) : undefined,
  });
}

function parse(raw: unknown) {
  if (!isRecord(raw)) return fail({ code: "not-object", path: [] });
  const structural = checkStructure(raw);
  if (structural) return fail(structural);
  const rawTree =
    at(raw, ["nodes"]) === undefined && at(raw, ["neighborhood"]) === undefined;
  // why: PRD FR-DATA-10 step 1 and FR-DATA-4 — a hint that cannot apply to a raw payload stops it
  const badHint = rawTree
    ? rejected(shapeHint, raw, "shape", [], "not-a-graph")
    : [];
  if (badHint.length > 0) return fail(badHint[0]);
  const issues = collectIssues(raw, rawTree);
  return {
    ok: true as const,
    data: clean(renderInputSchema.parse(raw)),
    issues,
  };
}

export function parseRenderInput(raw: unknown) {
  try {
    return parse(raw);
  } catch (error) {
    // why: SA §11 — a stack overflow on deep input becomes a catalog code, never a stack trace
    if (error instanceof RangeError)
      return fail({ code: "not-a-graph", path: [] });
    throw error;
  }
}
