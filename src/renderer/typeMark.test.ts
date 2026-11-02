// @vitest-environment jsdom
import type { Designed, Hex } from "#engine";
import { describe, expect, it } from "vitest";
import { symbolOf } from "./sprite";
import { typeMark } from "./typeMark";

// why: S13 — the resolved visuals of `s-designed` `supplier` and of `vocab.untyped` of `s-dirty`
// (engine `resolveVocab`, read on 2026-10-21); the renderer tests cannot load the fixtures
const SUPPLIER: Designed = {
  rank: 2,
  shape: "diamond",
  size: 32,
  color: "#5b6b8c" as Hex,
  colorIn: "#5b6b8c" as Hex,
  adjusted: false,
  ink: "#ffffff" as Hex,
  letters: "SU",
};
const UNTYPED: Designed = {
  rank: 0,
  shape: "circle",
  size: 20,
  color: "#6b7280" as Hex,
  adjusted: false,
  ink: "#ffffff" as Hex,
};
const BAD_GLYPH: Designed = {
  ...SUPPLIER,
  letters: undefined,
  glyph: "M0 0 qxm<x>",
};

const ids = (svg: Element) =>
  [svg, ...svg.querySelectorAll("*")].filter((el) => el.hasAttribute("id"));
const values = (svg: Element) =>
  [svg, ...svg.querySelectorAll("*")].flatMap((el) =>
    [...el.attributes].map((a) => a.value),
  );

describe("S13 typeMark", () => {
  it("copies the sprite symbol of table", () => {
    const svg = typeMark({ icon: "table" }, 16, null);
    const symbol = symbolOf(document, "x", { icon: "table" });
    expect(svg.innerHTML).toBe(symbol.innerHTML);
    expect(svg.getAttribute("viewBox")).toBe(symbol.getAttribute("viewBox"));
    expect(svg.getAttribute("fill")).toBe(symbol.getAttribute("fill"));
    expect(
      Math.max(
        Number(svg.getAttribute("width")),
        Number(svg.getAttribute("height")),
      ),
    ).toBe(16);
    expect(ids(svg)).toEqual([]);
  });

  it("gives supplier its shape and letters mark", () => {
    const svg = typeMark(SUPPLIER, 16, null);
    expect(svg.querySelector("polygon.qt-mark")?.getAttribute("fill")).toBe(
      "#5b6b8c",
    );
    expect(svg.querySelector("text")?.textContent).toBe("SU");
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual([
      "16",
      "16",
    ]);
    expect(ids(svg)).toEqual([]);
  });

  it("gives the untyped mark the rank-0 circle", () => {
    const svg = typeMark(null, 16, UNTYPED);
    expect(svg.querySelector("circle.qt-mark")?.getAttribute("fill")).toBe(
      "#6b7280",
    );
    expect(svg.children).toHaveLength(1);
    expect(ids(svg)).toEqual([]);
  });

  it("gives a glyph that fails the SA §4.1 pattern no mark and no d", () => {
    const svg = typeMark(BAD_GLYPH, 16, null);
    expect(svg.querySelector("polygon.qt-mark")).not.toBeNull();
    expect(svg.querySelector("path, text")).toBeNull();
    expect(values(svg).join("|")).not.toContain("qxm");
  });

  it("sets a good glyph only after the re-check", () => {
    const svg = typeMark({ ...BAD_GLYPH, glyph: "M3 12h18" }, 16, null);
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M3 12h18");
  });

  it("keeps the token colour and the same mark for a colour that fails isHex", () => {
    const bad = typeMark({ ...SUPPLIER, color: "red" as Hex }, 16, null);
    const good = typeMark(SUPPLIER, 16, null);
    const shape = bad.querySelector("polygon.qt-mark");
    expect(shape?.hasAttribute("fill")).toBe(false);
    expect(values(bad).join("|")).not.toContain("red");
    expect(bad.querySelector("text")?.outerHTML).toBe(
      good.querySelector("text")?.outerHTML,
    );
    expect(ids(bad)).toEqual([]);
  });

  it("gives an empty mark when there is no visual", () => {
    const svg = typeMark(null, 16, null);
    expect(svg.children).toHaveLength(0);
    expect(svg.getAttribute("width")).toBe("16");
  });
});
