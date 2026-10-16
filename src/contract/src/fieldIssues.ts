import type { z } from "zod";
import {
  approachSchema,
  attrs,
  defaultsSchema,
  edgeConstraintFields,
  edgeFields,
  fieldFields,
  fieldSchema,
  nodeFields,
  predicateFields,
  predicateSchema,
  shapeHint,
  text,
  typeFields,
  typeSchema,
  vocabularyRowFields,
  type Issue,
} from "./input";
import {
  at,
  EDGE_LISTS,
  isRecord,
  NODE_LISTS,
  own,
  type Path,
  type Raw,
} from "./raw";

type Fields = Record<string, z.ZodType>;
type Tuple = {
  valid: (items: unknown[]) => boolean;
  items: [number, z.ZodType][];
};

const NODE_TUPLE: Tuple = {
  valid: (items) => items.length <= 4 && typeof items[0] === "string",
  items: [
    [1, text],
    [2, text],
    [3, attrs],
  ],
};
const EDGE_TUPLE: Tuple = {
  valid: (items) =>
    (items.length === 3 || items.length === 4) &&
    items.slice(0, 3).every((item) => typeof item === "string"),
  items: [[3, attrs]],
};
const ENTRIES: [string, z.ZodObject, Fields][] = [
  ["types", typeSchema, { label: typeFields.label }],
  ["predicates", predicateSchema, predicateFields],
  ["fields", fieldSchema, fieldFields],
];
const DEFAULT_FIELDS: Fields = {
  type: nodeFields.type,
  predicate: edgeFields.predicate,
};
const DEFAULT_KEYS = new Set(Object.keys(defaultsSchema.shape));
const VOCABULARY_LISTS: [string, Fields][] = [
  ["nodeTypes", vocabularyRowFields],
  ["predicates", vocabularyRowFields],
  ["edgeConstraints", edgeConstraintFields],
];

function rejected(path: Path): Issue {
  return { code: "field-rejected", path };
}

function isBad(schema: z.ZodType, value: unknown): boolean {
  return value !== undefined && !schema.safeParse(value).success;
}

function badFields(record: Raw, fields: Fields, prefix: Path): Issue[] {
  return Object.entries(fields)
    .filter(([key, schema]) => isBad(schema, own(record, key)))
    .map(([key]) => rejected([...prefix, key]));
}

function element(
  value: unknown,
  prefix: Path,
  fields: Fields,
  tuple: Tuple,
): Issue[] {
  if (isRecord(value)) return badFields(value, fields, prefix);
  if (!Array.isArray(value) || !tuple.valid(value)) return [];
  return tuple.items
    .filter(([index, schema]) => isBad(schema, value[index]))
    .map(([index]) => rejected([...prefix, index]));
}

function lists(raw: Raw, paths: Path[], fields: Fields, tuple: Tuple): Issue[] {
  return paths.flatMap((path) => {
    const list = at(raw, path);
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown, index) =>
      element(item, [...path, index], fields, tuple),
    );
  });
}

function container(raw: Raw, key: string): Raw | Issue[] {
  const value = own(raw, key);
  if (value === undefined) return [];
  return isRecord(value) ? value : [rejected([key])];
}

function entries(raw: Raw): Issue[] {
  return ENTRIES.flatMap(([key, schema, fields]) => {
    const map = container(raw, key);
    if (Array.isArray(map)) return map;
    const known = new Set(Object.keys(schema.shape));
    return Object.entries(map).flatMap(([name, entry]) => {
      if (entry === undefined) return [];
      if (!isRecord(entry)) return [rejected([key, name])];
      const unknown = Object.keys(entry)
        .filter((item) => !known.has(item))
        .map((item): Issue => ({
          code: "unknown-key",
          path: [key, name, item],
        }));
      return [...badFields(entry, fields, [key, name]), ...unknown];
    });
  });
}

function vocabulary(raw: Raw): Issue[] {
  const book = container(raw, "vocabulary");
  if (Array.isArray(book)) return book;
  return VOCABULARY_LISTS.flatMap(([key, fields]) => {
    const rows = own(book, key);
    if (rows === undefined) return [];
    if (!Array.isArray(rows)) return [rejected(["vocabulary", key])];
    return rows.flatMap((row: unknown, index) => {
      const prefix = ["vocabulary", key, index];
      if (row === undefined) return [];
      return isRecord(row)
        ? badFields(row, fields, prefix)
        : [rejected(prefix)];
    });
  });
}

function view(raw: Raw): Issue[] {
  const value = container(raw, "view");
  if (Array.isArray(value)) return value;
  return badFields(value, { approach: approachSchema }, ["view"]);
}

function shapeKeys(raw: Raw): Issue[] {
  const hint = shapeHint.safeParse(own(raw, "shape"));
  if (!hint.success || hint.data === null) return [];
  const kept = hint.data;
  return Object.keys(own(raw, "shape") as Raw)
    .filter((key) => !Object.hasOwn(kept, key))
    .map((key) => ({ code: "unknown-key", path: ["shape", key] }));
}

// why: epic decision D1 — the issue path is `["defaults"]`, so the model's key text is never echoed
function defaults(raw: Raw): Issue[] {
  const value = container(raw, "defaults");
  if (Array.isArray(value)) return value;
  const unknown = Object.keys(value)
    .filter((key) => !DEFAULT_KEYS.has(key))
    .map((): Issue => ({ code: "unknown-key", path: ["defaults"] }));
  return [...badFields(value, DEFAULT_FIELDS, ["defaults"]), ...unknown];
}

export function fieldIssues(raw: Raw): Issue[] {
  return [
    ...lists(raw, NODE_LISTS, nodeFields, NODE_TUPLE),
    ...lists(raw, EDGE_LISTS, edgeFields, EDGE_TUPLE),
    ...entries(raw),
    ...vocabulary(raw),
    ...defaults(raw),
    ...view(raw),
    ...shapeKeys(raw),
  ];
}
