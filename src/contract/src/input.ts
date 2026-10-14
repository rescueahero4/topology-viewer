import { z } from "zod";
import { SCHEMA_VERSION } from "./schemaVersion";

// why: SA §4.1 field-level rule — a bad value falls back and never fails the schema;
// a static fallback keeps z.toJSONSchema() working (SA §4.7)
function optional<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined);
}

const text = z.string();
const attrs = z.record(z.string(), z.unknown());

export const approachSchema = z.enum(["active", "passive"]);

// why: SA §4.1 and PRD Q16 — path data only, so no string can leave the `d` attribute
const GLYPH = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/;

export const typeFields = {
  label: text,
  rank: z.number().int().min(0).max(6),
  shape: z.enum([
    "circle",
    "triangle",
    "square",
    "diamond",
    "pentagon",
    "hexagon",
    "heptagon",
    "octagon",
  ]),
  color: z.string().max(64),
  abbr: z.string().max(2),
  glyph: z.string().max(512).regex(GLYPH),
  level: z.number().int().min(0),
  role: z.enum(["structure", "attribute", "curation"]),
};

// why: STORY-001-02 open question 5 — existing SA §4.2 codes; the issue path names the field
export const TYPE_FIELD_CODES = {
  rank: "rank-rejected",
  shape: "rank-rejected",
  color: "color-rejected",
  abbr: "glyph-rejected",
  glyph: "glyph-rejected",
  level: "layout-rejected",
  role: "layout-rejected",
} as const;

const typeSchema = z.object({
  label: optional(typeFields.label),
  rank: typeFields.rank.optional().catch(0),
  shape: optional(typeFields.shape),
  color: optional(typeFields.color),
  abbr: optional(typeFields.abbr),
  glyph: optional(typeFields.glyph),
  level: optional(typeFields.level),
  role: optional(typeFields.role),
});

const predicateSchema = z.object({
  label: optional(text),
  category: optional(text),
  inverse: optional(text),
  role: optional(z.literal("containment").nullable()),
});

const fieldSchema = z.object({
  label: optional(text),
  slot: optional(text),
  why: optional(text),
});

const vocabularyRow = z.looseObject({
  name: optional(text),
  description: optional(text),
  category: optional(text),
  inverse_predicate: optional(text.nullable()),
  is_system: optional(z.boolean()),
  is_active: optional(z.boolean()),
});

const edgeConstraintRow = z.looseObject({
  predicate: optional(text),
  subject_node_type: optional(text),
  object_node_type: optional(text),
});

const vocabularySchema = z.looseObject({
  nodeTypes: optional(z.array(vocabularyRow)),
  predicates: optional(z.array(vocabularyRow)),
  edgeConstraints: optional(z.array(edgeConstraintRow)),
});

export const viewFields = {
  root: text,
  layout: z.enum(["force", "atomic", "bubbles", "tree-h", "tree-v"]),
  budget: z.literal([10, 20, 50, "all"]),
};

export const VIEW_FIELD_CODES = {
  root: "root-not-found",
  layout: "layout-rejected",
  budget: "budget-rejected",
} as const;

export const viewSchema = z.object({
  approach: optional(approachSchema),
  root: optional(viewFields.root),
  reveal: optional(z.array(optional(text))),
  layout: optional(viewFields.layout),
  budget: optional(viewFields.budget),
});

export const shapeHint = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("rows"),
      subject: text,
      object: text,
      predicate: text.optional(),
      type: text.optional(),
    }),
    z.object({
      kind: z.literal("tree"),
      children: text,
      label: text,
      id: text.optional(),
    }),
  ])
  .nullable();

export const inferredField = z.record(z.string(), text);

export const nodeObject = z.looseObject({
  id: optional(text),
  type: optional(text),
  label: optional(text),
  attrs: optional(attrs),
  _inferred: optional(inferredField),
  globalId: optional(text),
  nodeType: optional(text),
  physicalName: optional(text),
  logicalName: optional(text),
  isWritable: optional(z.boolean()),
  attributes: optional(attrs),
});

const edgeObject = z.looseObject({
  subject: optional(text),
  predicate: optional(text),
  object: optional(text),
  source: optional(text),
  target: optional(text),
  subjectNodeId: optional(text),
  objectNodeId: optional(text),
  isActive: optional(z.boolean()),
  valid_from: optional(text),
  valid_to: optional(text),
  attrs: optional(attrs),
});

// why: PRD FR-DATA-3 — a record that is neither an object nor a tuple is a record without
// an id; `normalize` skips and counts it, so the element falls back to null
export const nodeSchema = z
  .union([
    nodeObject,
    z.tuple([text, optional(text), optional(text), optional(attrs)]),
  ])
  .nullable()
  .catch(null);

export const edgeSchema = z
  .union([edgeObject, z.tuple([text, text, text, optional(attrs)])])
  .nullable()
  .catch(null);

export const renderInputSchema = z.looseObject({
  schemaVersion: z.literal(SCHEMA_VERSION).optional().catch(SCHEMA_VERSION),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  links: z.array(edgeSchema).optional(),
  neighborhood: z
    .looseObject({
      nodes: z.array(nodeSchema).optional(),
      edges: z.array(edgeSchema).optional(),
    })
    .optional(),
  defaults: optional(attrs),
  types: optional(z.record(z.string(), optional(typeSchema))),
  predicates: optional(z.record(z.string(), optional(predicateSchema))),
  fields: optional(z.record(z.string(), optional(fieldSchema))),
  vocabulary: optional(vocabularySchema),
  view: optional(viewSchema),
  shape: optional(shapeHint),
});

export const issueSchema = z.object({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
});

export type RenderInput = z.infer<typeof renderInputSchema>;
export type Issue = z.infer<typeof issueSchema>;
