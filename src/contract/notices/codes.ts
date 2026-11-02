import { z } from "zod/mini";
import { actionNameSchema, type ActionName } from "./actions";

// why: SA §4.2, D11 and the owner ruling 2026-10-15 (`field-rejected`) — the one list of code names
export const noticeCodeSchema = z.enum([
  "no-id",
  "duplicate-id",
  "dangling-edge",
  "unknown-type",
  "constraint-violation",
  "glyph-rejected",
  "color-rejected",
  "rank-rejected",
  "layout-rejected",
  "budget-rejected",
  "schema-version-unknown",
  "inferred-rejected",
  "unknown-key",
  "root-not-found",
  "reveal-not-found",
  "shaped-from",
  "field-rejected",
  "not-object",
  "nodes-not-array",
  "edges-not-array",
  "no-valid-nodes",
  "too-large",
  "not-a-graph",
  "no-data",
  "edges-only",
  "types-off",
  "empty-fallback",
  "error-fallback",
]);

export const severitySchema = z.enum(["fatal", "warning", "empty", "error"]);

export const noticeMetaSchema = z.strictObject({
  severity: severitySchema,
  icon: z.string(),
  actions: z.array(actionNameSchema),
  placeholders: z.array(z.string()),
});

const filled = z.string().check(z.minLength(1));

export const noticeTextSchema = z.strictObject({
  title: filled,
  body: filled,
  user: z.array(filled),
  ai: z.string(),
});

export type Severity = z.infer<typeof severitySchema>;
export type NoticeCode = z.infer<typeof noticeCodeSchema>;
export type NoticeText = z.infer<typeof noticeTextSchema>;

function meta<const S extends Severity>(
  severity: S,
  icon: string,
  actions: ActionName[],
  placeholders: string[] = [],
) {
  return { severity, icon, actions, placeholders };
}

const ALERT = "alert-triangle";

// why: ddr-0052 — warnings show in the DataNotice chip and fatal codes in the error notice;
// both have the mockup alert icon and the copy action (PRD FR-DATA-3)
const warning = (...placeholders: string[]) =>
  meta("warning", ALERT, ["copy"], placeholders);
const fatal = (...placeholders: string[]) =>
  meta("fatal", ALERT, ["copy"], placeholders);

// why: SA §4.2 — each code has exactly one severity; a second key for a code is a type error
const META = {
  "no-id": warning("count"),
  "duplicate-id": warning("count"),
  "dangling-edge": warning("count"),
  "unknown-type": warning("count"),
  "constraint-violation": warning("count"),
  "glyph-rejected": warning("count"),
  "color-rejected": warning("count"),
  "rank-rejected": warning("count"),
  "layout-rejected": warning("count"),
  "budget-rejected": warning(),
  "schema-version-unknown": warning(),
  "inferred-rejected": warning("count"),
  "unknown-key": warning("count"),
  "root-not-found": warning(),
  "reveal-not-found": warning("count"),
  "shaped-from": warning("kind", "count"),
  "field-rejected": warning("count"),
  "not-object": fatal("got"),
  "nodes-not-array": fatal("got"),
  "edges-not-array": fatal("got"),
  "no-valid-nodes": fatal("rawNodes"),
  "too-large": fatal("got", "limit"),
  "not-a-graph": fatal(),
  "no-data": meta("empty", "search-x", []),
  "edges-only": meta("empty", ALERT, ["copy"], ["rawEdges"]),
  "types-off": meta("empty", "nodes", ["show-types"], ["typeCount"]),
  "empty-fallback": meta(
    "empty",
    "search-x",
    ["reset-view", "table"],
    ["rawNodes"],
  ),
  "error-fallback": meta("error", ALERT, ["retry", "table", "copy"]),
} satisfies Record<NoticeCode, z.infer<typeof noticeMetaSchema>>;

export const noticeMeta = z
  .record(noticeCodeSchema, noticeMetaSchema)
  .parse(META);

type CodeOf<S extends Severity> = {
  [C in NoticeCode]: (typeof META)[C]["severity"] extends S ? C : never;
}[NoticeCode];

function codesOf<S extends Severity>(...wanted: S[]): CodeOf<S>[] {
  const severities: Severity[] = wanted;
  return noticeCodeSchema.options.filter((code): code is CodeOf<S> =>
    severities.includes(META[code].severity),
  );
}

// why: SA §4.2, §4.7, D11 — both subsets come from the source enum and the severity map
export const warningCodeSchema = z.enum(codesOf("warning"));
export const issueCodeSchema = z.enum(codesOf("warning", "fatal"));

export type WarningCode = z.infer<typeof warningCodeSchema>;
export type IssueCode = z.infer<typeof issueCodeSchema>;
