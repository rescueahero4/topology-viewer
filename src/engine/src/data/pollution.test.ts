import { copyBytes } from "@qdic-topology/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { merge } from "./merge";
import { normalize, type Normalized } from "./normalize";
import { noticeText } from "./notices";

vi.mock("./merge", async (importOriginal) => {
  const original = await importOriginal<typeof import("./merge")>();
  return { ...original, merge: vi.fn(original.merge) };
});

const NOW = { now: "2026-10-14" };
const PROTOTYPE = Object.getOwnPropertyNames(Object.prototype);

function okOf(result: Normalized) {
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

function clean() {
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(PROTOTYPE);
}

beforeEach(() => {
  vi.mocked(merge).mockClear();
});

describe("S29 prototype keys in ids, attrs, fields and view", () => {
  const text = JSON.stringify({
    nodes: [
      {
        id: "__proto__",
        attrs: { constructor: "c", prototype: "p", toString: "t" },
      },
    ],
    fields: { constructor: { label: "C" } },
    view: { root: "constructor", reveal: ["__proto__"] },
  })
    .replace('"attrs":{', '"attrs":{"__proto__":{"polluted":"yes"},')
    .replace('"fields":{', '"fields":{"__proto__":{"label":"P"},');

  it("keeps own keys only and pollutes nothing", () => {
    const first = okOf(normalize(JSON.parse(text), NOW));
    const second = okOf(normalize(JSON.parse(text), NOW));
    clean();
    expect(first.graph.entities.map((e) => e.id)).toEqual(["__proto__"]);
    const { attrs } = first.graph.records[0];
    for (const key of ["constructor", "prototype", "toString"])
      expect(Object.hasOwn(attrs, key)).toBe(true);
    expect(Object.hasOwn(attrs, "__proto__")).toBe(false);
    const fields = first.payload.fields ?? {};
    expect(Object.hasOwn(fields, "constructor")).toBe(true);
    expect(Object.hasOwn(fields, "__proto__")).toBe(false);
    expect(first.issues).toEqual([
      { code: "root-not-found", path: ["view", "root"] },
    ]);
    expect(second.hash).toBe(first.hash);
  });
});

describe("S36 defaults values", () => {
  const nodes = [{ id: "a" }, { id: "b" }];
  const edges = [{ subject: "a", object: "b" }];

  it("(a) takes only the own string values of type and predicate", () => {
    const defaults = {
      type: "__proto__",
      predicate: "constructor",
      colour: "x-SECRET",
    };
    const result = okOf(normalize({ nodes, edges, defaults }, NOW));
    clean();
    for (const record of result.graph.records) {
      expect(Object.hasOwn(record, "type")).toBe(true);
      expect(record.type).toBe("__proto__");
    }
    expect(result.graph.triples[0].predicate).toBe("constructor");
    expect(result.issues).toEqual([
      { code: "unknown-key", path: ["defaults"] },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/x-SECRET|colour/);
  });

  it("(b) copies a long type with no issue", () => {
    const type = "t".repeat(300);
    const result = okOf(normalize({ nodes, defaults: { type } }, NOW));
    expect(result.graph.records.map((r) => r.type)).toEqual([type, type]);
    expect(result.issues).toEqual([]);
  });

  it("(c) refuses the copy above the byte cap before any merge", () => {
    const input = {
      nodes: Array.from({ length: 2000 }, (_, k) => [`n${k}`]),
      defaults: { type: "t".repeat(243220) },
    };
    expect(new TextEncoder().encode(JSON.stringify(input)).length).toBe(262144);
    expect(copyBytes(input).sum).toBe(486444000);
    const result = normalize(input, NOW);
    expect(result).toStrictEqual({
      ok: false,
      fatal: {
        code: "too-large",
        path: ["defaults", "type"],
        info: {
          code: "too-large",
          got: { unit: "kb", count: 475043 },
          limit: { unit: "kb", count: 256 },
        },
      },
    });
    expect(merge).toHaveBeenCalledTimes(0);
    const info = !result.ok && "info" in result.fatal ? result.fatal.info : {};
    expect(noticeText("too-large", info, "en").body).toBe(
      "This result has 475,043 KB, more than the limit of 256 KB, so nothing is drawn.",
    );
  });

  it("calls the merge once for an accepted input", () => {
    normalize({ nodes }, NOW);
    expect(merge).toHaveBeenCalledTimes(1);
  });
});
