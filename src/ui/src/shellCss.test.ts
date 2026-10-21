import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colourLiterals } from "./cssRules";

const SRC = import.meta.dirname;
const read = (name: string) =>
  readFileSync(path.join(SRC, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const SHELL = readdirSync(SRC).filter((name) => /^shell-.*\.css$/.test(name));

type Rule = { selector: string; body: string[] };

// why: LEARNINGS 37, 55 — a rule is found by its whole selector at a line start, with the
// comments removed, never by a substring of the file
function rules(css: string): Rule[] {
  return [...css.matchAll(/(^|\n)([^{}\n][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[2].trim().replace(/\s+/g, " "),
    body: m[3]
      .split(";")
      .map((d) => d.trim().replace(/\s+/g, " "))
      .filter((d) => d !== ""),
  }));
}
const ruleOf = (css: string, selector: string) =>
  rules(css).find((rule) => rule.selector === selector);

describe("S19 the Menu item rule", () => {
  const frame = read("shell-frame.css");

  it("has the declarations of the mockup .menu-item and no one-line rule", () => {
    expect(ruleOf(frame, ".menu-item")?.body).toEqual([
      "display: flex",
      "align-items: center",
      "gap: 8px",
      "width: 100%",
      "padding: 6px 8px",
      "border: 0",
      "border-radius: 4px",
      "background: transparent",
      "font-size: 12px",
      "color: var(--zinc-700)",
      "text-align: left",
      "text-decoration: none",
      "cursor: pointer",
    ]);
    const item = rules(frame).filter((r) => r.selector.includes(".menu-item"));
    for (const rule of item)
      for (const d of rule.body)
        expect(d).not.toMatch(/^(white-space|text-overflow):/);
  });

  it("gives the menu a min-width of 208px", () => {
    expect(ruleOf(frame, ".menu")?.body).toContain("min-width: 208px");
  });
});

const TOKENS = new Set(
  [
    ...readFileSync(path.join(SRC, "tokens.css"), "utf8").matchAll(
      /(--[\w-]+)\s*:/g,
    ),
  ].map((m) => m[1]),
);

const literals = (value: string, property = "color") =>
  colourLiterals(value, property, TOKENS);

describe("S31 no colour literal in the shell CSS", () => {
  it("finds the shell CSS files of this story", () => {
    expect(SHELL).toContain("shell-frame.css");
  });

  it.each(SHELL)("%s has only token colours", (name) => {
    const found = rules(read(name)).flatMap((rule) =>
      rule.body.flatMap((d) => {
        const property = d.slice(0, d.indexOf(":")).trim();
        const value = d.slice(d.indexOf(":") + 1);
        return literals(value, property).map(
          (l) => `${rule.selector} { ${d} }: ${l}`,
        );
      }),
    );
    expect(found).toEqual([]);
  });

  it("finds each literal form", () => {
    const bad = [
      "#fff",
      "url(\"data:image/svg+xml,%3Csvg stroke='%23fff'\")",
      "rgba(255,255,255,.92)",
      "hsl(0 0% 0%)",
      "color(srgb 1 1 1)",
      "1px solid red",
      "var(--zinc-200, #fff)",
      "var(--x, transparent)",
      "var(--nope)",
    ];
    expect(bad.map((v) => literals(v).length > 0)).toEqual(bad.map(() => true));
    const good = [
      "transparent",
      "currentColor",
      "var(--c)",
      "color-mix(in srgb, var(--c) 10%, transparent)",
      "var(--insp-peek, 32px)",
      "1px solid var(--zinc-200)",
    ];
    expect(good.flatMap((v) => literals(v))).toEqual([
      "not a token --insp-peek",
    ]);
    expect(literals("var(--insp-peek, 32px)", "height")).toEqual([]);
  });

  it("has the tokens for the mockup rgba() values", () => {
    const tokens = readFileSync(path.join(SRC, "tokens.css"), "utf8");
    for (const value of [
      "rgba(255, 255, 255, 0.92)",
      "rgba(244, 244, 245, 0.86)",
      "rgba(24, 24, 27, 0.3)",
    ])
      expect(tokens).toContain(value);
    for (const [name, hex] of [
      ["--select", "#2563eb"],
      ["--danger", "#b91c1c"],
    ])
      expect(tokens).toContain(`${name}: ${hex};`);
  });
});

describe("S17 the one-line rules of the controls (STORY-004-03 rule 9)", () => {
  const controls = read("shell-controls.css");

  it.each([".fam-tab", ".pick-btn", ".pill", ".ctl-btn"])(
    "%s keeps one line",
    (selector) => {
      expect(ruleOf(controls, selector)?.body).toContain("white-space: nowrap");
    },
  );

  it("cuts the name of a picker item with an ellipsis", () => {
    const body = ruleOf(controls, ".pick-item .nm")?.body ?? [];
    for (const d of [
      "overflow: hidden",
      "text-overflow: ellipsis",
      "white-space: nowrap",
    ])
      expect(body).toContain(d);
  });
});

// why: STORY-004-03 rule 7 — the mockup CATEGORIES values (lib/topology.js lines 34-39) by the
// place of the family in the engine familyOrder()
const FAMILY_SETS = [
  ["#dcfce7", "#acd8bc", "#16a34a"],
  ["#e0e7ff", "#b9b7dc", "#4f46e5"],
  ["#cffafe", "#a3d5e1", "#0891b2"],
  ["#fef3c7", "#e4c095", "#d97706"],
  ["#f1f5f9", "#b3bdcc", "#475569"],
  ["#f4f4f5", "#d4d4d8", "#71717a"],
];

describe("S21 the family token sets (STORY-004-03 rule 7)", () => {
  const tokens = read("tokens.css");
  const root = ruleOf(tokens, ":root")?.body ?? [];

  it.each(FAMILY_SETS.map((set, place) => [place, ...set] as const))(
    "set %i has the mockup tint, border and main",
    (place, tint, border, main) => {
      expect(root).toContain(`--fam-${place}-tint: ${tint}`);
      expect(root).toContain(`--fam-${place}-border: ${border}`);
      expect(root).toContain(`--fam-${place}-main: ${main}`);
    },
  );

  // why: the class rules are in shell-controls.css, because each .qt- class of tokens.css is a
  // canvas class (EPIC-003 B7)
  it.each(FAMILY_SETS.map((_, place) => place))(
    "the class qt-fam-%i reads its three tokens",
    (place) => {
      expect(ruleOf(tokens, `.qt-fam-${place}`)).toBeUndefined();
      expect(
        ruleOf(read("shell-controls.css"), `.qt-fam-${place}`)?.body,
      ).toEqual([
        `--tint: var(--fam-${place}-tint)`,
        `--pill-border: var(--fam-${place}-border)`,
        `--main: var(--fam-${place}-main)`,
      ]);
    },
  );

  it("has no other family set", () => {
    expect(root.filter((d) => d.startsWith("--fam-"))).toHaveLength(18);
  });
});
