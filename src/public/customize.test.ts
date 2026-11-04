// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { loadProfile } from "../contract/profile/index";
import { EditHistory } from "../engine/edit/history";
import { mergeOptions } from "./merge";
import { defineProfile, neutralProfile, parseSvg } from "./profile";
import { contentOf } from "./slots";
import { canvasOf, themeCss, themeOf } from "./theme";

describe("parseSvg", () => {
  it("reads the drawing, and leaves out what says nothing about it", () => {
    const icon = parseSvg(
      `<?xml version="1.0"?><!-- a comment -->
       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="x" id="y" fill="none">
         <title>A name</title>
         <g stroke="#123456" stroke-width="2"><circle cx="12" cy="12" r="9"/></g>
       </svg>`,
    );
    expect(icon.w).toBe(24);
    expect(icon.h).toBe(24);
    expect(icon.fill).toBe("none");
    expect(icon.body).toEqual([
      [
        "g",
        { stroke: "#123456", "stroke-width": "2" },
        [["circle", { cx: "12", cy: "12", r: "9" }, []]],
      ],
    ]);
  });

  it("takes a width and a height with no viewBox", () => {
    const { w, h } = parseSvg(`<svg width="10" height="20"><rect x="1" y="1" width="2" height="2"/></svg>`);
    expect([w, h]).toEqual([10, 20]);
  });

  it.each([
    ["a script", `<svg viewBox="0 0 2 2"><script>alert(1)</script></svg>`],
    ["an event attribute", `<svg viewBox="0 0 2 2"><path d="M0 0" onclick="x()"/></svg>`],
    ["a foreign object", `<svg viewBox="0 0 2 2"><foreignObject/></svg>`],
    ["a link", `<svg viewBox="0 0 2 2"><a href="javascript:x()"/></svg>`],
    ["a use", `<svg viewBox="0 0 2 2"><use href="#x"/></svg>`],
    ["a url in a paint", `<svg viewBox="0 0 2 2"><path d="M0 0" fill="url(#x)"/></svg>`],
    ["a bad transform", `<svg viewBox="0 0 2 2"><g transform="url(x)"/></svg>`],
    ["path data that is not path data", `<svg viewBox="0 0 2 2"><path d="javascript:x()"/></svg>`],
    ["a view box that does not start at 0", `<svg viewBox="1 1 2 2"><path d="M0 0"/></svg>`],
    ["no root", `<path d="M0 0"/>`],
    ["a text", `<svg viewBox="0 0 2 2">hello</svg>`],
  ])("refuses %s", (_name, text) => {
    expect(() => parseSvg(text)).toThrow(/topology-viewer: icon/);
  });
});

describe("defineProfile", () => {
  const made = defineProfile({
    families: ["Traffic"],
    nodeTypes: {
      robot: { label: "Robot", icon: `<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>`, color: "#123456", category: "Machines" },
      person: { label: "Person", color: "#7c3aed", category: "People", rank: 2 },
      plain: {},
    },
    predicates: { drives: { family: "Traffic", inverse: "drivenBy" }, other: {} },
  });

  it("makes a vocabulary that the strict schema of the core takes", () => {
    expect(() => loadProfile(made.vocabulary)).not.toThrow();
  });

  it("puts the icon of a type in the sprite, under the name of the type", () => {
    expect(made.sprite?.robot).toMatchObject({ w: 24, h: 24, color: "#123456", tier: "asset" });
    expect((made.vocabulary.nodeTypes as Record<string, unknown>).robot).toMatchObject({ icon: "robot" });
  });

  it("puts a new family before Other", () => {
    const order = made.vocabulary.categoryOrder as string[];
    expect(order.at(-1)).toBe("Other");
    expect(order).toContain("Traffic");
  });

  it("does not change the profile that it extends", () => {
    const before = JSON.stringify(neutralProfile);
    const next = defineProfile({ extends: made, nodeTypes: { more: {} } });
    expect(JSON.stringify(neutralProfile)).toBe(before);
    expect((made.vocabulary.nodeTypes as object)).not.toHaveProperty("more");
    expect(next.vocabulary.nodeTypes as object).toHaveProperty("robot");
    expect(next.sprite).toHaveProperty("robot");
  });

  it("refuses a predicate of an unknown family, and a colour that is not #rrggbb", () => {
    expect(() => defineProfile({ predicates: { a: { family: "Nope" } } })).toThrow(/unknown family/);
    expect(() =>
      defineProfile({ nodeTypes: { a: { icon: `<svg viewBox="0 0 1 1"/>`, color: "red" } } }),
    ).toThrow(/#rrggbb/);
  });
});

describe("mergeOptions", () => {
  it("lets a later option win, and merges parts by key", () => {
    const merged = mergeOptions<Record<string, any>>(
      {
        lang: "en",
        theme: { surface: "a", text: "b" },
        parts: { search: { hidden: true, options: { limit: 1, debounce: 2 } }, table: { hidden: true } },
      },
      {
        lang: "ja",
        theme: { surface: "c" },
        parts: { search: { hidden: false, options: { limit: 9 } } },
      },
    );
    expect(merged.lang).toBe("ja");
    expect(merged.theme).toEqual({ surface: "c", text: "b" });
    expect(merged.parts.search).toEqual({
      hidden: false,
      options: { limit: 9, debounce: 2 },
      on: {},
    });
    expect(merged.parts.table).toEqual({ hidden: true });
  });

  it("does not take a part name from the prototype", () => {
    const merged = mergeOptions<Record<string, any>>(
      { parts: {} },
      { parts: JSON.parse('{"toString": {"hidden": true}}') },
    );
    expect(merged.parts.toString).toEqual({ hidden: true });
  });
});

describe("contentOf", () => {
  it("finds the content of a place, and only of an own part", () => {
    const render = () => 1;
    const parts = {
      a: { before: 1, after: 2, render, items: ["x", { id: "y", render: 3 }] },
    } as never;
    expect(contentOf(parts, "a", "before")).toBe(1);
    expect(contentOf(parts, "a", "after")).toBe(2);
    expect(contentOf(parts, "a", "render")).toBe(render);
    expect(contentOf(parts, "a", "item:y")).toBe(3);
    expect(contentOf(parts, "a", "item:x")).toBeUndefined();
    expect(contentOf(parts, "toString", "render")).toBeUndefined();
    expect(contentOf(undefined, "a", "render")).toBeUndefined();
  });
});

describe("theme", () => {
  const doc = document;

  it("makes tokens from keys, and keeps a key that names a token", () => {
    const css = themeCss(themeOf({ theme: { frameRadius: "0", "--x": "1", surface: undefined } } as never, doc));
    expect(css).toContain("--tv-frame-radius: 0;");
    expect(css).toContain("--x: 1;");
    expect(css).not.toContain("surface");
  });

  it("names a token with a number as the token list does", () => {
    const css = themeCss(themeOf({ theme: { family0Tint: "a", fontSize5: "b", radiusSm: "c" } } as never, doc));
    expect(css).toContain("--tv-family-0-tint: a;");
    expect(css).toContain("--tv-font-size-5: b;");
    expect(css).toContain("--tv-radius-sm: c;");
  });

  it("leaves out a value that could end the rule", () => {
    const css = themeCss(themeOf({ theme: { surface: "red; } body { display: none" } } as never, doc));
    expect(css).not.toContain("display");
  });

  it("puts the theme of the colour mode over the base", () => {
    const shown = themeOf(
      { theme: { surface: "a", text: "b" }, themes: { dark: { surface: "c" } }, colorMode: "dark" },
      doc,
    );
    expect(shown.tokens).toEqual({ surface: "c", text: "b" });
    expect(themeCss(shown)).toContain("color-scheme: dark;");
  });

  it("takes no theme from the prototype", () => {
    const shown = themeOf({ themes: {}, colorMode: "toString" }, doc);
    expect(shown.tokens).toEqual({});
  });

  it("takes the canvas of the theme, and else a token that the page sets", () => {
    const host = doc.createElement("div");
    doc.body.append(host);
    expect(canvasOf({ canvas: "#101014" }, host)).toBe("#101014");
    expect(canvasOf({}, host)).toBeUndefined();
    host.style.setProperty("--tv-canvas", "#202024");
    expect(canvasOf({}, host)).toBe("#202024");
    host.remove();
  });
});

describe("EditHistory.pending", () => {
  const edit = (after: string) => ({
    changes: [{ row: { record: "a" }, column: "name" as const, before: "", after }],
    effect: { drew: [], undrew: [] },
  });

  it("gives only what is not saved, and nothing that was undone", () => {
    const history = new EditHistory();
    history.push(edit("one"));
    expect(history.pending().map((one) => one.after)).toEqual(["one"]);
    history.save();
    expect(history.pending()).toEqual([]);
    expect(history.active()).toHaveLength(1);
    history.push(edit("two"));
    history.push(edit("three"));
    history.undo();
    expect(history.pending().map((one) => one.after)).toEqual(["two"]);
  });
});
