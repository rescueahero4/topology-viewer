import { z } from "zod";

const text = z.string().min(1);

const sourceSchema = z.strictObject({
  doc: z.enum(["GV", "SA-Intro", "PRD"]),
  section: text,
  note: text.optional(),
});

const designSchema = z
  .string()
  .regex(/^(pending-ddr|owner-accepted-\d{4}-\d{2}-\d{2}|ddr-[A-Za-z0-9-]+)$/);

const nodeTypeSchema = z.strictObject({
  category: text,
  label: text,
  isSystem: z.boolean(),
  treeRole: z.enum(["structure", "attribute", "curation"]),
  level: z.number().int().min(0).optional(),
  attributeSet: text.nullable(),
  attributes: z.array(text),
  icon: text.optional(),
  rank: z.number().int().min(0).max(6).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  abbr: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  design: designSchema.optional(),
  builtIn: z.literal(true).optional(),
  source: sourceSchema,
});

const predicateSchema = z.strictObject({
  category: text,
  inverse: text.nullable(),
  direction: z.enum(["out", "in", "both"]),
  isSystem: z.boolean(),
  status: z.literal("proposed").optional(),
  builtIn: z.literal(true).optional(),
  role: z.literal("containment").optional(),
  layoutRole: z.enum(["lineage", "structure"]).optional(),
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
  status: z.literal("proposed").nullable(),
  note: text.optional(),
  source: sourceSchema,
});

const writeRuleSchema = z.strictObject({
  text,
  source: sourceSchema,
});

const attributeSchema = z.strictObject({
  key: text,
  resolves: z.array(z.tuple([text, text])).optional(),
  lost: z.literal(true).optional(),
  source: sourceSchema,
});

const notYetIncludedSchema = z.strictObject({
  field: text,
  group: text,
  slot: text.nullable(),
  source: sourceSchema,
});

// why: STORY-002-09 T3 — the mockup list readers (`personName`, `tagName`) as data, own keys only
const itemNameSchema = z.strictObject({
  paths: z.array(z.array(text).min(1)).min(1),
  join: z.string(),
});

const slotSchema = z.strictObject({
  slot: text,
  keys: z.array(text).min(1),
  late: z.array(text).optional(),
  edge: text.optional(),
  edgeObject: text.optional(),
  derive: z.enum(["path", "source", "parent-owners"]).optional(),
  assetOnlyKeys: z.array(text).min(1).optional(),
  strong: z.literal(true).optional(),
  labelFallback: z.literal(true).optional(),
  itemName: z.array(itemNameSchema).min(1).optional(),
  source: sourceSchema,
});

const shapeHeuristicSchema = z.strictObject({
  kind: z.enum(["rows", "tree"]),
  columns: z.array(text).min(1),
  predicate: text,
  labelKeys: z.array(text).min(1).optional(),
  hintDefault: z.literal(true).optional(),
  source: sourceSchema,
});

const typeMenuCategoriesSchema = z.strictObject({
  order: z.array(text).min(1),
  source: sourceSchema,
});

const globalIdPrefixSchema = z.strictObject({
  type: text.nullable(),
  writable: z.literal(true).optional(),
  source: sourceSchema,
});

export const profileShapeSchema = z.strictObject({
  categoryOrder: z.array(text).min(1),
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
