import type { Issue, RenderInput } from "@qdic-topology/contract";
import {
  hexOf,
  hslRgb,
  parseColor,
  rgbHsl,
  rgbOfHex,
  type Hex,
  type Hsl,
  type Rgb,
} from "./colors";

type TypeEntry = NonNullable<NonNullable<RenderInput["types"]>[string]>;
export type Shape = NonNullable<TypeEntry["shape"]>;

// why: FR-VOC-4 and NODE_DESIGN_GUIDE §2, §4 (mockup lib/topology.js lines 147-157, ddr-0031)
export const MAX_SATURATION = 55;
export const MIN_CONTRAST = 3;
export const BASE_SIZE = 20;
export const RANK_STEP = 6;
export const MAX_SIZE = 56;
// why: open question 2 (Product Owner, option (b)) — no black on the light canvas; the dark
// canvas lightens in 2 % steps up to 80 %
const MIN_LIGHTNESS = 20;
const MAX_LIGHTNESS = 80;
const STEP = 2;
const DARKEST = 5;
const TEXT_CONTRAST = 4.5;

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const INK: Rgb = [15, 23, 42];

const RANK_SHAPE: readonly Shape[] = [
  "circle",
  "triangle",
  "square",
  "pentagon",
  "hexagon",
  "heptagon",
  "octagon",
];
const SHAPE_RANK: Readonly<Record<Shape, number>> = {
  circle: 0,
  triangle: 1,
  square: 2,
  diamond: 2,
  pentagon: 3,
  hexagon: 4,
  heptagon: 5,
  octagon: 6,
};

// why: open question 3 (Product Owner, option (b)) — the 6 mockup colours (line 58), then six
// hues at 30 % saturation and 42 % lightness; each goes through the guard
const FALLBACK = [
  "#6B7280",
  "#7C6F64",
  "#5F7A8A",
  "#8A6F8F",
  "#6F8A6B",
  "#8A7B5F",
];
const HUES = [15, 75, 135, 195, 255, 315];

export type Designed = {
  rank: number;
  shape: Shape;
  size: number;
  color: Hex;
  colorIn?: Hex;
  adjusted: boolean;
  ink: Hex;
  letters?: string;
  glyph?: string;
};
export type Visual = { icon: string } | Designed;

export type VisualSpec = {
  name: string | null;
  icon?: string;
  markLabel: string;
  rank?: number;
  shape?: Shape;
  color?: string;
  profileColor?: string;
  abbr?: string;
  glyph?: string;
};

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// why: mockup `guardColor` (lib/topology.js lines 221-228) as it is, then question 2: the
// lightness floor on a light canvas, and lighten steps on a dark canvas (D16)
export function guardHsl(rgb: Rgb, canvas: Hex): Hsl {
  const back = rgbOfHex(canvas);
  const [h, sat, start] = rgbHsl(rgb);
  const s = Math.min(sat, MAX_SATURATION);
  const reads = (l: number) =>
    contrast(hslRgb([h, s, l]), back) >= MIN_CONTRAST;
  let l = start;
  if (contrast(back, BLACK) >= contrast(back, WHITE)) {
    while (!reads(l) && l > DARKEST) l -= STEP;
    return [h, s, Math.max(l, MIN_LIGHTNESS)];
  }
  while (!reads(l) && l < MAX_LIGHTNESS) l = Math.min(l + STEP, MAX_LIGHTNESS);
  return [h, s, l];
}

export function guardColor(rgb: Rgb, canvas: Hex): Hex {
  return hexOf(hslRgb(guardHsl(rgb, canvas)));
}

// why: mockup `designIcon` ink rule (lib/topology.js line 260) — text by contrast
function inkOf(color: Hex): Hex {
  const fill = rgbOfHex(color);
  const white = contrast(WHITE, fill);
  return hexOf(
    white >= TEXT_CONTRAST || white >= contrast(INK, fill) ? WHITE : INK,
  );
}

function paletteOf(canvas: Hex): Hex[] {
  const base = [
    ...FALLBACK.map((hex) => parseColor(hex) as Rgb),
    ...HUES.map((h) => hslRgb([h, 30, 42])),
  ];
  return base.map((rgb) => guardColor(rgb, canvas));
}

const LETTER = /\p{L}/u;
const LATIN = /\p{Script=Latin}/u;
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function upper(point: string): string {
  const up = point.toUpperCase();
  return Array.from(up).length === 1 ? up : point;
}

// why: FR-VOC-4 and SA §11 Untrusted input — a mark holds letters only, at most 2 code points, so
// no control, bidi, combining or markup character reaches the SVG text
export function declaredLetters(abbr: string | undefined): string | undefined {
  const points = Array.from(abbr ?? "").filter((point) => LETTER.test(point));
  const letters = points.slice(0, 2).map(upper).join("");
  return letters === "" ? undefined : letters;
}

function wordsOf(label: string): string[][] {
  const words: string[][] = [];
  let word: string[] = [];
  for (const point of label.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")) {
    if (LETTER.test(point) && LATIN.test(point)) word.push(upper(point));
    else if (word.length > 0) {
      words.push(word);
      word = [];
    }
  }
  if (word.length > 0) words.push(word);
  return words;
}

// why: mockup `abbrFor` (lib/topology.js lines 230-240) over Latin-script letters; a label with
// no Latin letter gives its first letter (FR-CANVAS-15, f-0055)
export function derivedLetters(label: string, used: ReadonlySet<string>) {
  const words = wordsOf(label);
  const letters = words.flat();
  const other = Array.from(label).find((point) => LETTER.test(point));
  if (letters.length === 0 && other !== undefined) return upper(other);
  const first = letters[0] ?? "X";
  const rest = letters.slice(1);
  const candidates = [
    ...(words.length > 1 ? [words[0][0] + words[1][0]] : []),
    ...rest.filter((c) => !VOWELS.has(c)).map((c) => first + c),
    ...rest.map((c) => first + c),
    ...Array.from(ALPHABET, (c) => first + c),
  ];
  return candidates.find((c) => !used.has(c)) ?? first + first;
}

function shapeOf(spec: VisualSpec): { rank: number; shape: Shape } {
  const rank = spec.rank ?? (spec.shape ? SHAPE_RANK[spec.shape] : 0);
  const shape =
    spec.shape !== undefined && SHAPE_RANK[spec.shape] === rank
      ? spec.shape
      : RANK_SHAPE[rank];
  return { rank, shape };
}

type Tint = { color: Hex; colorIn?: Hex; adjusted: boolean };

function tintOf(
  spec: VisualSpec,
  canvas: Hex,
  next: () => Hex,
  issues: Issue[],
): Tint {
  const parsed = spec.color === undefined ? null : parseColor(spec.color);
  if (spec.color !== undefined && parsed === null && spec.name !== null)
    issues.push({
      code: "color-rejected",
      path: ["types", spec.name, "color"],
    });
  const input =
    parsed ??
    (spec.profileColor === undefined ? null : parseColor(spec.profileColor));
  if (input === null) return { color: next(), adjusted: false };
  const colorIn = hexOf(input);
  const color = guardColor(input, canvas);
  return { color, colorIn, adjusted: color !== colorIn };
}

// why: FR-VOC-4 and decision Q8 — a payload or profile colour is parsed and guarded; every colour
// is `#rrggbb` built from numbers, and a rejected input gives only `{ code, path }`
export function visualsOf(
  specs: VisualSpec[],
  claimed: string[],
  canvas: Hex,
): { visuals: Visual[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const palette = paletteOf(canvas);
  let index = 0;
  const next = () => palette[index++ % palette.length];
  const used = new Set(claimed.flatMap((abbr) => declaredLetters(abbr) ?? []));
  for (const spec of specs) {
    const letters = spec.icon ? undefined : declaredLetters(spec.abbr);
    if (letters !== undefined) used.add(letters);
  }
  const visuals = specs.map((spec): Visual => {
    if (spec.icon !== undefined) return { icon: spec.icon };
    const { rank, shape } = shapeOf(spec);
    const tint = tintOf(spec, canvas, next, issues);
    const size = Math.min(BASE_SIZE + RANK_STEP * rank, MAX_SIZE);
    const ink = inkOf(tint.color);
    if (spec.glyph !== undefined)
      return { rank, shape, size, ...tint, ink, glyph: spec.glyph };
    if (spec.name === null) return { rank, shape, size, ...tint, ink };
    let letters = declaredLetters(spec.abbr);
    if (letters === undefined) {
      letters = derivedLetters(spec.markLabel, used);
      used.add(letters);
    }
    return { rank, shape, size, ...tint, ink, letters };
  });
  return { visuals, issues };
}
