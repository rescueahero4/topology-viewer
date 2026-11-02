import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// why: SA §2, ddr-0012 — the `tier` of each icon, equal to `tier` in the v56 mockup
// `lib/node-icons.js` (the file that the mockup build made from the same 18 Figma exports)
/** @type {Record<string, string>} */
const TIERS = {
  asset_group: "group",
  bigroup: "group",
  column: "leaf",
  dashboard: "asset",
  data_source: "source",
  database: "container",
  etl: "asset",
  property: "leaf",
  property_set: "group",
  report: "leaf",
  schema: "asset",
  schema_lg: "container",
  table: "asset",
  tag: "leaf",
  tag_group: "group",
  user: "leaf",
  user_group: "group",
  view: "asset",
};

const SVG_NS = "http://www.w3.org/2000/svg";
const INPUT = path.join("assets", "figma-raw");
const OUTPUT = path.join("src", "renderer", "sprite.json");
const TAGS = new Set([
  "g",
  "path",
  "circle",
  "rect",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);
const NUMBER = String.raw`-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?`;
const NUMBERS = String.raw`${NUMBER}(?:[\s,]+${NUMBER})*`;
const ONE_NUMBER = new RegExp(`^${NUMBER}$`);
const VIEW_BOX = new RegExp(`^0 0 ${NUMBER} ${NUMBER}$`);
const POINTS = new RegExp(String.raw`^\s*${NUMBERS}\s*$`);
const TRANSFORM = new RegExp(
  String.raw`^\s*(?:(?:rotate|translate|scale|matrix)\(\s*${NUMBERS}\s*\)\s*)+$`,
);
// why: SA §4.1 — the path-data pattern of `types[t].glyph`, applied to the icon `d` values
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/;
const COLOUR = /^(?:#[0-9a-fA-F]{6}|none|white)$/;
/** @type {Record<string, string[]>} */
const KEYWORDS = {
  "stroke-linecap": ["butt", "round", "square"],
  "stroke-linejoin": ["miter", "round", "bevel"],
  "fill-rule": ["nonzero", "evenodd"],
  "clip-rule": ["nonzero", "evenodd"],
};
const NUMERIC = new Set([
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
]);

class IconError extends Error {}

/**
 * @typedef {[string, Record<string, string>, SvgNode[]]} SvgNode
 * @typedef {{ w: number, h: number, tier: string, color: string, fill: string, body: SvgNode[] }} Icon
 */

/** @param {string} file @param {string} what @param {string} reason @returns {never} */
function fail(file, what, reason) {
  throw new IconError(`${file}: ${what}: ${reason}`);
}

/** @param {string} name @param {string} value @param {boolean} isRoot */
function valueAllowed(name, value, isRoot) {
  if (name === "xmlns") return isRoot && value === SVG_NS;
  if (name === "viewBox") return isRoot && VIEW_BOX.test(value);
  if (name === "fill" || name === "stroke") return COLOUR.test(value);
  if (name === "d") return PATH_DATA.test(value);
  if (name === "transform") return TRANSFORM.test(value);
  if (name === "points") return POINTS.test(value);
  if (Object.hasOwn(KEYWORDS, name)) return KEYWORDS[name].includes(value);
  return NUMERIC.has(name) && ONE_NUMBER.test(value);
}

/**
 * @param {string} file @param {string} tag @param {string} name @param {string} value
 * @param {boolean} isRoot
 */
function checkAttribute(file, tag, name, value, isRoot) {
  if (name.includes(":")) fail(file, name, "namespaced attribute");
  if (/url\(/i.test(value)) fail(file, name, "url( in a value");
  if (value.includes("&")) fail(file, name, "entity or character reference");
  if (!valueAllowed(name, value, isRoot))
    fail(file, `${tag} ${name}`, "attribute or value not in the allow-list");
}

// why: DOM audit rule DA-2 — the sprite holds each colour in the one form the audit accepts
/** @param {string} name @param {string} value */
function colourForm(name, value) {
  if (name !== "fill" && name !== "stroke") return value;
  return value === "white" ? "#ffffff" : value.toLowerCase();
}

/** @param {string} file @param {string} text @param {number} at */
function checkMarkup(file, text, at) {
  const rest = text.slice(at, at + 9);
  if (rest.startsWith("<!--")) fail(file, "<!--", "comment");
  if (rest.startsWith("<![CDATA[")) fail(file, "<![CDATA[", "CDATA section");
  if (rest.startsWith("<!")) fail(file, rest, "declaration");
  if (rest.startsWith("<?")) fail(file, "<?", "processing instruction");
}

/** @param {string} file @param {string} text @param {number} at */
function readText(file, text, at) {
  const end = text.indexOf("<", at);
  const stop = end === -1 ? text.length : end;
  const chunk = text.slice(at, stop);
  if (chunk.includes("&")) fail(file, "text", "entity or character reference");
  if (chunk.trim() !== "") fail(file, "text", "text that is not white space");
  return stop;
}

const NAME = /[A-Za-z][A-Za-z0-9:_.-]*/y;
const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y;
const TAG_END = /\s*(\/?)>/y;

/** @param {string} file @param {string} text @param {number} at */
function readName(file, text, at) {
  NAME.lastIndex = at;
  const match = NAME.exec(text);
  if (match === null) fail(file, text.slice(at, at + 12), "malformed tag");
  return match[0];
}

/**
 * @param {string} file @param {string} text @param {number} at @param {string} tag
 * @param {boolean} isRoot
 */
function readAttributes(file, text, at, tag, isRoot) {
  /** @type {Record<string, string>} */
  const attrs = {};
  let pos = at;
  for (;;) {
    ATTRIBUTE.lastIndex = pos;
    const match = ATTRIBUTE.exec(text);
    if (match === null) break;
    const [, name, double, single] = match;
    const value = double ?? single;
    if (Object.hasOwn(attrs, name)) fail(file, name, "repeated attribute");
    checkAttribute(file, tag, name, value, isRoot);
    attrs[name] = colourForm(name, value);
    pos = ATTRIBUTE.lastIndex;
  }
  TAG_END.lastIndex = pos;
  const end = TAG_END.exec(text);
  if (end === null) fail(file, tag, "malformed attribute or tag end");
  return { attrs, pos: TAG_END.lastIndex, closed: end[1] === "/" };
}

/** @param {string} file @param {string} text @param {number} at @param {string} open */
function readClose(file, text, at, open) {
  const name = readName(file, text, at + 2);
  TAG_END.lastIndex = at + 2 + name.length;
  const end = TAG_END.exec(text);
  if (name !== open || end === null || end[1] === "/")
    fail(file, name, `end tag does not close <${open}>`);
  return TAG_END.lastIndex;
}

/**
 * @param {string} file @param {string} text @param {number} at @param {boolean} isRoot
 * @returns {{ element: SvgNode, pos: number }}
 */
function readElement(file, text, at, isRoot) {
  checkMarkup(file, text, at);
  const tag = readName(file, text, at + 1);
  if (isRoot ? tag !== "svg" : !TAGS.has(tag))
    fail(file, tag, "element not in the allow-list");
  const head = readAttributes(file, text, at + 1 + tag.length, tag, isRoot);
  /** @type {SvgNode} */
  const element = [tag, head.attrs, []];
  if (head.closed) return { element, pos: head.pos };
  let pos = head.pos;
  for (;;) {
    pos = readText(file, text, pos);
    if (pos >= text.length) fail(file, tag, "element is not closed");
    if (text.startsWith("</", pos))
      return { element, pos: readClose(file, text, pos, tag) };
    const child = readElement(file, text, pos, false);
    element[2].push(child.element);
    pos = child.pos;
  }
}

/** @param {string} file @param {string} text */
function parseIcon(file, text) {
  const start = readText(file, text, 0);
  if (start >= text.length) fail(file, "svg", "no root element");
  const { element, pos } = readElement(file, text, start, true);
  if (readText(file, text, pos) !== text.length)
    fail(file, "svg", "content after the root element");
  return element;
}

/** @param {SvgNode} element @returns {string | undefined} */
function firstHexFill(element) {
  const [, attrs, children] = element;
  if (Object.hasOwn(attrs, "fill") && attrs.fill.startsWith("#"))
    return attrs.fill;
  for (const child of children) {
    const found = firstHexFill(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** @param {string} name @param {string} text @returns {Icon} */
function iconOf(name, text) {
  const file = `${name}.svg`;
  const root = parseIcon(file, text);
  const [, attrs, body] = root;
  if (!Object.hasOwn(attrs, "viewBox")) fail(file, "viewBox", "missing");
  const [, , w, h] = attrs.viewBox.split(" ").map(Number);
  if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h)))
    fail(file, "viewBox", "size is not a positive finite number");
  if (!Object.hasOwn(attrs, "fill")) fail(file, "svg fill", "missing");
  const color = firstHexFill(root);
  if (color === undefined) fail(file, "fill", "no fill that starts with #");
  return { w, h, tier: TIERS[name], color, fill: attrs.fill, body };
}

/** @param {string} root */
function inputNames(root) {
  const dir = path.join(root, INPUT);
  if (!lstatSync(dir).isDirectory()) fail(INPUT, "folder", "not a folder");
  /** @type {string[]} */
  const names = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".svg")) continue;
    if (!lstatSync(path.join(dir, entry)).isFile())
      fail(entry, "file", "not a regular file");
    names.push(entry.slice(0, -4));
  }
  for (const name of names)
    if (!Object.hasOwn(TIERS, name)) fail(`${name}.svg`, "file", "no tier");
  for (const name of Object.keys(TIERS))
    if (!names.includes(name)) fail(`${name}.svg`, "file", "missing");
  return names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** @param {string} root */
function build(root) {
  const names = inputNames(root);
  const lines = names.map((name) => {
    const text = readFileSync(path.join(root, INPUT, `${name}.svg`), "utf8");
    return `${JSON.stringify(name)}:${JSON.stringify(iconOf(name, text))}`;
  });
  return `{${lines.join(",\n")}}\n`;
}

/** @param {string[]} argv */
function argsOf(argv) {
  const options = {
    root: path.resolve(fileURLToPath(import.meta.url), "..", ".."),
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") options.check = true;
    else if (argv[i] === "--root" && i + 1 < argv.length)
      options.root = path.resolve(argv[++i]);
    else throw new IconError(`unknown argument: ${argv[i]}`);
  }
  return options;
}

/** @param {string} file */
function onDisk(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** @param {string[]} argv */
function run(argv) {
  const options = argsOf(argv);
  const text = build(options.root);
  const out = path.join(options.root, OUTPUT);
  if (options.check) {
    if (onDisk(out) !== text)
      throw new IconError(`${OUTPUT}: differs from the build`);
    return;
  }
  writeFileSync(out, text);
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`build-icons: ${message}\n`);
  process.exitCode = 1;
}
