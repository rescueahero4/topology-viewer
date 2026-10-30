import type { EditCode } from "./types";

export type Attrs = Record<string, unknown>;
export type Parsed<T> = { value: T } | { code: EditCode };

// why: STORY-008-09 rule 20 (SA §11 Untrusted input) — a text above this size is blocked before
// any parse, so a 1 MB paste ends at once
export const MAX_TEXT = 100_000;
const MAX_DEPTH = 32;

// why: STORY-008-09 rule 20 — prototype names are never a key of a parsed set or value
const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);

const bad = (code: EditCode = "bad-attributes") => ({ code });

const nullRecord = (entries: [string, unknown][]): Attrs =>
  Object.setPrototypeOf(Object.fromEntries(entries), null) as Attrs;

// why: rule 20 — an own-key walk with a stack and a depth limit, so a deep value cannot overflow it
function checkTree(root: unknown): EditCode | null {
  const stack: [unknown, number][] = [[root, 0]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop() as [unknown, number];
    if (typeof value !== "object" || value === null) continue;
    if (depth > MAX_DEPTH) return "bad-attributes";
    for (const key of Object.keys(value)) {
      if (BLOCKED.has(key)) return "blocked-key";
      stack.push([(value as Attrs)[key], depth + 1]);
    }
  }
  return null;
}

function parseJson(text: string): Parsed<unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return bad("not-json");
  }
  const code = checkTree(value);
  return code === null ? { value } : bad(code);
}

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

// why: STORY-008-09 rule 18 — a value is a number, true/false, `null`, a JSON list, object or
// quoted text when it looks like one, else text; a date stays text in ISO form (`valueKind`)
export function typedValue(raw: string): Parsed<unknown> {
  const text = raw.trim();
  if (text === "") return bad();
  if (/^[[{"]/.test(text)) {
    const parsed = parseJson(text);
    return "code" in parsed && parsed.code === "not-json" ? bad() : parsed;
  }
  if (NUMBER.test(text)) return { value: Number(text) };
  if (text === "true" || text === "false") return { value: text === "true" };
  if (text === "null") return { value: null };
  return { value: text };
}

// why: rule 18 — a comma or a new line outside a quoted text or a bracket ends a pair
function splitPairs(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (quoted) {
      if (char === "\\") at++;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") depth--;
    else if (depth === 0 && (char === "," || char === "\n")) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

function fromPairs(pairs: [string, string][]): Parsed<Attrs> {
  const entries: [string, unknown][] = [];
  const seen = new Set<string>();
  for (const [rawKey, raw] of pairs) {
    const key = rawKey.trim();
    if (key === "" || seen.has(key)) return bad();
    if (BLOCKED.has(key)) return bad("blocked-key");
    const typed = typedValue(raw);
    if ("code" in typed) return typed;
    seen.add(key);
    entries.push([key, typed.value]);
  }
  return { value: nullRecord(entries) };
}

function parseList(text: string): Parsed<Attrs> {
  const pairs: [string, string][] = [];
  for (const part of splitPairs(text)) {
    const at = part.indexOf("=");
    if (at < 0) return bad();
    pairs.push([part.slice(0, at), part.slice(at + 1)]);
  }
  return fromPairs(pairs);
}

function parseObject(text: string): Parsed<Attrs> {
  const parsed = parseJson(text);
  if ("code" in parsed)
    return parsed.code === "not-json" ? bad() : bad(parsed.code);
  const { value } = parsed;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return bad();
  return { value: nullRecord(Object.entries(value)) };
}

const ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

// why: rule 20 — only the five XML names decode; any other `&` form is bad input (no entity table)
function decoded(text: string): string | null {
  let ok = true;
  const out = text.replace(/&([^;&]*);?/g, (all, name: string) => {
    if (all.endsWith(";") && Object.hasOwn(ENTITIES, name))
      return ENTITIES[name];
    ok = false;
    return "";
  });
  return ok ? out : null;
}

const NAME = "[A-Za-z_][\\w.-]*";
const ELEMENT = new RegExp(`^<(${NAME})\\s*>([^<]*)</(${NAME})\\s*>`);
const EMPTY = new RegExp(`^<(${NAME})\\s*/>`);

// why: rule 18, rule 20 — simple XML is a list of `<key>text</key>` (or `<key/>`) elements, with an
// optional single wrapper element; it is read by an own scanner, never by a DOM parser, so a
// `DOCTYPE`, an entity declaration, a comment, an attribute or a nested element is bad input
function parseXml(text: string): Parsed<Attrs> {
  let rest = text.replace(/^<\?xml[^?<>]*\?>\s*/, "");
  if (rest.includes("<!") || rest.includes("<?")) return bad();
  const wrapper = new RegExp(`^<(${NAME})\\s*>([\\s\\S]*)</(${NAME})\\s*>$`);
  const wrapped = wrapper.exec(rest);
  if (wrapped !== null && wrapped[1] === wrapped[3] && /^\s*</.test(wrapped[2]))
    rest = wrapped[2].trim();
  const pairs: [string, string][] = [];
  while (rest !== "") {
    const full = ELEMENT.exec(rest);
    const empty = full === null ? EMPTY.exec(rest) : null;
    if (full !== null && full[1] === full[3]) {
      const value = decoded(full[2]);
      if (value === null) return bad();
      pairs.push([full[1], value.trim() === "" ? '""' : value]);
      rest = rest.slice(full[0].length).trim();
    } else if (empty !== null) {
      pairs.push([empty[1], '""']);
      rest = rest.slice(empty[0].length).trim();
    } else return bad();
  }
  return fromPairs(pairs);
}

// why: STORY-008-09 rules 18, 20 — the whole attribute set from one text: a JSON object, simple
// XML, or `key=value` pairs; an empty text is an empty set. Pure: no DOM, no `eval`
export function parseAttributes(text: string): Parsed<Attrs> {
  if (text.length > MAX_TEXT) return bad("too-long");
  const trimmed = text.trim();
  if (trimmed === "") return { value: nullRecord([]) };
  if (trimmed.startsWith("{")) return parseObject(trimmed);
  if (trimmed.startsWith("<")) return parseXml(trimmed);
  return parseList(trimmed);
}

// why: STORY-008-09 rule 19 — a list or an object attribute cell takes valid JSON of the same kind
export function parseJsonCell(
  text: string,
  want: "list" | "object",
): Parsed<unknown> {
  if (text.length > MAX_TEXT) return bad("too-long");
  const parsed = parseJson(text.trim());
  if ("code" in parsed) return parsed;
  const { value } = parsed;
  const list = Array.isArray(value);
  const object = typeof value === "object" && value !== null && !list;
  return (want === "list" ? list : object) ? { value } : bad("not-json");
}

const PLAIN_KEY = /^[^\s=,"[{<][^=,\n]*$/;

function plainText(value: string): boolean {
  if (value !== value.trim() || value === "") return false;
  if (/[,\n]/.test(value)) return false;
  const typed = typedValue(value);
  return "value" in typed && typed.value === value;
}

// why: rule 18 — the text that the field shows: `key=value` pairs that read back to the same set,
// or a JSON object when a key does not fit that form
export function attributesSource(attrs: Readonly<Attrs>): string {
  const keys = Object.keys(attrs);
  if (keys.some((key) => !PLAIN_KEY.test(key) || key.trim() !== key))
    return JSON.stringify(nullRecord(keys.map((k) => [k, attrs[k]])));
  return keys
    .map((key) => {
      const value = attrs[key];
      const text =
        typeof value === "string" && plainText(value)
          ? value
          : JSON.stringify(value ?? null);
      return `${key}=${text}`;
    })
    .join(", ");
}
