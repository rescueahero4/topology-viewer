import { z } from "zod/mini";

const text = z.string().check(z.minLength(1));

const nonEmpty = <T extends z.core.SomeType>(item: T) =>
  z.array(item).check(z.minLength(1));

const sourceSchema = z.strictObject({
  doc: z.enum(["GV", "SA-Intro", "PRD"]),
  section: text,
  note: z.optional(text),
});

const designSchema = z
  .string()
  .check(
    z.regex(
      /^(pending-ddr|owner-accepted-\d{4}-\d{2}-\d{2}|ddr-[A-Za-z0-9-]+)$/,
    ),
  );

const nodeTypeSchema = z.strictObject({
  category: text,
  label: text,
  isSystem: z.boolean(),
  treeRole: z.enum(["structure", "attribute", "curation"]),
  level: z.optional(z.number().check(z.int(), z.minimum(0))),
  attributeSet: z.nullable(text),
  attributes: z.array(text),
  icon: z.optional(text),
  rank: z.optional(z.number().check(z.int(), z.minimum(0), z.maximum(6))),
  color: z.optional(z.string().check(z.regex(/^#[0-9A-Fa-f]{6}$/))),
  abbr: z.optional(z.string().check(z.regex(/^[A-Z]{2}$/))),
  design: z.optional(designSchema),
  builtIn: z.optional(z.literal(true)),
  source: sourceSchema,
});

const predicateSchema = z.strictObject({
  category: text,
  inverse: z.nullable(text),
  direction: z.enum(["out", "in", "both"]),
  isSystem: z.boolean(),
  status: z.optional(z.literal("proposed")),
  builtIn: z.optional(z.literal(true)),
  role: z.optional(z.literal("containment")),
  layoutRole: z.optional(z.enum(["lineage", "structure"])),
  source: sourceSchema,
});

const inverseSchema = z.strictObject({
  predicate: text,
  source: sourceSchema,
});

const pairingSchema = z.strictObject({
  predicate: text,
  subject: text,
  object: text,
  owner: text,
  status: z.nullable(z.literal("proposed")),
  note: z.optional(text),
  source: sourceSchema,
});

const writeRuleSchema = z.strictObject({
  text,
  source: sourceSchema,
});

const attributeSchema = z.strictObject({
  key: text,
  resolves: z.optional(z.array(z.tuple([text, text]))),
  lost: z.optional(z.literal(true)),
  source: sourceSchema,
});

const notYetIncludedSchema = z.strictObject({
  field: text,
  group: text,
  slot: z.nullable(text),
  source: sourceSchema,
});

// why: STORY-002-09 T3 — the mockup list readers (`personName`, `tagName`) as data, own keys only
const itemNameSchema = z.strictObject({
  paths: nonEmpty(nonEmpty(text)),
  join: z.string(),
});

const slotSchema = z.strictObject({
  slot: text,
  keys: nonEmpty(text),
  late: z.optional(z.array(text)),
  edge: z.optional(text),
  edgeObject: z.optional(text),
  derive: z.optional(z.enum(["path", "source", "parent-owners"])),
  assetOnlyKeys: z.optional(nonEmpty(text)),
  strong: z.optional(z.literal(true)),
  labelFallback: z.optional(z.literal(true)),
  itemName: z.optional(nonEmpty(itemNameSchema)),
  source: sourceSchema,
});

const shapeHeuristicSchema = z.strictObject({
  kind: z.enum(["rows", "tree"]),
  columns: nonEmpty(text),
  predicate: text,
  labelKeys: z.optional(nonEmpty(text)),
  hintDefault: z.optional(z.literal(true)),
  source: sourceSchema,
});

const typeMenuCategoriesSchema = z.strictObject({
  order: z.array(text),
  source: sourceSchema,
});

const globalIdPrefixSchema = z.strictObject({
  type: z.nullable(text),
  writable: z.optional(z.literal(true)),
  source: sourceSchema,
});

export const profileShapeSchema = z.strictObject({
  categoryOrder: nonEmpty(text),
  typeMenuCategories: typeMenuCategoriesSchema,
  nodeTypes: z.record(text, nodeTypeSchema),
  predicates: z.record(text, predicateSchema),
  inverses: z.record(text, inverseSchema),
  pairings: z.array(pairingSchema),
  writeRules: z.array(writeRuleSchema),
  attributeSets: z.record(text, z.array(attributeSchema)),
  notYetIncluded: z.array(notYetIncludedSchema),
  slots: z.array(slotSchema),
  shapeHeuristics: z.array(shapeHeuristicSchema),
  globalIdPrefixes: z.record(text, globalIdPrefixSchema),
});
