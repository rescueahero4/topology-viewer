// why: TL-8 — the one DOM allow-list of EPIC-003 (rules DA-1 to DA-5, SA §10 guardrail 8, SA §11
// harm criterion 2). A later story adds only its own element, attribute and class names

export const SVG_NS = "http://www.w3.org/2000/svg";
export const HTML_NS = "http://www.w3.org/1999/xhtml";

export const CLASS_NAMES: readonly string[] = [
  "qt-root",
  "qt-svg",
  "qt-viewport",
  "qt-node",
  "qt-grouped",
  "qt-leaf",
  "qt-name",
  "qt-sub",
  "qt-a11y",
  "qt-badge",
  "qt-more",
  "qt-open",
  "qt-mark",
  "qt-nomark",
  "qt-lod-mid",
  "qt-lod-low",
  "qt-big",
  "qt-culled",
  "qt-hl",
  // why: STORY-003-03 — edges, selection, halo, pills and tooltip
  "qt-edge",
  "qt-ehit",
  "qt-dashed",
  "qt-muted",
  "qt-picked",
  "qt-dim",
  "qt-selected",
  "qt-focus",
  "qt-pulse",
  "qt-paused",
  "qt-elabel",
  "qt-tip",
  "qt-tip-main",
  "qt-tip-sub",
  "qt-on",
];

// why: the attributes of the sprite allow-list of `scripts/build-icons.mjs`
const SPRITE = [
  "fill",
  "stroke",
  "d",
  "transform",
  "points",
  "stroke-linecap",
  "stroke-linejoin",
  "fill-rule",
  "clip-rule",
  "fill-opacity",
  "stroke-width",
  "stroke-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
];
const SHAPE = ["class", ...SPRITE];

export const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  div: ["class"],
  svg: ["class", "role", "aria-label"],
  defs: [],
  symbol: ["id", "viewBox", "fill"],
  g: ["class", "tabindex", "aria-labelledby", ...SPRITE],
  use: ["href", "x", "y", "width", "height"],
  path: [...SHAPE, "marker-end"],
  rect: SHAPE,
  circle: SHAPE,
  ellipse: SHAPE,
  line: SHAPE,
  polyline: SHAPE,
  polygon: SHAPE,
  text: ["class", "id", "x", "y", "dy", "fill", "font-size"],
  tspan: ["class"],
  // why: STORY-003-03 — the arrowhead constants of mockup `markerFor` (lib/topology.js lines
  // 446-457)
  marker: [
    "id",
    "viewBox",
    "refX",
    "refY",
    "markerUnits",
    "markerWidth",
    "markerHeight",
    "orient",
  ],
};

export const NUMERIC: ReadonlySet<string> = new Set([
  "fill-opacity",
  "stroke-width",
  "stroke-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "font-size",
  "tabindex",
  "refX",
  "refY",
  "markerWidth",
  "markerHeight",
]);

const NUMBER = String.raw`-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?`;
const NUMBERS = String.raw`${NUMBER}(?:[\s,]+${NUMBER})*`;
// why: SA §4.1 — the path-data pattern and the glyph cap
export const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/;
export const GLYPH_CAP = 512;
export const FORMS: Readonly<Record<string, RegExp>> = {
  d: PATH_DATA,
  dy: /^\d+(\.\d+)?em$/,
  points: new RegExp(String.raw`^${NUMBERS}$`),
  role: /^group$/,
  transform: new RegExp(
    String.raw`^(?:\s*(?:translate|scale|rotate|matrix)\(${NUMBERS}\)\s*)+$`,
  ),
  viewBox: new RegExp(String.raw`^${NUMBER} ${NUMBER} ${NUMBER} ${NUMBER}$`),
  "stroke-linecap": /^(butt|round|square)$/,
  "stroke-linejoin": /^(miter|round|bevel)$/,
  "fill-rule": /^(nonzero|evenodd)$/,
  "clip-rule": /^(nonzero|evenodd)$/,
  markerUnits: /^userSpaceOnUse$/,
  orient: /^auto$/,
};
// why: the FORMS entries that allow only a closed list of keywords
export const KEYWORD_FORMS: ReadonlySet<string> = new Set([
  "role",
  "stroke-linecap",
  "stroke-linejoin",
  "fill-rule",
  "clip-rule",
  "markerUnits",
  "orient",
]);
export const ONE_NUMBER = new RegExp(`^${NUMBER}$`);
export const COLOUR = /^#[0-9a-f]{6}$/;

const RGBA_ZERO = /^rgba\(0,0,0,0\)$/;
const K = /^[0-9]+(\.[0-9]+)?$/;
const PX = /^-?[0-9]+(\.[0-9]+)?(e[+-]?[0-9]+)?px$/;
export const STYLES: Readonly<
  Record<string, Readonly<Record<string, (v: string) => boolean>>>
> = {
  "div.qt-root": {
    "--k": (v) => K.test(v) && Number(v) >= 0.05 && Number(v) <= 6,
  },
  "svg.qt-svg": { "-webkit-tap-highlight-color": (v) => RGBA_ZERO.test(v) },
  "g.qt-node": {
    "touch-action": (v) => v === "none",
    "-webkit-tap-highlight-color": (v) => RGBA_ZERO.test(v),
  },
  "div.qt-tip": { left: (v) => PX.test(v), top: (v) => PX.test(v) },
};
