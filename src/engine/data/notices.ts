import {
  notices,
  type GotToken,
  type Issue,
  type Notice,
  type NoticeCode,
  type WarningCode,
  type WarningEntry,
} from "#contract";
import type { Shaped } from "./shape";

export type Lang = "en" | "ja";
export type Info = Readonly<Record<string, unknown>>;
export type NoticeEntry = Notice & { code: NoticeCode };
export type EmptyCode =
  "no-data" | "edges-only" | "types-off" | "empty-fallback";
export type CanvasStats = {
  rawNodes: number;
  rawEdges: number;
  drawn: number;
  typesTotal: number;
  typesOff: number;
};

// why: mockup `fill` (app.js line 134) — a missing value reads as a dash in both languages
const MISSING = "—";
// why: question 6 and SA §11 Untrusted input — bounded ids and values in every notice
const VALUE_LIMIT = 200;
const ID_LIMIT = 64;
const ID_COUNT = 5;
// why: PRD FR-DATA-3 — the codes of the DataNotice chip, in catalog order
const CHIP_CODES = [
  "no-id",
  "duplicate-id",
  "dangling-edge",
  "unknown-type",
] as const satisfies WarningCode[];

const PLACEHOLDER = /\{(\w+)\}/g;

function isCode(code: string): code is NoticeCode {
  return notices.codes.some((known) => known === code);
}

function isWarning(code: NoticeCode): code is WarningCode {
  return notices.severity[code] === "warning";
}

function cut(text: string, limit: number): string {
  const points = Array.from(text);
  return points.length > limit ? points.slice(0, limit).join("") : text;
}

const SHAPED_FROM = "shaped-from";

// why: STORY-002-02 Context — the contract `Issue` has no count, so the `shaped-from` count is the
// number of shaped edges that `shape` returns beside its issues
export function warningEntries(
  issues: readonly Issue[],
  shaped?: Shaped,
): WarningEntry[] {
  return notices.codes.filter(isWarning).flatMap((code) => {
    const found = issues.filter((issue) => issue.code === code);
    if (found.length === 0) return [];
    const ids = found
      .flatMap((issue) => {
        const last = issue.path[issue.path.length - 1];
        return last === undefined ? [] : [cut(String(last), ID_LIMIT)];
      })
      .slice(0, ID_COUNT);
    const count =
      code === SHAPED_FROM && shaped !== undefined
        ? shaped.count
        : found.length;
    return [{ code, count, ids }];
  });
}

// why: STORY-002-09 T1 number rule — a comma after each group of three digits, in both languages
// (epic condition C5: no locale API)
function digits(count: number): string {
  const text = String(count);
  return /^\d+$/.test(text) ? text.replace(/\B(?=(\d{3})+$)/g, ",") : text;
}

function measureText(value: unknown, lang: Lang): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { unit, count } = value as { unit?: unknown; count?: unknown };
  const templates = notices.measure[lang];
  if (typeof unit !== "string" || !Object.hasOwn(templates, unit))
    return undefined;
  if (typeof count !== "number") return undefined;
  return fill(templates[unit as keyof typeof templates], { count }, lang);
}

function tokenText(key: string, value: string, lang: Lang): string {
  const got = notices.got[lang];
  if (key === "got" && Object.hasOwn(got, value)) return got[value as GotToken];
  const kind = notices.kind[lang];
  if (key === "kind" && Object.hasOwn(kind, value))
    return kind[value as keyof typeof kind];
  return value;
}

function valueText(key: string, value: unknown, lang: Lang) {
  if (typeof value === "number") return digits(value);
  if (typeof value === "string") return tokenText(key, value, lang);
  return measureText(value, lang);
}

// why: SA §11 Untrusted input — one pass; each value goes in as literal text (a `$&` or a
// `{name}` in a value is not expanded) and is cut to 200 characters
export function fill(template: string, info: Info, lang: Lang): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = Object.hasOwn(info, key)
      ? valueText(key, info[key], lang)
      : undefined;
    return value === undefined ? MISSING : cut(value, VALUE_LIMIT);
  });
}

export function noticeText(code: string, info: Info, lang: Lang): NoticeEntry {
  const known = isCode(code) ? code : "error-fallback";
  const notice = notices[lang][known];
  return {
    ...notice,
    code: known,
    title: fill(notice.title, info, lang),
    body: fill(notice.body, info, lang),
    user: notice.user.map((line) => fill(line, info, lang)),
    ai: fill(notice.ai, info, lang),
  };
}

function compose(line: string, name: string, text: string): string {
  return line.split(`{${name}}`).join(text);
}

// why: mockup `noticeText` (app.js lines 138-142) — no "How to fix it" line for an empty `ai`
// text and no "Details" line without a detail
export function copyMessage(
  code: string,
  info: Info,
  lang: Lang,
  detail?: string,
): string {
  const known = isCode(code) ? code : "error-fallback";
  const notice = notices[lang][known];
  const [head, body, ai, details] = notices.copyMessage[lang].split("\n");
  const lines = [
    compose(head, "title", notice.title),
    compose(body, "body", notice.body),
  ];
  if (notice.ai !== "") lines.push(compose(ai, "ai", notice.ai));
  if (detail !== undefined) lines.push(details);
  return fill(lines.join("\n"), { ...info, detail }, lang);
}

export function dataNoticeLines(
  warnings: readonly WarningEntry[],
  lang: Lang,
): string[] {
  return CHIP_CODES.flatMap((code) => {
    const entry = warnings.find((warning) => warning.code === code);
    if (entry === undefined) return [];
    return [fill(notices[lang][code].body, { count: entry.count }, lang)];
  });
}

// why: mockup `emptyCase` (app.js lines 159-165) — the empty notice of a chart with nothing drawn
export function canvasNotice(
  stats: CanvasStats,
): { code: EmptyCode; info: Info } | null {
  if (stats.drawn > 0) return null;
  if (stats.rawNodes === 0)
    return stats.rawEdges > 0
      ? { code: "edges-only", info: { rawEdges: stats.rawEdges } }
      : { code: "no-data", info: {} };
  if (stats.typesTotal > 0 && stats.typesOff === stats.typesTotal)
    return { code: "types-off", info: { typeCount: stats.typesTotal } };
  return { code: "empty-fallback", info: { rawNodes: stats.rawNodes } };
}
