import { NODE_DESIGN_GUIDE, profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import {
  canvasColor,
  parseColor,
  rgbHsl,
  rgbOfHex,
  type Hex,
  type Rgb,
} from "./colors";
import { resolveVocab, type Vocab } from "./resolve";
import {
  BASE_SIZE,
  contrast,
  guardColor,
  guardHsl,
  MAX_SATURATION,
  MAX_SIZE,
  MIN_CONTRAST,
  RANK_STEP,
  type Designed,
} from "./visual";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const DARK = canvasColor("#18181B") as Hex;
const HEX = /^#[0-9a-f]{6}$/;

function resolved(input: unknown, canvas: Hex = LIGHT) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return resolveVocab(result.graph, result.payload, profile, canvas);
}

function designed(vocab: Vocab, type: string): Designed {
  const visual = vocab.types.get(type)?.visual;
  if (visual === undefined || "icon" in visual)
    throw new Error(`no design for ${type}`);
  return visual;
}

const nodes = (...types: string[]) =>
  types.map((type, i) => ({ id: `n${i}`, type }));
const parsed = (text: string) => parseColor(text) as Rgb;

describe("S7 s-ladder", () => {
  it("gives the rank ladder shapes, sizes and letters", () => {
    const { vocab } = resolved(loadFixture("s-ladder").input);
    const rows = [...vocab.types.keys()].map((type) => {
      const { shape, size, letters } = designed(vocab, type);
      return [type, shape, size, letters];
    });
    expect(rows).toEqual([
      ["company", "octagon", 56, "CO"],
      ["division", "heptagon", 50, "DV"],
      ["department", "hexagon", 44, "DP"],
      ["team", "pentagon", 38, "TM"],
      ["project", "square", 32, "PJ"],
      ["milestone", "diamond", 32, "MS"],
      ["task", "triangle", 26, "TK"],
      ["subtask", "circle", 20, "ST"],
    ]);
  });
});

describe("S8 s-unsafe-colors", () => {
  const { input } = loadFixture("s-unsafe-colors");
  const { vocab } = resolved(input);
  const inputs = [
    "#00FF00",
    "#FF00FF",
    "#FFFF00",
    "#EEEEEE",
    "#00FFFF",
    "#FF3300",
    "#C8FACC",
  ];

  it("guards the 7 colours as the mockup guard with the 20 % floor", () => {
    const order = Object.keys((input as { types: object }).types);
    const visuals = order.map((type) => designed(vocab, type));
    expect(visuals.map((v) => v.colorIn)).toEqual(
      inputs.map((c) => c.toLowerCase()),
    );
    expect(visuals.map((v) => v.color)).toEqual([
      "#2e9e2e",
      "#c639c6",
      "#8e8e29",
      "#8d8d8d",
      "#2c9696",
      "#c65539",
      "#2e9f37",
    ]);
    expect(
      visuals.every((v) => v.adjusted && HEX.test(v.color) && HEX.test(v.ink)),
    ).toBe(true);
    for (const v of visuals) {
      const ratio = contrast(rgbOfHex(v.color), rgbOfHex(LIGHT));
      expect(ratio).toBeGreaterThanOrEqual(3);
      expect(ratio).toBeLessThanOrEqual(4.02);
    }
  });

  it("caps the saturation before the rounding", () => {
    for (const input of inputs) {
      const rgb = parsed(input);
      expect(guardHsl(rgb, LIGHT)[1]).toBe(
        Math.min(rgbHsl(rgb)[1], MAX_SATURATION),
      );
    }
  });

  it("raises black to #333333", () => {
    const { vocab } = resolved({
      nodes: nodes("x"),
      types: { x: { color: "#000000" } },
    });
    const { color } = designed(vocab, "x");
    expect(color).toBe("#333333");
    expect(contrast(rgbOfHex(color), rgbOfHex(LIGHT))).toBeCloseTo(11.49, 2);
  });
});

describe("S10 the guard on both canvases", () => {
  it("gives 3:1 against each canvas", () => {
    for (const canvas of [LIGHT, DARK]) {
      const { vocab } = resolved(loadFixture("s-designed").input, canvas);
      for (const type of vocab.types.values()) {
        if ("icon" in type.visual) continue;
        const ratio = contrast(rgbOfHex(type.visual.color), rgbOfHex(canvas));
        expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  it("takes only a parsed canvas value", () => {
    const result = normalize({ nodes: [{ id: "a" }] }, { now: "2026-10-14" });
    if (!result.ok) throw new Error("fatal");
    const raw = () =>
      // @ts-expect-error a raw string is not a canvas colour
      resolveVocab(result.graph, result.payload, profile, "#F4F4F5");
    expect(raw).not.toThrow();
    expect(canvasColor("var(--canvas)")).toBeNull();
    expect(canvasColor(" #F4F4F5 ")).toBe("#f4f4f5");
    expect(guardColor(parsed("#000000"), DARK)).toMatch(HEX);
  });
});

describe("S11 s-designed", () => {
  const { vocab } = resolved(loadFixture("s-designed").input);

  it("keeps the declared ranks, shapes, letters and colours", () => {
    expect(designed(vocab, "supplier")).toMatchObject({
      shape: "diamond",
      rank: 2,
      letters: "SU",
    });
    expect(designed(vocab, "factory")).toMatchObject({
      shape: "square",
      rank: 2,
      letters: "FA",
    });
    expect(designed(vocab, "regulation")).toMatchObject({
      shape: "hexagon",
      size: 44,
      letters: "RG",
    });
    const declared = loadFixture("s-designed").input as {
      types: Record<string, { color: string }>;
    };
    for (const [type, entry] of Object.entries(declared.types))
      expect(designed(vocab, type)).toMatchObject({
        colorIn: entry.color.toLowerCase(),
        color: entry.color.toLowerCase(),
        adjusted: false,
      });
    expect(designed(vocab, "supplier").ink).toBe("#ffffff");
    expect(designed(vocab, "shipment").ink).toBe("#0f172a");
  });
});

describe("S12 s-designed-glyph", () => {
  it("copies the accepted glyph byte-equal and keeps the letters of the others", () => {
    const { input } = loadFixture("s-designed-glyph");
    const { vocab } = resolved(input);
    const sent = (input as { types: Record<string, { glyph?: string }> }).types;
    for (const type of [
      "shipment",
      "kpi",
      "product",
      "factory",
      "regulation",
    ]) {
      expect(designed(vocab, type).glyph).toBe(sent[type].glyph);
      expect(designed(vocab, type)).not.toHaveProperty("letters");
    }
    expect(designed(vocab, "supplier").letters).toBe("SU");
    expect(designed(vocab, "site").letters).toBe("CO");
  });
});

describe("S13 s-undeclared", () => {
  const { input } = loadFixture("s-undeclared");
  const { vocab, issues } = resolved(input);
  const undeclared = [...vocab.types.values()].filter((t) => !t.declared);
  const palette = [...vocab.types.values()]
    .filter((t) => !t.declared)
    .map((t) => (t.visual as Designed).color);

  it("draws 11 rank-0 circles with distinct letters and palette colours", () => {
    expect(undeclared).toHaveLength(11);
    for (const type of undeclared)
      expect(type.visual).toMatchObject({ rank: 0, shape: "circle", size: 20 });
    const letters = undeclared.map((t) => (t.visual as Designed).letters);
    expect(new Set(letters).size).toBe(11);
    expect(letters).not.toContain("DM");
    expect(letters).not.toContain("PL");
    expect(designed(vocab, "process").letters).toBe("PR");
    expect(designed(vocab, "product").letters).toBe("PD");
    expect(designed(vocab, "project").letters).toBe("PJ");
    expect(new Set(palette).size).toBe(11);
    expect(issues.filter((i) => i.code === "unknown-type")).toHaveLength(11);
  });

  it("keeps the profile rank, letters and guarded colour of domain and policy", () => {
    expect(designed(vocab, "domain")).toMatchObject({
      rank: 0,
      letters: "DM",
      color: "#523781",
    });
    expect(designed(vocab, "policy")).toMatchObject({
      rank: 0,
      letters: "PL",
      color: "#813743",
    });
  });

  it("takes palette entry 1 again for the 13th undeclared type", () => {
    const data = structuredClone(input) as { nodes: object[] };
    data.nodes.push({ id: "x12", type: "zeta" }, { id: "x13", type: "omega" });
    const more = resolved(data).vocab;
    const colors = [...more.types.values()]
      .filter((t) => !t.declared)
      .map((t) => t.visual as Designed);
    expect(colors).toHaveLength(13);
    expect(colors[12].color).toBe(colors[0].color);
    expect(new Set(colors.map((v) => v.letters)).size).toBe(13);
  });
});

describe("S19 NODE_DESIGN_GUIDE numbers", () => {
  it("names the engine constants", () => {
    expect(NODE_DESIGN_GUIDE).toContain(`${MAX_SATURATION}%`);
    expect(NODE_DESIGN_GUIDE).toContain(`${MIN_CONTRAST}:1`);
    expect(NODE_DESIGN_GUIDE).toContain(
      `rank 0 is ${BASE_SIZE}px and each rank adds ${RANK_STEP}px`,
    );
    expect(NODE_DESIGN_GUIDE).toContain(`${MAX_SIZE}px at rank 6`);
    expect([
      MAX_SATURATION,
      MIN_CONTRAST,
      BASE_SIZE,
      RANK_STEP,
      MAX_SIZE,
    ]).toEqual([55, 3, 20, 6, 56]);
  });
});

describe("S41 one letters rule", () => {
  it("derives SP and keeps a sent SU", () => {
    expect(
      designed(resolved({ nodes: nodes("supplier") }).vocab, "supplier")
        .letters,
    ).toBe("SP");
    const sent = resolved({
      nodes: nodes("supplier"),
      types: { supplier: { abbr: "SU" } },
    });
    expect(designed(sent.vocab, "supplier").letters).toBe("SU");
  });
});

describe("S44 q-full-vocabulary icons and icon-less types", () => {
  it("gives 18 icons and 8 profile designs unchanged by the guard", () => {
    const { vocab } = resolved(loadFixture("q-full-vocabulary").input);
    const icons = [...vocab.types.values()].filter((t) => "icon" in t.visual);
    expect(icons).toHaveLength(18);
    const expected: [string, string, string][] = [
      ["classification", "#815937", "CL"],
      ["domain", "#523781", "DM"],
      ["policy", "#813743", "PL"],
      ["metric", "#377481", "MT"],
      ["external_system", "#375681", "ES"],
      ["model", "#813781", "MD"],
      ["keyword", "#37815c", "KY"],
      ["bk", "#688137", "BK"],
    ];
    for (const [type, color, letters] of expected)
      expect(designed(vocab, type)).toStrictEqual({
        rank: 0,
        shape: "circle",
        size: 20,
        color,
        colorIn: color,
        adjusted: false,
        ink: designed(vocab, type).ink,
        letters,
      });
  });
});

describe("guardColor channels (Security minor (a))", () => {
  it("refuses a channel that is not an integer 0-255", () => {
    for (const rgb of [
      [NaN, 1, 2],
      [1.5, 0, 0],
      [-1, 0, 0],
      [256, 0, 0],
      [Infinity, 0, 0],
    ] as unknown as Rgb[])
      expect(() => guardColor(rgb, LIGHT)).toThrow(RangeError);
    expect(() => guardColor([1, 2] as unknown as Rgb, LIGHT)).toThrow(
      RangeError,
    );
    expect(() => guardColor([0, 0, 0], "#zzzzzz" as Hex)).toThrow(RangeError);
    for (const rgb of [
      [0, 0, 0],
      [255, 255, 255],
      [12, 200, 99],
    ] as Rgb[])
      expect(guardColor(rgb, LIGHT)).toMatch(HEX);
  });
});
