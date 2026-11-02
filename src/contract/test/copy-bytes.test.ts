import { describe, expect, it } from "vitest";
import { copyBytes, parseRenderInput } from "../index";

function list<T>(length: number, item: (i: number) => T): T[] {
  return Array.from({ length }, (_, i) => item(i));
}

function tooLarge(...path: string[]) {
  return { ok: false, fatal: { code: "too-large", path } };
}

function accepted(raw: unknown) {
  const result = parseRenderInput(raw);
  expect(result.ok).toBe(true);
  return result.ok ? result.issues : [];
}

const x = (n: number) => "x".repeat(n);
const y = (n: number) => "y".repeat(n);
const rows = (n: number) => list(n, (i) => ({ s: `a${i}`, o: `b${i}` }));
const hint = (extra: Record<string, string>) => ({
  kind: "rows",
  subject: "s",
  object: "o",
  ...extra,
});
const untypedNodes = (n: number) => list(n, (i) => ({ id: `n${i}` }));
const bareEdges = (n: number) =>
  list(n, (i) => ({ subject: `n${i}`, object: `n${i}` }));
const fromTo = list(2001, (i) => ({
  from: `n${i % 1000}`,
  to: `n${(i + 1) % 1000}`,
}));

describe("copy bound of defaults and hint literals", () => {
  it("S49 counts the node records that take defaults.type", () => {
    const atLimit = [
      ...list(512, (i) => ({ id: `a${i}` })),
      ...list(512, (i) => [`b${i}`]),
      ...list(325, (i) => ({ id: `c${i}`, type: "t" })),
      42,
      ...list(325, (i) => ({ id: `d${i}`, nodeType: "t" })),
      ...list(325, (i) => [`e${i}`, "t"]),
    ];
    expect(atLimit).toHaveLength(2000);
    expect(accepted({ nodes: atLimit, defaults: { type: x(8190) } })).toEqual(
      [],
    );
    const above = [
      { globalId: "g" },
      ...list(399, (i) => ({ id: `f${i + 1}` })),
      ...list(81, (i) => ({ id: `f${i + 400}`, type: 7 })),
    ];
    expect(above).toHaveLength(481);
    const result = parseRenderInput({
      nodes: above,
      defaults: { type: x(17438) },
    });
    expect(result).toEqual(tooLarge("defaults", "type"));
    expect(JSON.stringify(result)).not.toContain("xxxx");
    accepted({ nodes: fromTo, defaults: { type: x(17438) } });
  });

  it("S50 counts the edge objects that take defaults.predicate", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const bare = list(1024, () => ({ subject: "a", object: "b" }));
    const neighborhood = {
      edges: [
        ...list(976, () => ({ subject: "a", predicate: "p", object: "b" })),
        ...list(976, () => ["a", "p", "b"]),
      ],
    };
    expect(
      accepted({
        nodes,
        edges: bare,
        links: bare,
        neighborhood,
        defaults: { predicate: y(4094) },
      }),
    ).toEqual([]);
    const edges = list(109, (i) =>
      i < 9
        ? { subject: "a", predicate: 7, object: "b" }
        : { subject: "a", object: "b" },
    );
    expect(
      parseRenderInput({ nodes, edges, defaults: { predicate: y(76958) } }),
    ).toEqual(tooLarge("defaults", "predicate"));
  });

  it("S51 bounds a type literal by min(2 × rows, 2,000)", () => {
    accepted({ nodes: rows(512), shape: hint({ type: x(8190) }) });
    expect(
      parseRenderInput({ nodes: rows(3), shape: hint({ type: x(1398100) }) }),
    ).toEqual(tooLarge("shape", "type"));
    accepted({ nodes: rows(1500), shape: hint({ type: x(4192) }) });
    const key = x(1398100);
    const keyed = rows(3).map((row) => ({ ...row, [key]: "t" }));
    accepted({ nodes: keyed, shape: hint({ type: key }) });
  });

  it("S52 bounds a predicate literal by min(rows, 4,000)", () => {
    accepted({ nodes: rows(2048), shape: hint({ predicate: y(4094) }) });
    expect(
      parseRenderInput({
        nodes: rows(109),
        shape: hint({ predicate: y(76958) }),
      }),
    ).toEqual(tooLarge("shape", "predicate"));
    const key = y(76958);
    const keyed = rows(109).map((row) => ({ ...row, [key]: "p" }));
    accepted({ nodes: keyed, shape: hint({ predicate: key }) });
    accepted({ nodes: rows(4100), shape: hint({ predicate: y(2095) }) });
  });

  it("S53 refuses one sum per render at the path of the largest term", () => {
    const both = (predicate: string) => ({
      nodes: untypedNodes(1024),
      edges: bareEdges(1024),
      defaults: { type: x(4095), predicate },
    });
    expect(parseRenderInput(both(y(4095)))).toEqual(
      tooLarge("defaults", "type"),
    );
    expect(parseRenderInput(both(y(4096)))).toEqual(
      tooLarge("defaults", "predicate"),
    );
    const wide = { type: "表".repeat(10923) };
    accepted({ nodes: untypedNodes(255), defaults: wide });
    expect(
      parseRenderInput({ nodes: untypedNodes(256), defaults: wide }),
    ).toEqual(tooLarge("defaults", "type"));
    expect(
      parseRenderInput({
        nodes: rows(512),
        shape: hint({ type: x(4094) }),
        neighborhood: { nodes: untypedNodes(1024) },
        defaults: { type: "z".repeat(4095) },
      }),
    ).toEqual(tooLarge("defaults", "type"));
  });

  it("S54 gives the sum and the path, and never reads a prototype key", () => {
    const s53 = {
      nodes: untypedNodes(1024),
      edges: bareEdges(1024),
      defaults: { type: x(4095), predicate: y(4095) },
    };
    const sum = copyBytes(s53);
    expect(sum).toEqual({ sum: 8390656, path: ["defaults", "type"] });
    expect(Math.ceil(sum.sum / 1024)).toBe(8194);
    for (const raw of [{ nodes: [{ id: "a" }] }, [], "x", null])
      expect(copyBytes(raw)).toEqual({ sum: 0, path: null });
    expect(
      parseRenderInput({
        nodes: untypedNodes(2001),
        defaults: { type: x(17438) },
      }),
    ).toEqual(tooLarge("nodes"));
    const polluting: unknown = JSON.parse(
      '{"nodes":[{"id":"a"}],"defaults":{"__proto__":{"type":"zzz"},"constructor":{"type":"zzz"}}}',
    );
    expect(copyBytes(polluting)).toEqual({ sum: 0, path: null });
    accepted(polluting);
    expect(({} as Record<string, unknown>).type).toBeUndefined();
    const shape = hint({ type: "T", predicate: "P" });
    const cases: [unknown[], number, string[] | null][] = [
      [[], 0, null],
      [[null, { s: "a", o: "b" }], 18, ["shape", "type"]],
      [["x", { s: "a", o: "b" }], 18, ["shape", "type"]],
      [[5], 9, ["shape", "type"]],
    ];
    for (const [nodes, bytes, path] of cases) {
      expect(copyBytes({ nodes, shape })).toEqual({ sum: bytes, path });
      expect(accepted({ nodes, shape })).toEqual([]);
    }
    const inherited = { nodes: rows(3), shape: hint({ type: "constructor" }) };
    expect(copyBytes(inherited)).toEqual({ sum: 78, path: ["shape", "type"] });
    expect(accepted(inherited)).toEqual([]);
  });
});
