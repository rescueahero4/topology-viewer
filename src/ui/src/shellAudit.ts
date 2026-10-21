// why: rule 14 (Security round 1 item 2) — each hostile value starts with its own marker of six
// letters and digits, then the characters that break HTML and URLs; one value has 10,000 characters
const TAIL = `"<>&javascript:`;
const value = (n: number) => `qxm${String(n).padStart(3, "0")}${TAIL}`;
const COUNT = 30;
export const MARKERS: readonly string[] = Array.from(
  { length: COUNT },
  (_, i) => value(i + 1).slice(0, 6),
);

// why: rule 14, rule 16 — the prototype names are real names in the engine (`data/pollution.test.ts`
// lines 33-78); `__proto__` as an own key needs JSON text, because an object literal sets the
// prototype instead
const PROTO = '"__proto__":{"label":"P","why":"W"}';

function payload(): Record<string, unknown> {
  return {
    nodes: [
      {
        id: value(1),
        type: value(2),
        label: value(3),
        attrs: {
          [value(4)]: value(5),
          description: value(6),
          _inferred: { description: value(7) },
          ext_url: "javascript:alert(1)",
          toString: value(28),
          constructor: value(29),
        },
      },
      { id: value(8), type: "table", label: value(9).padEnd(10_000, "x") },
      { id: "__proto__", type: "constructor", label: value(10) },
      { id: "constructor", type: "toString", label: value(11) },
      { id: "prototype", type: "__proto__", label: value(12) },
      { id: "toString", label: value(13) },
      { globalId: value(14), nodeType: "column", physicalName: value(15) },
    ],
    edges: [
      {
        subject: value(1),
        predicate: value(16),
        object: value(8),
        attrs: { [value(17)]: value(18) },
      },
      { subject: "__proto__", predicate: "prototype", object: "constructor" },
      { subject: "constructor", predicate: "toString", object: value(1) },
      { subject: "toString", predicate: "constructor", object: "__proto__" },
      { subject: value(14), predicate: "contains", object: "prototype" },
    ],
    types: { [value(2)]: { label: value(19), glyph: value(30) } },
    fields: {
      [value(4)]: { label: value(20), why: value(21) },
      constructor: { label: value(22), why: value(23) },
      toString: { label: value(24), why: value(25) },
    },
    predicates: {
      prototype: { category: "constructor" },
      [value(16)]: { label: value(26) },
    },
    vocabulary: { nodeTypes: [{ name: value(2), description: value(27) }] },
    view: {
      root: value(1),
      approach: "active",
      reveal: [
        value(8),
        "__proto__",
        "constructor",
        "prototype",
        "toString",
        value(14),
      ],
    },
  };
}

// why: one in-test payload for every EPIC-004 audit (rule 14)
export function hostilePayload(): unknown {
  const text = JSON.stringify(payload()).replace(
    '"fields":{',
    `"fields":{${PROTO},`,
  );
  return JSON.parse(text);
}

// why: rule 14 — every attribute of every element, case-insensitive, so a humanised, cut, joined
// or upper-case form of a model string is found by its marker
export function shellAudit(
  root: Element,
  markers: readonly string[] = MARKERS,
): string[] {
  const lower = markers.map((marker) => marker.toLowerCase());
  const findings: string[] = [];
  for (const el of [root, ...root.querySelectorAll("*")])
    for (const { name, value: text } of el.attributes) {
      const found = lower.find((marker) => text.toLowerCase().includes(marker));
      if (found !== undefined)
        findings.push(`${el.tagName.toLowerCase()}[${name}] ${found}`);
    }
  return findings;
}
