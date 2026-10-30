import { stableJson, tooDeep } from "../data/hash";
import type { Triple } from "../data/merge";
import type { Graph } from "../data/normalize";
import { locate } from "./apply";
import { isDate } from "./check";
import type { CellChange, EditCode, RowKind, RowRef } from "./types";

export type AttrEntry = [string, unknown];
export type ReadSet = { entries: AttrEntry[] } | { code: EditCode };

// why: SA §4.8 addendum 0.33 (6) Limits — the text cap, checked before any parse
export const MAX_TEXT = 1_000_000;

// why: addendum 0.33 (6) The set — these three edge names always mean the triple fields
const NAMED: readonly [string, "validFrom" | "validTo" | "isActive"][] = [
  ["valid_from", "validFrom"],
  ["valid_to", "validTo"],
  ["isActive", "isActive"],
];

// why: addendum 0.33 (6) — the own columns and the `_` keys are not in a node set; the edge System
// and Description columns are not in an edge set (addendum 0.33.1)
const OWN_COLUMNS = new Set(["service_name", "description"]);
const reserved = (key: string) => OWN_COLUMNS.has(key) || key.startsWith("_");

const own = (attrs: Readonly<Record<string, unknown>>, key: string) =>
  Object.hasOwn(attrs, key) ? attrs[key] : undefined;

// why: addendum 0.33 (6) The set — node: the own `attrs` keys but the own columns and `_` keys;
// edge: the own `attrs` keys, then the named facts that the triple has
export function attributeSet(
  kind: RowKind,
  item: { attrs: Readonly<Record<string, unknown>> } & Partial<Triple>,
): AttrEntry[] {
  const keys = Object.keys(item.attrs);
  if (kind === "node")
    return keys.filter((k) => !reserved(k)).map((k) => [k, own(item.attrs, k)]);
  const set: AttrEntry[] = keys
    .filter((k) => !OWN_COLUMNS.has(k))
    .map((k) => [k, own(item.attrs, k)]);
  for (const [key, field] of NAMED)
    if (item[field] !== undefined) set.push([key, item[field]]);
  return set;
}

// why: SA §5 Errors — a bad text is no programmer error; `readAttributes` turns it into its code
class Bad extends Error {
  constructor(readonly code: EditCode) {
    super(code);
  }
}

const fail = (code: EditCode): never => {
  throw new Bad(code);
};

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function parseJson(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail("bad-json");
  }
  if (tooDeep(value)) fail("too-large");
  return value;
}

// why: addendum 0.33 (6) Value kind — on the trimmed raw text: true/false, null, the JSON number
// form, a JSON value by its first character, else text (`01234` stays text)
function typed(raw: string): unknown {
  const text = raw.trim();
  if (text === "true" || text === "false") return text === "true";
  if (text === "null") return null;
  if (NUMBER.test(text) && Number.isFinite(Number(text))) return Number(text);
  if (/^[[{"]/.test(text)) return parseJson(text);
  return text;
}

const isSpace = (char: string | undefined) =>
  char === " " || char === "\t" || char === "\n" || char === "\r";

type Scan = { text: string; at: number };

function skip(scan: Scan) {
  while (isSpace(scan.text[scan.at])) scan.at++;
}

// why: addendum 0.33 (6) (a) — the end of a JSON value from its first character, with string
// escapes respected; one forward pass
function jsonEnd(scan: Scan): number {
  const { text } = scan;
  let depth = 0;
  let quoted = false;
  for (let at = scan.at; at < text.length; at++) {
    const char = text[at];
    if (quoted) {
      if (char === "\\") at++;
      else if (char === '"') {
        quoted = false;
        if (depth === 0) return at + 1;
      }
    } else if (char === '"') quoted = true;
    else if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") {
      depth--;
      if (depth === 0) return at + 1;
    }
  }
  return fail("bad-json");
}

function readKey(scan: Scan): string {
  const { text } = scan;
  if (text[scan.at] === '"') {
    const end = jsonEnd(scan);
    const key = parseJson(text.slice(scan.at, end));
    scan.at = end;
    skip(scan);
    if (typeof key !== "string") fail("bad-syntax");
    return key as string;
  }
  const start = scan.at;
  while (scan.at < text.length && text[scan.at] !== "=") {
    if (text[scan.at] === "," || text[scan.at] === '"') fail("bad-syntax");
    scan.at++;
  }
  return text.slice(start, scan.at).trim();
}

function readValue(scan: Scan): unknown {
  const { text } = scan;
  if (/[[{"]/.test(text[scan.at] ?? "")) {
    const end = jsonEnd(scan);
    const value = parseJson(text.slice(scan.at, end));
    scan.at = end;
    skip(scan);
    if (scan.at < text.length && text[scan.at] !== ",") fail("bad-syntax");
    return value;
  }
  const start = scan.at;
  while (scan.at < text.length && text[scan.at] !== ",") scan.at++;
  return typed(text.slice(start, scan.at));
}

// why: addendum 0.33 (6) (a) — `key=value` pairs split by a top-level comma
function readPairs(text: string): AttrEntry[] {
  const scan = { text, at: 0 };
  const entries: AttrEntry[] = [];
  for (;;) {
    skip(scan);
    if (scan.at >= text.length) fail("bad-syntax");
    const key = readKey(scan);
    if (text[scan.at] !== "=") fail("bad-syntax");
    scan.at++;
    skip(scan);
    entries.push([key, readValue(scan)]);
    if (scan.at >= text.length) return entries;
    scan.at++;
  }
}

// why: addendum 0.33 (6) (b) — a JSON object; each value keeps its JSON kind
function readObject(text: string): AttrEntry[] {
  const value = parseJson(text);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail("bad-json");
  return Object.entries(value as object);
}

const ENTITIES = new Map([
  ["lt", "<"],
  ["gt", ">"],
  ["amp", "&"],
  ["quot", '"'],
  ["apos", "'"],
]);

// why: §11 addendum 0.33 (3) — the five XML names and a numeric reference to a Unicode scalar
// value other than 0; no other reference decodes, so no entity expands
function reference(name: string): string {
  const named = ENTITIES.get(name);
  if (named !== undefined) return named;
  const digits = /^#(?:x([0-9A-Fa-f]{1,6})|(\d{1,7}))$/.exec(name);
  if (digits === null) return fail("bad-xml");
  const point =
    digits[1] === undefined ? Number(digits[2]) : parseInt(digits[1], 16);
  const scalar =
    point > 0 && point <= 0x10ffff && (point < 0xd800 || point > 0xdfff);
  return scalar ? String.fromCodePoint(point) : fail("bad-xml");
}

const NAME_START = /^[\p{L}_]$/u;
const NAME_PART = /^[\p{L}\p{N}_.-]$/u;

function xmlName(scan: Scan): string {
  const { text } = scan;
  const start = scan.at;
  if (!NAME_START.test(text[scan.at] ?? "")) fail("bad-xml");
  scan.at++;
  while (NAME_PART.test(text[scan.at] ?? "")) scan.at++;
  return text.slice(start, scan.at);
}

function xmlText(scan: Scan): string {
  const { text } = scan;
  let out = "";
  while (scan.at < text.length && text[scan.at] !== "<") {
    if (text[scan.at] !== "&") {
      out += text[scan.at++];
      continue;
    }
    const end = text.indexOf(";", scan.at);
    if (end < 0 || end - scan.at > 10) fail("bad-xml");
    out += reference(text.slice(scan.at + 1, end));
    scan.at = end + 1;
  }
  return out;
}

function expect(scan: Scan, part: string) {
  if (!scan.text.startsWith(part, scan.at)) fail("bad-xml");
  scan.at += part.length;
}

// why: addendum 0.33 (6) (c) — an own scanner of `ws (element ws)*`, element `<name>text</name>`;
// `<!`, `<?`, an attribute, `<a/>`, a nested element, a wrong closing tag or outside text is bad
function readXml(text: string): AttrEntry[] {
  const scan = { text, at: 0 };
  const entries: AttrEntry[] = [];
  skip(scan);
  while (scan.at < text.length) {
    expect(scan, "<");
    const name = xmlName(scan);
    expect(scan, ">");
    const value = xmlText(scan);
    expect(scan, "</");
    if (xmlName(scan) !== name) fail("bad-xml");
    expect(scan, ">");
    entries.push([name, typed(value)]);
    skip(scan);
  }
  return entries;
}

function checked(entries: AttrEntry[], kind: RowKind): AttrEntry[] {
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (key === "") fail("empty-key");
    if (seen.has(key)) fail("duplicate-key");
    seen.add(key);
    if (kind === "node" ? reserved(key) : OWN_COLUMNS.has(key))
      fail("reserved-key");
    if (kind === "edge" && (key === "valid_from" || key === "valid_to"))
      if (typeof value !== "string" || !isDate(value)) fail("not-a-date");
    if (kind === "edge" && key === "isActive" && typeof value !== "boolean")
      fail("not-a-boolean");
  }
  return entries;
}

// why: SA §4.8 addendum 0.33 (6), §11 addendum 0.33 — the whole attribute set from one text: the
// first character after a trim picks the form; pure, one forward pass, no DOM, no `eval`
export function readAttributes(text: string, kind: RowKind): ReadSet {
  if (text.length > MAX_TEXT) return { code: "too-large" };
  const trimmed = text.trim();
  try {
    if (trimmed === "") return { entries: [] };
    const first = trimmed[0];
    const entries =
      first === "{"
        ? readObject(trimmed)
        : first === "<"
          ? readXml(trimmed)
          : readPairs(trimmed);
    return { entries: checked(entries, kind) };
  } catch (error) {
    if (error instanceof Bad) return { code: error.code };
    throw error;
  }
}

// why: addendum 0.33 (7) — a list or an object cell takes valid JSON of either kind
export function readJsonCell(
  text: string,
): { value: unknown } | { code: EditCode } {
  if (text.length > MAX_TEXT) return { code: "too-large" };
  try {
    const value = parseJson(text.trim());
    if (typeof value !== "object" || value === null)
      return { code: "bad-json" };
    return { value };
  } catch (error) {
    if (error instanceof Bad) return { code: error.code };
    throw error;
  }
}

function bareKey(key: string): boolean {
  if (key === "" || key !== key.trim() || /^[{<["]/.test(key)) return false;
  return !/[=,"]/.test(key);
}

function bareValue(value: string): boolean {
  if (value !== value.trim() || value.includes(",")) return false;
  try {
    return typed(value) === value;
  } catch {
    return false;
  }
}

// why: addendum 0.33 (6) Writer — `key=value` pairs that `readAttributes` reads back to the same set
export function writeAttributes(set: readonly AttrEntry[]): string {
  return set
    .map(([key, value]) => {
      const name = bareKey(key) ? key : JSON.stringify(key);
      const text =
        typeof value === "string" && bareValue(value)
          ? value
          : (JSON.stringify(value) ?? "null");
      return `${name}=${text}`;
    })
    .join(", ");
}

// why: addendum 0.33 (6) Replace — one change for each new or changed key in text order, then one
// `after: undefined` for each key of the set that the text does not hold; equal keys give none
export function attributeChanges(
  graph: Graph,
  row: RowRef,
  entries: readonly AttrEntry[],
): CellChange[] {
  const { kind, index } = locate(graph, row);
  const item = kind === "node" ? graph.records[index] : graph.triples[index];
  const set = new Map(attributeSet(kind, item));
  const column = (key: string) =>
    kind === "node" ? { attr: key } : { fact: key };
  const changes: CellChange[] = [];
  const named = new Set<string>();
  for (const [key, after] of entries) {
    named.add(key);
    const before = set.get(key);
    if (set.has(key) && stableJson(before) === stableJson(after)) continue;
    changes.push({ row, column: column(key), before, after });
  }
  for (const [key, before] of set)
    if (!named.has(key))
      changes.push({ row, column: column(key), before, after: undefined });
  return changes;
}
