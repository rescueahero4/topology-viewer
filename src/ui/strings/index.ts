import type { Lang } from "#engine";
import { en } from "./en";
import { ja } from "./ja";

export type Key = keyof typeof en;
export type Values = Readonly<Record<string, string | number>>;
type Text = string | { readonly one: string; readonly other: string };

const TABLES: Readonly<Record<Lang, Readonly<Record<Key, Text>>>> = { en, ja };
// why: the engine `fill` rule (data/notices.ts) — a placeholder with no value reads as a dash;
// STORY-004-04 shows an empty slot and an empty path segment with the same dash (question 10)
export const MISSING = "—";
const PLACEHOLDER = /\{(\w+)\}/g;
const numbers = new Map<Lang, Intl.NumberFormat>();
const overrides: Partial<Record<Lang, Readonly<Record<string, string>>>> = {};

// A viewer on a page can replace interface text by key, for the language that it shows.
export function overrideStrings(
  lang: Lang,
  strings: Readonly<Record<string, string>> | undefined,
): void {
  overrides[lang] = strings;
}

export function formatted(lang: Lang, value: number): string {
  let format = numbers.get(lang);
  if (format === undefined) {
    format = new Intl.NumberFormat(lang);
    numbers.set(lang, format);
  }
  return format.format(value);
}

// why: rule 16 — a key that comes from a model or profile name is checked as an own key first
export function isKey(key: string): key is Key {
  return Object.hasOwn(en, key);
}

// why: rule 6 — `one` for the count 1 and `other` for every other count; numbers in the format of
// the UI language; the template is read once, so a value that holds `{x}` stays as it is
function templateOf(lang: Lang, key: Key, values: Values): string {
  const text = overrides[lang]?.[key] ?? TABLES[lang][key];
  if (typeof text === "string") return text;
  return Object.hasOwn(values, "count") && values.count === 1
    ? text.one
    : text.other;
}

function fill(lang: Lang, template: string, values: Values): string {
  return template.replace(PLACEHOLDER, (_, name: string) => {
    if (!Object.hasOwn(values, name)) return MISSING;
    const value = values[name];
    return typeof value === "number" ? formatted(lang, value) : value;
  });
}

export function t(lang: Lang, key: Key, values: Values = {}): string {
  return fill(lang, templateOf(lang, key, values), values);
}

// why: STORY-004-03 rule 2 — one placeholder of a text goes into its own element (a number in
// bold, the +N chip), so each language keeps its own word order around it
export function tAround(
  lang: Lang,
  key: Key,
  slot: string,
  values: Values = {},
): [string, string] {
  const [before, after = ""] = templateOf(lang, key, values).split(`{${slot}}`);
  return [fill(lang, before, values), fill(lang, after, values)];
}

// why: PRD NF-10 — Japanese when the locale starts with "ja" in any case, else English
export function langOf(locale: string | undefined): Lang {
  return (locale ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
}
