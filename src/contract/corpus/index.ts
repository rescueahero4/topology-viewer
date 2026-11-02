import { z } from "zod";
import { notices, type NoticeCode, type WarningCode } from "../notices";

const text = z.string().min(1);

function isCode(value: string): value is NoticeCode {
  return notices.codes.some((code) => code === value);
}

function isWarning(value: string): value is WarningCode {
  return isCode(value) && notices.severity[value] === "warning";
}

const unknownCode = (what: string) => ({
  error: (issue: { input?: unknown }) =>
    `${JSON.stringify(issue.input)} is not ${what}`,
});

const noticeCode = z.string().refine(isCode, unknownCode("a notice code"));
const warningCode = z.string().refine(isWarning, unknownCode("a warning code"));
const schemaVerdict = z
  .string()
  .refine(
    (value) =>
      value === "pass" ||
      (isCode(value) && notices.severity[value] === "fatal"),
    unknownCode('"pass" or a fatal code'),
  );

export const storySchema = z.strictObject({ prompt: text, text });

export const firstPaintSchema = z
  .strictObject({
    approach: z.enum(["active", "passive"]),
    selected: z.string().nullable(),
  })
  .refine((paint) => paint.approach === "active" || paint.selected === null, {
    error: "a passive first paint selects nothing",
  });

export const expectSchema = z.strictObject({
  schema: schemaVerdict,
  firstPaint: firstPaintSchema,
  notice: noticeCode.nullable(),
  warnings: z.partialRecord(warningCode, z.number().int().min(1)),
});

export const fixtureFileSchema = z
  .strictObject({
    key: text,
    group: text,
    label: text,
    tests: text,
    story: storySchema.nullable(),
    expect: expectSchema,
    graph: z.unknown().optional(),
    dataset: text.optional(),
    view: z.unknown().optional(),
  })
  .superRefine((file, ctx) => {
    const hasGraph = "graph" in file;
    const hasDataset = file.dataset !== undefined;
    if (hasGraph === hasDataset)
      ctx.addIssue({
        code: "custom",
        message: 'exactly one of "graph" or "dataset" is required',
      });
    if ("view" in file && !hasDataset)
      ctx.addIssue({ code: "custom", message: '"view" needs "dataset"' });
  });

export const datasetFileSchema = z.strictObject({
  key: text,
  label: text,
  description: text,
  graph: z.record(z.string(), z.unknown()),
  story: storySchema.nullable(),
});

export type Story = z.infer<typeof storySchema>;
export type FirstPaint = z.infer<typeof firstPaintSchema>;
export type Expect = z.infer<typeof expectSchema>;
export type FixtureFile = z.infer<typeof fixtureFileSchema>;
export type DatasetFile = z.infer<typeof datasetFileSchema>;

function load<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`Invalid ${what}:\n${lines.join("\n")}`);
  }
  return result.data;
}

export const loadFixtureFile = (raw: unknown): FixtureFile =>
  load(fixtureFileSchema, raw, "fixture file");

export const loadDatasetFile = (raw: unknown): DatasetFile =>
  load(datasetFileSchema, raw, "dataset file");
