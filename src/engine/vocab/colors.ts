export type Rgb = readonly [number, number, number];
export type Hsl = readonly [number, number, number];

declare const HEX: unique symbol;
export type Hex = string & { readonly [HEX]: true };

// why: SA §4.1 and decision Q8 — the contract bound of `types[t].color`, checked again here
const LIMIT = 64;

// why: decision Q8 — the 148 named colours of CSS Color Module Level 4 §6.1, a fixed table with
// no `transparent`, `currentcolor` or system colour
const NAMES = `
aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc
bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a
burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50
cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b
darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9
darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc
darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f
darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff
dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0
forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700
goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0
hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa
lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080
lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90
lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa
lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0
lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa
mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371
mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585
midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead
navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500
orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093
papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6
purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1
saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee
sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090
slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080
thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff
whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32
`;

const HEX_DIGITS = /^[0-9a-f]+$/;
const OUTER_SPACE = /^[\t\n\f\r ]+|[\t\n\f\r ]+$/g;
const FUNCTION = /^(rgba?|hsla?)[ \t]*\(([^()]*)\)$/;
const NUMBER = /^(\d+(\.\d+)?|\.\d+)$/;

function hexRgb(digits: string): Rgb {
  const full =
    digits.length === 3 ? digits.replace(/./g, "$&$&") : digits.slice(0, 6);
  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return [channel(0), channel(2), channel(4)];
}

function namedTable(): Record<string, Rgb> {
  const table = Object.create(null) as Record<string, Rgb>;
  for (const pair of NAMES.trim().split(/\s+/)) {
    const [name, digits] = pair.split(":");
    table[name] = hexRgb(digits);
  }
  return table;
}

export const NAMED: Readonly<Record<string, Rgb>> = namedTable();

export function hexOf(rgb: Rgb): Hex {
  const text = rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  return `#${text}` as Hex;
}

export function rgbOfHex(hex: Hex): Rgb {
  return hexRgb(hex.slice(1));
}

// why: mockup `hslToHex` (lib/topology.js lines 41-46), ported as it is
export function hslRgb([h, s, l]: Hsl): Rgb {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) =>
    Math.round(
      255 *
        (light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))),
    );
  return [f(0), f(8), f(4)];
}

// why: mockup `rgbToHsl` (lib/topology.js lines 207-213), ported as it is
export function rgbHsl(rgb: Rgb): Hsl {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function lowerAscii(text: string): string {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function parseHex(text: string): Rgb | null {
  const hash = text.startsWith("#");
  const digits = hash ? text.slice(1) : text;
  if (!HEX_DIGITS.test(digits)) return null;
  const sizes = hash ? [3, 4, 6, 8] : [3, 6];
  if (!sizes.includes(digits.length)) return null;
  return hexRgb(digits.length === 4 ? digits.slice(0, 3) : digits);
}

type Part = { value: number; percent: boolean; unit: string };

function part(token: string): Part | null {
  const unit = token.endsWith("%") ? "%" : token.endsWith("deg") ? "deg" : "";
  const text = token.slice(0, token.length - unit.length);
  if (!NUMBER.test(text)) return null;
  return { value: Number(text), percent: unit === "%", unit };
}

type Args = { parts: Part[]; alpha: Part | null };

const trimmed = (text: string) => text.replace(/^[ \t]+|[ \t]+$/g, "");

function argsOfTokens(
  tokens: string[],
  alpha: string | undefined,
): Args | null {
  const parts = tokens.map(part);
  if (parts.some((p) => p === null)) return null;
  if (alpha === undefined) return { parts: parts as Part[], alpha: null };
  const a = part(alpha);
  return a === null ? null : { parts: parts as Part[], alpha: a };
}

// why: decision Q8 — comma syntax `a, b, c[, d]` or space syntax `a b c[ / d]`; the two never mix
function argsOf(body: string): Args | null {
  if (body.includes(",")) {
    if (body.includes("/")) return null;
    const tokens = body.split(",").map(trimmed);
    if (tokens.length !== 3 && tokens.length !== 4) return null;
    return argsOfTokens(tokens.slice(0, 3), tokens[3]);
  }
  const halves = body.split("/");
  if (halves.length > 2) return null;
  const tokens = trimmed(halves[0]).split(/[ \t]+/);
  if (tokens.length !== 3) return null;
  return argsOfTokens(
    tokens,
    halves[1] === undefined ? undefined : trimmed(halves[1]),
  );
}

function alphaOk(alpha: Part | null): boolean {
  if (alpha === null) return true;
  if (alpha.unit === "deg") return false;
  return alpha.value <= (alpha.percent ? 100 : 1);
}

function rgbOfParts(parts: Part[]): Rgb | null {
  const percent = parts[0].percent;
  if (parts.some((p) => p.percent !== percent || p.unit === "deg")) return null;
  const max = percent ? 100 : 255;
  if (parts.some((p) => p.value > max)) return null;
  // why: decision Q8 — a percentage p gives p × 2.55, rounded half up
  const [r, g, b] = parts.map((p) =>
    Math.floor((percent ? (p.value * 255) / 100 : p.value) + 0.5),
  );
  return [r, g, b];
}

function hslOfParts([hue, sat, light]: Part[]): Rgb | null {
  if (hue.percent || !sat.percent || !light.percent) return null;
  if (hue.value > 360 || sat.value > 100 || light.value > 100) return null;
  return hslRgb([hue.value, sat.value, light.value]);
}

function parseFunction(text: string): Rgb | null {
  const match = FUNCTION.exec(text);
  if (match === null) return null;
  const args = argsOf(match[2]);
  if (args === null || !alphaOk(args.alpha)) return null;
  return match[1].startsWith("rgb")
    ? rgbOfParts(args.parts)
    : hslOfParts(args.parts);
}

// why: SA §4.1 "parsed as a CSS color" and decision Q8 — a closed grammar with no browser, no
// library and no `eval`; anything outside it is rejected, never clamped
export function parseColor(input: string): Rgb | null {
  if (input.length > LIMIT) return null;
  const text = lowerAscii(input.replace(OUTER_SPACE, ""));
  if (Object.hasOwn(NAMED, text)) return NAMED[text];
  return parseHex(text) ?? parseFunction(text);
}

// why: SA §2 Styling — the guard takes the canvas as a parsed `#rrggbb` value, never a raw host
// string (S10)
export function canvasColor(input: string): Hex | null {
  const rgb = parseColor(input);
  return rgb === null ? null : hexOf(rgb);
}
