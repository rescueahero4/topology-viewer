import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPS,
  checkCounts,
  checkDepth,
  checkSize,
  notices,
  parseRenderInput,
} from "../index";
import { edgeSchema, nodeSchema } from "../input";

const LABEL = "顧客マスタ";

function textOfBytes(bytes: number): string {
  const head = '{"nodes":[{"id":"a","label":"';
  const tail = '"}]}';
  const room = bytes - head.length - tail.length;
  const labels = Math.floor(room / 15);
  return head + LABEL.repeat(labels) + "x".repeat(room - labels * 15) + tail;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("caps", () => {
  it("S12 stops 2,001 nodes at the node cap before any node is validated", () => {
    const nodes = Array.from({ length: 2001 }, (_, index) => ({
      id: `n${index}`,
      type: `t${index}`,
    }));
    const types = Object.fromEntries(
      nodes.map((node) => [node.type, { glyph: "M0 0 <script>" }]),
    );
    expect(checkCounts(nodes.length, 0)).toEqual({
      code: "too-large",
      path: ["nodes"],
    });
    expect(CAPS.nodes).toBe(2000);
    const run = vi.spyOn(nodeSchema._zod, "run");
    expect(parseRenderInput({ nodes, types })).toEqual({
      ok: false,
      fatal: { code: "too-large", path: ["nodes"] },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("S13 stops 4,001 edges at the edge cap before any edge is validated", () => {
    const edges = Array.from({ length: 4001 }, (_, index) => ({
      subject: `a${index}`,
      predicate: "dependsOn",
      object: `b${index}`,
    }));
    expect(checkCounts(0, edges.length)).toEqual({
      code: "too-large",
      path: ["edges"],
    });
    expect(CAPS.edges).toBe(4000);
    const run = vi.spyOn(edgeSchema._zod, "run");
    expect(parseRenderInput({ nodes: [], edges })).toEqual({
      ok: false,
      fatal: { code: "too-large", path: ["edges"] },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("S14 counts UTF-8 bytes: 8,388,609 bytes of CJK text is too large, with no JSON.parse", () => {
    const text = textOfBytes(8_388_609);
    expect(new TextEncoder().encode(text).length).toBe(8_388_609);
    expect(text.length).toBeLessThan(CAPS.bytes);
    const parse = vi.spyOn(JSON, "parse");
    expect(checkSize(text)).toEqual({ code: "too-large", path: [] });
    expect(parse).not.toHaveBeenCalled();
  });

  it("S15 accepts exactly 8,388,608 bytes of CJK text", () => {
    const text = textOfBytes(8_388_608);
    expect(new TextEncoder().encode(text).length).toBe(8_388_608);
    expect(checkSize(text)).toBeNull();
  });

  it("S31 holds the PRD caps and cannot change at run time", () => {
    expect(CAPS).toEqual({
      nodes: 2000,
      edges: 4000,
      bytes: 8388608,
      depth: 256,
    });
    expect(Object.isFrozen(CAPS)).toBe(true);
  });
});

// why: SA §4.1 — level 0 is the value itself, so a value of level N has N + 1 objects or arrays
const objectText = (levels: number) =>
  `${'{"a":'.repeat(levels + 1)}1${"}".repeat(levels + 1)}`;
const deepObject = (levels: number) =>
  JSON.parse(objectText(levels)) as unknown;
const arrayText = (levels: number) =>
  `${"[".repeat(levels + 1)}${"]".repeat(levels + 1)}`;
const deepArray = (levels: number) => JSON.parse(arrayText(levels)) as unknown;
const DEEPEST = {
  object: Math.floor((CAPS.bytes - 1) / 6) - 1,
  array: CAPS.bytes / 2 - 1,
};
const FATAL = {
  code: "too-large",
  path: [],
  info: {
    code: "too-large",
    got: { unit: "levels", count: 257 },
    limit: { unit: "levels", count: 256 },
  },
};

describe("S20 checkDepth", () => {
  it.each([
    ["object", deepObject],
    ["array", deepArray],
  ] as const)("keeps a deep %s at level 256", (_kind, build) => {
    expect(checkDepth(build(256))).toBeNull();
    expect(checkDepth({ nodes: [], x: build(255) })).toBeNull();
  });

  it("keeps a flat value", () => {
    expect(checkDepth({ nodes: [{ id: "a" }], edges: [] })).toBeNull();
    expect(checkDepth("text")).toBeNull();
    expect(checkDepth(null)).toBeNull();
  });

  it.each([
    ["object", deepObject, 257],
    ["array", deepArray, 257],
    ["object", deepObject, DEEPEST.object],
    ["array", deepArray, DEEPEST.array],
  ] as const)("stops a deep %s at %i levels", (_kind, build, levels) => {
    expect(checkDepth(build(levels))).toEqual(FATAL);
    expect(checkDepth({ nodes: [], x: build(levels) })).toEqual(FATAL);
  });

  it("builds the deepest forms at or below CAPS.bytes", () => {
    expect(arrayText(DEEPEST.array).length).toBe(CAPS.bytes);
    expect(objectText(DEEPEST.object).length).toBeLessThanOrEqual(CAPS.bytes);
    expect(objectText(DEEPEST.object + 1).length).toBeGreaterThan(CAPS.bytes);
  });

  it("names 257 and 256 levels in the ja measure text", () => {
    const measure = (count: number) =>
      notices.measure.ja.levels.replace("{count}", String(count));
    expect(measure(257)).toBe("257 階層のネスト");
    expect(measure(256)).toBe("256 階層のネスト");
  });
});
