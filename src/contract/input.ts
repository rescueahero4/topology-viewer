import { z } from "zod/mini";
import { issueCodeSchema, type IssueCode } from "./notices/codes";
import { SCHEMA_VERSION } from "./schemaVersion";

// why: SA §4.1 field-level rule — a bad value falls back and never fails the schema;
// a static fallback keeps z.toJSONSchema() working (SA §4.7)
function optional<T extends z.core.SomeType>(schema: T) {
  return z.catch(z.optional(schema), undefined as never);
}

export const text = z.string();
export const attrs = z.record(z.string(), z.unknown());

export const approachSchema = z.enum(["active", "passive"]);

// why: SA §4.1 and PRD Q16 — path data only, so no string can leave the `d` attribute
const GLYPH = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/;

export const typeFields = {
  label: text,
  rank: z.number().check(z.int(), z.minimum(0), z.maximum(6)),
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
  color: z.string().check(z.maxLength(64)),
  abbr: z.string().check(z.maxLength(2)),
  glyph: z.string().check(z.maxLength(512), z.regex(GLYPH)),
  level: z.number().check(z.int(), z.minimum(0)),
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
} as const satisfies Record<string, IssueCode>;

export const typeSchema = z.object({
  label: optional(typeFields.label),
  rank: z.catch(z.optional(typeFields.rank), 0),
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
  role: z.nullable(z.literal("containment")),
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
  inverse_predicate: z.nullable(text),
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
} as const satisfies Record<string, IssueCode>;

export const viewSchema = z.object({
  approach: optional(approachSchema),
  root: optional(viewFields.root),
  reveal: optional(z.array(optional(text))),
  layout: optional(viewFields.layout),
  budget: optional(viewFields.budget),
});

export const shapeHint = z.nullable(
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("rows"),
      subject: text,
      object: text,
      predicate: z.optional(text),
      type: z.optional(text),
    }),
    z.object({
      kind: z.literal("tree"),
      children: text,
      label: text,
      id: z.optional(text),
    }),
  ]),
);

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

// why: PRD FR-DATA-9 and epic condition C2 — `defaults` takes only the two fields it fills
export const defaultsSchema = z.object({
  type: optional(nodeFields.type),
  predicate: optional(edgeFields.predicate),
});

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
export const nodeSchema = z.catch(
  z.nullable(
    z.union([
      nodeObject,
      z.tuple([text, optional(text), optional(text), optional(attrs)]),
    ]),
  ),
  null,
);

export const edgeSchema = z.catch(
  z.nullable(
    z.union([edgeObject, z.tuple([text, text, text, optional(attrs)])]),
  ),
  null,
);

export const renderInputSchema = z.looseObject({
  schemaVersion: z.catch(z.optional(z.literal(SCHEMA_VERSION)), SCHEMA_VERSION),
  nodes: z.optional(z.array(nodeSchema)),
  edges: z.optional(z.array(edgeSchema)),
  links: z.optional(z.array(edgeSchema)),
  neighborhood: z.optional(
    z.looseObject({
      nodes: z.optional(z.array(nodeSchema)),
      edges: z.optional(z.array(edgeSchema)),
    }),
  ),
  defaults: optional(defaultsSchema),
  types: optional(z.record(z.string(), optional(typeSchema))),
  predicates: optional(z.record(z.string(), optional(predicateSchema))),
  fields: optional(z.record(z.string(), optional(fieldSchema))),
  vocabulary: optional(vocabularySchema),
  view: optional(viewSchema),
  shape: optional(shapeHint),
});

export const issueSchema = z.object({
  code: issueCodeSchema,
  path: z.array(z.union([z.string(), z.number()])),
});

export type RenderInput = z.infer<typeof renderInputSchema>;
export type Issue = z.infer<typeof issueSchema>;
