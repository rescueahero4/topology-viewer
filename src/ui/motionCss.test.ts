import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  colourLiterals,
  cssRules,
  PANELS,
  panelOf,
  REDUCED,
  type CssRule,
} from "./cssRules";

const SRC = import.meta.dirname;
const read = (name: string) => readFileSync(path.join(SRC, name), "utf8");
const SHELL = readdirSync(SRC).filter((name) => /^shell-.*\.css$/.test(name));
const RULES = SHELL.flatMap((name) =>
  cssRules(read(name)).map((rule) => ({ name, rule })),
);

const SLIDE = "transform var(--panel-dur) var(--panel-ease)";
const LAYOUT = ["flex-grow", "top", "width", "height", "opacity"];

const transitions = (rule: CssRule) =>
  rule.decls.filter((d) => /^transition(-property)?$/.test(d.property));

describe("S1 panels animate only transform with the panel tokens", () => {
  it("finds the panel rules of each panel", () => {
    for (const panel of PANELS) {
      const slides = RULES.filter(
        ({ rule }) =>
          rule.at !== REDUCED &&
          rule.selectors.some((s) => panelOf(s) === panel) &&
          transitions(rule).length > 0,
      );
      expect(slides.length, panel).toBeGreaterThan(0);
    }
  });

  it("gives each panel transition only transform, var(--panel-dur) and var(--panel-ease)", () => {
    const found: string[] = [];
    for (const { name, rule } of RULES) {
      if (rule.at === REDUCED || !rule.selectors.some((s) => panelOf(s)))
        continue;
      for (const d of transitions(rule)) {
        const want = d.property === "transition" ? SLIDE : "transform";
        if (d.value !== want)
          found.push(`${name} ${rule.selectors.join(", ")}: ${d.value}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("animates no layout property, opacity or shadow of a panel, and no layout property at all", () => {
    const found: string[] = [];
    for (const { name, rule } of RULES)
      for (const d of transitions(rule)) {
        const banned = rule.selectors.some((s) => panelOf(s))
          ? [...LAYOUT, "box-shadow"]
          : LAYOUT;
        for (const word of banned)
          if (new RegExp(`(^|[\\s,])${word}(?![\\w-])`).test(d.value))
            found.push(`${name} ${rule.selectors.join(", ")}: ${word}`);
      }
    expect(found).toEqual([]);
  });
});

describe("S2 reduced motion stops the slides, pill-in and the count bump", () => {
  const reduced = RULES.filter(({ rule }) => rule.at === REDUCED).map(
    ({ rule }) => rule,
  );
  const sets = (selector: string, property: string) =>
    reduced.some(
      (rule) =>
        rule.selectors.includes(selector) &&
        rule.decls.some((d) => d.property === property && d.value === "none"),
    );

  it.each(PANELS)("sets transition: none for %s", (panel) => {
    expect(sets(panel, "transition")).toBe(true);
  });

  it("sets animation: none for each element with pill-in or the bump", () => {
    const animated = RULES.filter(
      ({ rule }) =>
        rule.at === null &&
        rule.decls.some(
          (d) =>
            d.property === "animation" &&
            /\b(pill-in|hid-bump)\b/.test(d.value),
        ),
    ).flatMap(({ rule }) => rule.selectors);
    expect(animated).toEqual(
      expect.arrayContaining([".data-notice", ".focus-pill", ".undo-toast"]),
    );
    expect(animated).toContain(".hid-count.bump");
    expect(animated.filter((selector) => !sets(selector, "animation"))).toEqual(
      [],
    );
  });
});

const tokenRules = cssRules(read("tokens.css"));
const block = (selector: string) =>
  new Map(
    tokenRules
      .filter((rule) => rule.selectors.join(",") === selector)
      .flatMap((rule) => rule.decls.map((d) => [d.property, d.value] as const)),
  );
const light = block(":root");
const isColour = (value: string) =>
  /^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\(/i.test(value);
const norm = (value: string) => value.toLowerCase().replace(/\s+/g, "");
const COLOURS = [...light].filter(([, value]) => isColour(value));
const HUES = [
  "--focus",
  "--select",
  "--danger",
  "--badge",
  "--lost-fill",
  "--lost-ink",
];

const TOKENS = new Set([...light.keys()]);

describe("S14 no colour literal in a shell CSS file (B3)", () => {
  it.each(SHELL)("%s has only token colours", (name) => {
    const found = cssRules(read(name)).flatMap((rule) =>
      rule.decls.flatMap((d) =>
        colourLiterals(d.value, d.property, TOKENS).map(
          (l) =>
            `${rule.selectors.join(", ")} { ${d.property}: ${d.value} }: ${l}`,
        ),
      ),
    );
    expect(found).toEqual([]);
  });

  it("finds the plant forms #fff and rgba(255,255,255,.92)", () => {
    expect(colourLiterals("#fff", "background", TOKENS)).toEqual(["hex"]);
    expect(
      colourLiterals("rgba(255,255,255,.92)", "background", TOKENS),
    ).toEqual(["colour function"]);
  });
});
