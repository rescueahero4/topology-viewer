import type { Lang } from "@qdic-topology/engine";
import { en } from "./en";
import { ja } from "./ja";

export type Key = keyof typeof en;
export type Values = Readonly<Record<string, string | number>>;
type Text = string | { readonly one: string; readonly other: string };

const TABLES: Readonly<Record<Lang, Readonly<Record<Key, Text>>>> = { en, ja };
// why: the engine `fill` rule (data/notices.ts) — a placeholder with no value reads as a dash
const MISSING = "—";
const PLACEHOLDER = /\{(\w+)\}/g;
const numbers = new Map<Lang, Intl.NumberFormat>();

function formatted(lang: Lang, value: number): string {
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
export function t(lang: Lang, key: Key, values: Values = {}): string {
  const text = TABLES[lang][key];
  const template =
    typeof text === "string"
      ? text
      : Object.hasOwn(values, "count") && values.count === 1
        ? text.one
        : text.other;
  return template.replace(PLACEHOLDER, (_, name: string) => {
    if (!Object.hasOwn(values, name)) return MISSING;
    const value = values[name];
    return typeof value === "number" ? formatted(lang, value) : value;
  });
}

// why: PRD NF-10 — Japanese when the locale starts with "ja" in any case, else English
export function langOf(locale: string | undefined): Lang {
  return (locale ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
}
