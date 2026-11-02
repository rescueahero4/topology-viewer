import { z } from "zod";
import { approachSchema } from "./input";
import { warningCodeSchema } from "./notices/codes";
import { SCHEMA_VERSION } from "./schemaVersion";

const count = z.number().int().min(0);

// why: SA §4.2 and D4 — ChatGPT shows `structuredContent` to the model, so it holds counts only
export const structuredContentSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  entities: count,
  records: count,
  relationships: count,
  root: z.string(),
  approach: approachSchema,
  warningCount: count,
});

export const warningEntrySchema = z.strictObject({
  code: warningCodeSchema,
  count,
  ids: z.array(z.string()),
});

export type StructuredContent = z.infer<typeof structuredContentSchema>;
export type WarningEntry = z.infer<typeof warningEntrySchema>;
