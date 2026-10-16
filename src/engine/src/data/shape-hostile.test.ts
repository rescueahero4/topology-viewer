import {
  parseRenderInput,
  profile,
  type RenderInput,
} from "@qdic-topology/contract";
import { describe, expect, it, vi } from "vitest";
import { normalize, type Normalized } from "./normalize";
import { shape } from "./shape";
import { walk } from "./walk";

vi.mock("./walk", async (importOriginal) => {
  const real = await importOriginal<typeof import("./walk")>();
  return { ...real, walk: vi.fn(real.walk) };
});

type Ok = Extract<Normalized, { ok: true }>;

const NOW = { now: "2026-10-14" };
const ROWS = { kind: "rows", subject: "from", object: "to" };
const NOT_A_GRAPH = {
  ok: false,
  fatal: { code: "not-a-graph", path: [], info: { code: "not-a-graph" } },
};

function run(input: unknown): Ok {
  const result = normalize(input, NOW);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

function shapeOf(input: unknown) {
  const parsed = parseRenderInput(input);
  if (!parsed.ok) throw new Error(`fatal ${parsed.fatal.code}`);
  return shape(input, parsed.data, profile);
}

const issueCodes = (result: ReturnType<typeof shapeOf>) =>
  result.ok ? result.issues.map((issue) => issue.code) : [];
const reasonOf = (result: Ok) => result.graph.triples[0].inferred?.predicate;

describe("S18 hostile hint values, columns and cells", () => {
  const before = Object.getOwnPropertyNames(Object.prototype).sort();

  function clean() {
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
  }

  it("skips rows that lack a prototype-named key", () => {
    const input = {
      nodes: [{ from: "a", to: "b" }],
      shape: {
        kind: "rows",
        subject: "__proto__",
        object: "constructor",
        predicate: "prototype",
      },
    };
    expect(issueCodes(shapeOf(input))).toEqual(["dangling-edge"]);
    expect(normalize(input, NOW).ok).toBe(false);
    clean();
  });

  it("skips tree objects that lack a prototype-named id key", () => {
    const input = {
      items: [{ name: "a" }],
      shape: {
        kind: "tree",
        children: "items",
        label: "constructor",
        id: "__proto__",
      },
    };
    expect(issueCodes(shapeOf(input))).toEqual(["no-id", "no-id"]);
    expect(normalize(input, NOW).ok).toBe(false);
    clean();
  });

  it("keeps a __proto__ column out of the edge attrs", () => {
    const input: unknown = JSON.parse(
      '{"nodes":[{"from":"a","to":"b"},{"from":"b","to":"c","__proto__":"x"}],"shape":{"kind":"rows","subject":"from","object":"to"}}',
    );
    const result = run(input);
    expect(result.graph.triples).toHaveLength(2);
    for (const triple of result.graph.triples) {
      expect(Object.hasOwn(triple.attrs, "__proto__")).toBe(false);
      expect(Object.getPrototypeOf(triple.attrs)).toBeNull();
    }
    clean();
  });

  it("makes an entity of a __proto__ cell", () => {
    const result = run({
      nodes: [{ from: "__proto__", to: "b" }],
      shape: ROWS,
    });
    expect(result.graph.entities.map((entity) => entity.id)).toEqual([
      "__proto__",
      "b",
    ]);
    clean();
  });

  it("finds no children under a __proto__ children key", () => {
    const input: unknown = JSON.parse(
      '{"name":"r","__proto__":[{"name":"c"}],"shape":{"kind":"tree","children":"__proto__","label":"name"}}',
    );
    const result = run(input);
    expect(result.graph.records.map((r) => [r.id, r.label])).toEqual([
      ["0", "r"],
    ]);
    expect(result.graph.triples).toEqual([]);
    clean();
  });
});

describe("S19 key text in the reason", () => {
  const reasonFor = (key: string) =>
    reasonOf(
      run({
        nodes: [{ [key]: "a", to: "b" }],
        shape: { ...ROWS, subject: key },
      }),
    );

  it("keeps markup as a plain string", () => {
    const key = "<img onerror=1>";
    const result = run({
      nodes: [{ [key]: "a", to: "b" }],
      shape: { ...ROWS, subject: key },
    });
    expect(reasonOf(result)).toBe("shaped from <img onerror=1>");
    expect(result.shaped?.kind).toBe("rows");
  });

  it("cuts a long key to 64 characters", () => {
    expect(reasonFor("k".repeat(300))).toBe(`shaped from ${"k".repeat(64)}`);
  });

  it("removes control and bidi characters", () => {
    expect(reasonFor("a‮b\u0007c")).toBe("shaped from abc");
  });

  it("puts no key of a payload with no match into the result", () => {
    const input = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`k${i}`, i]),
    );
    const result = normalize(input, NOW);
    expect(result).toEqual(NOT_A_GRAPH);
    for (let i = 0; i < 20; i++)
      expect(JSON.stringify(result)).not.toContain(`k${i}`);
  });
});

describe("S22 the catch-all of shape", () => {
  const leaks = ["TypeError", "RangeError", "boom", "at ", ".ts:"];

  it("turns a getter that throws into not-a-graph", () => {
    const attrs = Object.defineProperty({ to: "b" }, "from", {
      enumerable: true,
      get() {
        throw new TypeError("boom");
      },
    });
    const data = { schemaVersion: "1", nodes: [{ attrs }] } as RenderInput;
    const result = shape({ nodes: [{ from: "a", to: "b" }] }, data, profile);
    expect(result).toEqual(NOT_A_GRAPH);
    for (const text of leaks)
      expect(JSON.stringify(result)).not.toContain(text);
  });

  it("turns a RangeError of the tree walk into not-a-graph", () => {
    vi.mocked(walk).mockImplementationOnce(() => {
      throw new RangeError("boom");
    });
    const result = shapeOf({ name: "r", children: [{ name: "c" }] });
    expect(vi.mocked(walk)).toHaveBeenCalled();
    expect(result).toEqual(NOT_A_GRAPH);
    for (const text of leaks)
      expect(JSON.stringify(result)).not.toContain(text);
  });
});
