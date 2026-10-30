export type Attrs = Record<string, unknown>;

// why: SA v0.12 §4.1 — the nesting cap of 64 levels; the attrs object is level 1 (question 16)
const DEPTH_CAP = 64;

function isNested(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

// why: question 16, SA ruling S6 — an explicit stack, so a 10,000-level value never overflows
export function tooDeep(value: unknown): boolean {
  const stack: [unknown, number][] = [[value, 2]];
  while (stack.length > 0) {
    const [item, level] = stack.pop() as [unknown, number];
    if (!isNested(item)) continue;
    if (level > DEPTH_CAP) return true;
    for (const child of Object.values(item)) stack.push([child, level + 1]);
  }
  return false;
}

export function guardDepth(attrs: Attrs): { attrs: Attrs; dropped: boolean } {
  const kept: Attrs = Object.create(null) as Attrs;
  let dropped = false;
  for (const [key, value] of Object.entries(attrs)) {
    if (tooDeep(value)) dropped = true;
    else kept[key] = value;
  }
  return { attrs: kept, dropped };
}

// why: epic condition C5 — order by code point only, so every host gives the same order
export function byCodePoint(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length) {
    const x = a.codePointAt(i) as number;
    const y = b.codePointAt(i) as number;
    if (x !== y) return x - y;
    i += x > 0xffff ? 2 : 1;
  }
  return a.length - b.length;
}

// why: mockup `stableJson` (lib/topology.js lines 374-376) — sorted keys, so a structure never
// equals a joined string (S17)
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isNested(value)) {
    const record = value as Attrs;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(byCodePoint);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// why: mockup `hash` (lib/topology.js lines 142-146) — 32-bit FNV-1a over UTF-16 code units
export function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
