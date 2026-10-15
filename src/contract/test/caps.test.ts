import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPS, checkCounts, checkSize, parseRenderInput } from "../src/index";
import { edgeSchema, nodeSchema } from "../src/input";

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

  it("S14 counts UTF-8 bytes: 262,145 bytes of CJK text is too large, with no JSON.parse", () => {
    const text = textOfBytes(262_145);
    expect(new TextEncoder().encode(text).length).toBe(262_145);
    expect(text.length).toBeLessThan(CAPS.bytes);
    const parse = vi.spyOn(JSON, "parse");
    expect(checkSize(text)).toEqual({ code: "too-large", path: [] });
    expect(parse).not.toHaveBeenCalled();
  });

  it("S15 accepts exactly 262,144 bytes of CJK text", () => {
    const text = textOfBytes(262_144);
    expect(new TextEncoder().encode(text).length).toBe(262_144);
    expect(checkSize(text)).toBeNull();
  });

  it("S31 holds the PRD caps and cannot change at run time", () => {
    expect(CAPS).toEqual({
      nodes: 2000,
      edges: 4000,
      bytes: 262144,
      pasteBytes: 1048576,
    });
    expect(Object.isFrozen(CAPS)).toBe(true);
  });
});
