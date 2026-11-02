import { z } from "zod";

const text = z.string().min(1);
const count = z.number().int().min(0);

// why: STORY-002-09 T1 — the tokens follow the mockup `kindOf` order (lib/topology.js line 336)
export const gotTokenSchema = z.enum([
  "array",
  "string",
  "number",
  "boolean",
  "null",
  "object",
  "missing",
]);

export const measureSchema = z.strictObject({
  unit: z.enum(["nodes", "edges", "kb", "levels"]),
  count,
});

export const shapedKindSchema = z.enum(["rows", "tree"]);

// why: SA §4.7 and epic condition C4 — one type, with the delivered placeholders of each fatal code
export const fatalInfoSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("not-object"), got: gotTokenSchema }),
  z.strictObject({ code: z.literal("nodes-not-array"), got: gotTokenSchema }),
  z.strictObject({ code: z.literal("edges-not-array"), got: gotTokenSchema }),
  z.strictObject({ code: z.literal("no-valid-nodes"), rawNodes: count }),
  z.strictObject({
    code: z.literal("too-large"),
    got: measureSchema,
    limit: measureSchema,
  }),
  z.strictObject({ code: z.literal("not-a-graph") }),
]);

export const valueTextsSchema = z.strictObject({
  got: z.record(gotTokenSchema, text),
  measure: z.record(measureSchema.shape.unit, text),
  kind: z.record(shapedKindSchema, text),
});

export type FatalInfo = z.infer<typeof fatalInfoSchema>;
export type GotToken = z.infer<typeof gotTokenSchema>;
export type Measure = z.infer<typeof measureSchema>;
