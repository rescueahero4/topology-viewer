import type { Lang } from "@qdic-topology/engine";
import { t } from "./strings/index";

// why: rule 7, epic question 14 (Security rounds 1-3) — the input and `url.href` each at most
// 2,048 characters, so the host message is bounded
const LINK_LIMIT = 2048;
// why: rule 7, hand-off item 4 (Security round 4 build condition) — the JSON text of an object
// stops at 1,000 characters and at nesting level 4; the walk stops there too. STORY-004-05 rule 5
// cuts each key, value and line of the predicate tip with the same rule
export const TEXT_LIMIT = 1000;
const JSON_DEPTH = 4;
const CUT = "…";

export const cutText = (text: string) =>
  text.length > TEXT_LIMIT
    ? `${text.slice(0, TEXT_LIMIT - CUT.length)}${CUT}`
    : text;
// why: mockup `fmtDate` (app.js lines 572-575) — a number below 1e12 is seconds, else milliseconds
const MS_FROM = 1e12;
const DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

export type Shown = { text: string; link?: string };

// why: SA §11 Untrusted input, FR-HOST-10 — only `http:` or `https:` after `new URL()`, with no
// user name or password; the visible text and the opened target are the same `url.href`
export function linkOf(text: string): string | null {
  if (text.length > LINK_LIMIT) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url.href.length > LINK_LIMIT ? null : url.href;
}

class Budget {
  readonly parts: string[] = [];
  length = 0;
  get full(): boolean {
    return this.length > TEXT_LIMIT;
  }
  push(text: string): void {
    if (this.full) return;
    const part = text.slice(0, TEXT_LIMIT + 1 - this.length);
    this.parts.push(part);
    this.length += part.length;
  }
}

function scalarJson(value: unknown): string {
  if (typeof value === "string")
    return JSON.stringify(value.slice(0, TEXT_LIMIT + 1));
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "null";
}

// why: the top object is level 1; a container below level 4 shows as "…". Only own keys are read
function walk(value: unknown, level: number, out: Budget): void {
  if (typeof value !== "object" || value === null)
    return out.push(scalarJson(value));
  if (level > JSON_DEPTH) return out.push(CUT);
  const list = Array.isArray(value);
  out.push(list ? "[" : "{");
  let first = true;
  for (const key in value) {
    if (out.full) return;
    if (!Object.hasOwn(value, key)) continue;
    if (!first) out.push(",");
    first = false;
    if (!list) out.push(`${JSON.stringify(key.slice(0, TEXT_LIMIT + 1))}:`);
    walk((value as Record<string, unknown>)[key], level + 1, out);
  }
  out.push(list ? "]" : "}");
}

export function jsonText(value: object): string {
  const out = new Budget();
  walk(value, 1, out);
  return cutText(out.parts.join(""));
}

function itemText(lang: Lang, value: unknown): string {
  if (typeof value === "boolean")
    return t(lang, value ? "inspector.yes" : "inspector.no");
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null) return jsonText(value);
  return "";
}

// why: rule 7 — a boolean is Yes or No, a list is joined with ", ", an object is its bounded JSON
// text; STORY-004-05 uses the same text in the triple tooltip
export function valueText(lang: Lang, value: unknown): string {
  if (Array.isArray(value))
    return value.map((item) => itemText(lang, item)).join(", ");
  return itemText(lang, value);
}

export function shownOf(lang: Lang, value: unknown): Shown {
  const text = valueText(lang, value);
  const link = typeof value === "string" ? linkOf(value) : null;
  return link === null ? { text } : { text: link, link };
}

const formats = new Map<string, Intl.DateTimeFormat>();

// why: SA §4.3 "Dates use `locale`" — a locale that `Intl` refuses falls back to the UI language
function formatOf(locale: string, lang: Lang): Intl.DateTimeFormat {
  const tag = locale === "" ? lang : locale;
  let format = formats.get(tag);
  if (format === undefined) {
    try {
      format = new Intl.DateTimeFormat(tag, DATE);
    } catch {
      format = new Intl.DateTimeFormat(lang, DATE);
    }
    formats.set(tag, format);
  }
  return format;
}

// why: rule 7 (Updated slot) — a number or a string that `Date.parse` reads, in the local time zone;
// any other value gives null and shows as text
export function dateText(
  locale: string,
  lang: Lang,
  value: unknown,
): string | null {
  let time: number;
  if (typeof value === "number") time = value < MS_FROM ? value * 1000 : value;
  else if (typeof value === "string") time = Date.parse(value);
  else return null;
  const date = new Date(time);
  return Number.isNaN(date.getTime())
    ? null
    : formatOf(locale, lang).format(date);
}
