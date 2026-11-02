import { describe, expect, it } from "vitest";
import { notices, parseRenderInput } from "../index";

function parsed(raw: unknown) {
  const result = parseRenderInput(raw);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

const nodes = [{ id: "a" }];

describe("strict defaults", () => {
  it("S8 keeps a type and a predicate, also a 300-character type", () => {
    const first = parsed({
      nodes,
      defaults: { type: "table", predicate: "dependsOn" },
    });
    expect(first.data.defaults).toStrictEqual({
      type: "table",
      predicate: "dependsOn",
    });
    expect(first.issues).toEqual([]);
    const long = "x".repeat(300);
    const second = parsed({ nodes, defaults: { type: long } });
    expect(second.data.defaults).toStrictEqual({ type: long });
    expect(second.issues).toEqual([]);
  });

  it("S9 rejects a type and a predicate that are not strings", () => {
    const result = parsed({ nodes, defaults: { type: 7777, predicate: true } });
    expect(result.issues).toEqual([
      { code: "field-rejected", path: ["defaults", "type"] },
      { code: "field-rejected", path: ["defaults", "predicate"] },
    ]);
    expect(Object.keys(result.data.defaults ?? { missing: 1 })).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("7777");
  });

  it("S10 drops each other key with one unknown-key issue and no key text", () => {
    const result = parsed({
      nodes,
      defaults: { type: "t", colour: "x-SECRET", "zzz-KEY": 1 },
    });
    expect(result.issues).toEqual([
      { code: "unknown-key", path: ["defaults"] },
      { code: "unknown-key", path: ["defaults"] },
    ]);
    expect(result.data.defaults).toStrictEqual({ type: "t" });
    const text = JSON.stringify(result);
    for (const part of ["colour", "x-SECRET", "zzz-KEY"])
      expect(text).not.toContain(part);
  });

  it("S11 drops prototype keys and changes no prototype", () => {
    const raw: unknown = JSON.parse(
      '{"nodes":[{"id":"a"}],"defaults":{"__proto__":{"polluted":1},"constructor":{"polluted":1},"prototype":1,"type":"__proto__","predicate":"constructor"}}',
    );
    const result = parsed(raw);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const defaults = result.data.defaults ?? {};
    expect(Object.getPrototypeOf(defaults)).toBe(Object.prototype);
    expect(Object.keys(defaults)).toEqual(["type", "predicate"]);
    expect(Object.hasOwn(defaults, "type") && defaults.type).toBe("__proto__");
    expect(defaults.predicate).toBe("constructor");
    expect(result.issues).toEqual(
      Array.from({ length: 3 }, () => ({
        code: "unknown-key",
        path: ["defaults"],
      })),
    );
    const issues = JSON.stringify(result.issues);
    for (const part of ["__proto__", "constructor", "prototype", "polluted"])
      expect(issues).not.toContain(part);
  });

  it("S12 rejects defaults that are not an object and keeps the compact form", () => {
    expect(parsed({ nodes, defaults: "x" }).issues).toEqual([
      { code: "field-rejected", path: ["defaults"] },
    ]);
    const compact = {
      defaults: { type: "table" },
      nodes: [
        ["tbl-customer", "table", "CUSTOMER", { service_name: "snowflake" }],
        ["usr-jane"],
      ],
      edges: [["tbl-customer", "ownedBy", "usr-jane"]],
    };
    const result = parsed(compact);
    expect(result.issues).toEqual([]);
    expect(result.data).toEqual({ schemaVersion: "1", ...compact });
  });

  it("S14 unknown-key names defaults in en and ja", () => {
    expect(notices.en["unknown-key"].body).toBe(
      "{count} key(s) that this chart doesn't know were ignored: at the top level, in `view` or `defaults`, or inside an entry of `types`, `predicates` or `fields` or inside the `shape` hint.",
    );
    expect(notices.ja["unknown-key"].body).toBe(
      "このチャートが認識できない {count} 個のキーを無視しました。対象は、トップレベル、`view`、`defaults`、`types`・`predicates`・`fields` の各エントリー内、または `shape` ヒント内のキーです。",
    );
    expect(notices.en["unknown-key"].ai).toContain(
      "`fields[k]`: `label`, `slot`, `why`. `defaults`: `type`, `predicate`. An unknown key inside one of these entries, inside `defaults` or inside the `shape` hint is dropped",
    );
    expect(notices.ja["unknown-key"].ai).toContain(
      "`fields[k]`: `label`、`slot`、`why`。`defaults`: `type`、`predicate`。これらのエントリー内、`defaults` 内、または `shape` ヒント内の不明なキーは",
    );
  });
});
