import { z } from "zod";
import { SCHEMA_VERSION } from "./schemaVersion";

// why: SA §4.1 field-level rule — a bad value falls back and never fails the schema;
// a static fallback keeps z.toJSONSchema() working (SA §4.7)
function optional<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined);
}

export const text = z.string();
export const attrs = z.record(z.string(), z.unknown());

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

export const typeSchema = z.object({
  label: optional(typeFields.label),
  rank: typeFields.rank.optional().catch(0),
  shape: optional(typeFields.shape),
  color: optional(typeFields.color),
  abbr: optional(typeFields.abbr),
  glyph: optional(typeFields.glyph),
  level: optional(typeFields.level),
  role: optional(typeFields.role),
});

export const predicateFields = {
  label: text,
  category: text,
  inverse: text,
  role: z.literal("containment").nullable(),
};

export const predicateSchema = z.object({
  label: optional(predicateFields.label),
  category: optional(predicateFields.category),
  inverse: optional(predicateFields.inverse),
  role: optional(predicateFields.role),
});

export const fieldFields = { label: text, slot: text, why: text };

export const fieldSchema = z.object({
  label: optional(fieldFields.label),
  slot: optional(fieldFields.slot),
  why: optional(fieldFields.why),
});

export const vocabularyRowFields = {
  name: text,
  description: text,
  category: text,
  inverse_predicate: text.nullable(),
  is_system: z.boolean(),
  is_active: z.boolean(),
};

const vocabularyRow = z.looseObject({
  name: optional(vocabularyRowFields.name),
  description: optional(vocabularyRowFields.description),
  category: optional(vocabularyRowFields.category),
  inverse_predicate: optional(vocabularyRowFields.inverse_predicate),
  is_system: optional(vocabularyRowFields.is_system),
  is_active: optional(vocabularyRowFields.is_active),
});

export const edgeConstraintFields = {
  predicate: text,
  subject_node_type: text,
  object_node_type: text,
};

const edgeConstraintRow = z.looseObject({
  predicate: optional(edgeConstraintFields.predicate),
  subject_node_type: optional(edgeConstraintFields.subject_node_type),
  object_node_type: optional(edgeConstraintFields.object_node_type),
});

const vocabularySchema = z.looseObject({
  nodeTypes: optional(z.array(optional(vocabularyRow))),
  predicates: optional(z.array(optional(vocabularyRow))),
  edgeConstraints: optional(z.array(optional(edgeConstraintRow))),
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

export const nodeFields = {
  type: text,
  label: text,
  attrs,
  globalId: text,
  nodeType: text,
  physicalName: text,
  logicalName: text,
  isWritable: z.boolean(),
  attributes: attrs,
};

export const nodeObject = z.looseObject({
  id: optional(text),
  type: optional(nodeFields.type),
  label: optional(nodeFields.label),
  attrs: optional(nodeFields.attrs),
  _inferred: optional(inferredField),
  globalId: optional(nodeFields.globalId),
  nodeType: optional(nodeFields.nodeType),
  physicalName: optional(nodeFields.physicalName),
  logicalName: optional(nodeFields.logicalName),
  isWritable: optional(nodeFields.isWritable),
  attributes: optional(nodeFields.attributes),
});

export const edgeFields = {
  predicate: text,
  isActive: z.boolean(),
  valid_from: text,
  valid_to: text,
  attrs,
};

const edgeObject = z.looseObject({
  subject: optional(text),
  predicate: optional(edgeFields.predicate),
  object: optional(text),
  source: optional(text),
  target: optional(text),
  subjectNodeId: optional(text),
  objectNodeId: optional(text),
  isActive: optional(edgeFields.isActive),
  valid_from: optional(edgeFields.valid_from),
  valid_to: optional(edgeFields.valid_to),
  attrs: optional(edgeFields.attrs),
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
