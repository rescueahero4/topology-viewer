import { z } from "zod/mini";
import { en } from "zod/locales";
import { notices, type NoticeCode, type WarningCode } from "../notices";

const text = z.string().check(z.minLength(1));

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

// why: the type guard keeps the narrow output type that the refine of classic zod gave
const codeOf = <T extends string>(
  guard: (value: string) => value is T,
  what: string,
) =>
  z
    .string()
    .check(z.refine(guard, unknownCode(what))) as unknown as z.ZodMiniType<
    T,
    string
  >;

const noticeCode = codeOf(isCode, "a notice code");
const warningCode = codeOf(isWarning, "a warning code");
const schemaVerdict = z
  .string()
  .check(
    z.refine(
      (value) =>
        value === "pass" ||
        (isCode(value) && notices.severity[value] === "fatal"),
      unknownCode('"pass" or a fatal code'),
    ),
  );

export const storySchema = z.strictObject({ prompt: text, text });

export const firstPaintSchema = z
  .strictObject({
    approach: z.enum(["active", "passive"]),
    selected: z.nullable(z.string()),
  })
  .check(
    z.refine(
      (paint) => paint.approach === "active" || paint.selected === null,
      {
        error: "a passive first paint selects nothing",
      },
    ),
  );

export const expectSchema = z.strictObject({
  schema: schemaVerdict,
  firstPaint: firstPaintSchema,
  notice: z.nullable(noticeCode),
  warnings: z.partialRecord(
    warningCode,
    z.number().check(z.int(), z.minimum(1)),
  ),
});

export const fixtureFileSchema = z
  .strictObject({
    key: text,
    group: text,
    label: text,
    tests: text,
    story: z.nullable(storySchema),
    expect: expectSchema,
    graph: z.optional(z.unknown()),
    dataset: z.optional(text),
    view: z.optional(z.unknown()),
  })
  .check((ctx) => {
    const file = ctx.value;
    const fail = (message: string) =>
      ctx.issues.push({ code: "custom", message, input: file });
    const hasGraph = "graph" in file;
    const hasDataset = file.dataset !== undefined;
    if (hasGraph === hasDataset)
      fail('exactly one of "graph" or "dataset" is required');
    if ("view" in file && !hasDataset) fail('"view" needs "dataset"');
  });

export const datasetFileSchema = z.strictObject({
  key: text,
  label: text,
  description: text,
  graph: z.record(z.string(), z.unknown()),
  story: z.nullable(storySchema),
});

export type Story = z.infer<typeof storySchema>;
export type FirstPaint = z.infer<typeof firstPaintSchema>;
export type Expect = z.infer<typeof expectSchema>;
export type FixtureFile = z.infer<typeof fixtureFileSchema>;
export type DatasetFile = z.infer<typeof datasetFileSchema>;

function load<T>(schema: z.ZodMiniType<T>, raw: unknown, what: string): T {
  // why: zod/mini loads no locale, so the built-in messages come from here
  const result = schema.safeParse(raw, { error: en().localeError });
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
