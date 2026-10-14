import { describe, expect, it } from "vitest";
import { parseRenderInput } from "../src/index";

const KEYS = ["__proto__", "constructor", "prototype"];

function dangerous(value: string): string {
  return KEYS.map((key) => `"${key}":${value}`).join(",");
}

const text = `{
  "nodes": [{ "id": "a", ${dangerous('{"polluted":1}')}, "attrs": { ${dangerous('{"polluted":1}')} } }],
  "types": { ${dangerous('{"rank":1}')} },
  "fields": { ${dangerous('{"label":"x"}')} },
  "predicates": { ${dangerous('{"label":"x"}')} },
  "shape": { "kind": "rows", "subject": "__proto__", "object": "to" }
}`;

function ownOrAbsent(container: object, key: string): boolean {
  if (Object.getPrototypeOf(container) !== Object.prototype) return false;
  return (
    Object.hasOwn(container, key) ||
    (container as Record<string, unknown>)[key] ===
      ({} as Record<string, unknown>)[key]
  );
}

describe("prototype pollution", () => {
  it("S28 keeps each dangerous key as an own property or drops it", () => {
    const raw: unknown = JSON.parse(text);
    const result = parseRenderInput(raw);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { data } = result;
    const containers = [
      data.nodes?.[0] as object,
      (data.nodes?.[0] as { attrs: object }).attrs,
      data.types ?? {},
      data.fields ?? {},
      data.predicates ?? {},
    ];
    for (const container of containers) {
      for (const key of KEYS) expect(ownOrAbsent(container, key)).toBe(true);
    }
    expect(data.shape).toEqual({
      kind: "rows",
      subject: "__proto__",
      object: "to",
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
