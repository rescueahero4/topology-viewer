import { describe, expect, it } from "vitest";
import { canvasColor, hexOf, NAMED, parseColor } from "./colors";

describe("S9b the named-colour table", () => {
  it("holds 148 names in a null-prototype map", () => {
    expect(Object.keys(NAMED)).toHaveLength(148);
    expect(Object.getPrototypeOf(NAMED)).toBeNull();
    expect(hexOf(NAMED.grey)).toBe("#808080");
    expect(hexOf(NAMED.gray)).toBe("#808080");
    expect(hexOf(NAMED.rebeccapurple)).toBe("#663399");
    expect(Object.keys(NAMED).every((name) => /^[a-z]+$/.test(name))).toBe(
      true,
    );
  });

  it("has no transparent, currentcolor or system colour", () => {
    for (const name of ["transparent", "currentcolor", "canvas", "buttontext"])
      expect(Object.hasOwn(NAMED, name)).toBe(false);
  });
});

describe("the closed grammar", () => {
  const hex = (input: string) => {
    const rgb = parseColor(input);
    return rgb === null ? null : hexOf(rgb);
  };

  it("accepts white space around the separators only", () => {
    expect(hex("\t rgb ( 1 ,\t2 , 3 ) \n")).toBe("#010203");
    expect(hex("rgb(1 2 3/0.5)")).toBe("#010203");
    expect(hex("hsla(0, 0%, 100%, 1)")).toBe("#ffffff");
    expect(hex("hsl(360 100% 50%)")).toBe("#ff0000");
    expect(hex("rgb(.5, 0, 0)")).toBe("#010000");
    expect(hex("#abcd")).toBe("#aabbcc");
  });

  it("rejects mixed, out-of-range and malformed input", () => {
    for (const input of [
      "rgb(1,2,3)x",
      "rgb(1,2,3,4,5)",
      "rgb(1, 2, 3 / 1)",
      "rgb(1 2 3 / 1 / 1)",
      "rgb(1 2)",
      "rgb(1,2,3,1.5)",
      "rgb(1,2,3,101%)",
      "rgb(1deg,2,3)",
      "rgb(-1,2,3)",
      "rgb(1e2,2,3)",
      "rgb(1,\n2,3)",
      "rgb(100%,0%,101%)",
      "hsl(120, 50, 40%)",
      "hsl(120%, 50%, 40%)",
      "hsl(1turn, 50%, 40%)",
      "hsl(0, 0%, 100%, 1deg)",
      "abcd",
      "#abcde",
      "blacK",
      "rеd",
      "",
      "   ",
    ])
      expect(hex(input)).toBeNull();
  });

  it("lower-cases ASCII only", () => {
    expect(hex("ReD")).toBe("#ff0000");
    expect(hex("BLACK")).toBeNull();
  });
});

describe("canvasColor", () => {
  it("gives a parsed #rrggbb value or null", () => {
    expect(canvasColor("#18181B")).toBe("#18181b");
    expect(canvasColor("white")).toBe("#ffffff");
    expect(canvasColor("url(#a)")).toBeNull();
  });
});
