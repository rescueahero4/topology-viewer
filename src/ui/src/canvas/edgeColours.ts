import {
  canvasColor,
  guardColor,
  type Hex,
  type Rgb,
  type Vocab,
} from "@qdic-topology/engine";

export type EdgeStyle = { colour: Hex; structure: boolean; dashed: boolean };

// why: mockup `CATEGORIES` hues (lib/topology.js lines 33-39), with the profile family names;
// epic question 10 — every other family (Other, a custom category, Custom) is grey and dashed
const HUES: ReadonlyMap<string, number> = new Map([
  ["Structure", 220],
  ["Lineage", 214],
  ["Reference", 250],
  ["Annotation", 35],
  ["Ownership & Access", 152],
]);
const STRUCTURE = "Structure";
// why: mockup `PRED_COLOR` (lib/topology.js lines 48-51) — saturation and the lightness ladder
const SATURATION = 58;
const LIGHT_BASE = 32;
const LIGHT_STEP = 8;
const LIGHT_SPAN = 25;
const GREY = "#71717a";
const HEX_CHANNELS = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/;

// why: build-time item (5) of the story — the one parse of a `Hex` into channels for `guardColor`
function rgbOf(hex: Hex | null | undefined): Rgb {
  const match = HEX_CHANNELS.exec(hex ?? "");
  if (match === null) throw new Error("sceneOf: a colour is not #rrggbb");
  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
}

// why: hand-off item 3, FR-VOC-4 — every canvas colour goes through `guardColor` against the
// canvas colour
export function guarded(hex: Hex | null | undefined, canvas: Hex): Hex {
  return guardColor(rgbOf(hex), canvas);
}

// why: the engine `byCodePoint` (`data/hash.ts:33`) order, which the engine entry does not export
function byCodePoint(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < x.length && i < y.length; i++)
    if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

function shade(hue: number, rank: number): string {
  const light = LIGHT_BASE + ((rank * LIGHT_STEP) % LIGHT_SPAN);
  return `hsl(${hue}, ${SATURATION}%, ${light}%)`;
}

// why: epic question 10 (Product Owner, 2026-10-19) — the rank of a predicate is its code-point
// place among the predicates of its family in `vocab.predicates`, so the same input gives the
// same colours (NF-3)
export function edgeStyles(
  vocab: Vocab,
  canvas: Hex,
): ReadonlyMap<string, EdgeStyle> {
  const byFamily = new Map<string, string[]>();
  for (const [name, { family }] of vocab.predicates) {
    const names = byFamily.get(family);
    if (names === undefined) byFamily.set(family, [name]);
    else names.push(name);
  }
  const styles = new Map<string, EdgeStyle>();
  for (const [family, names] of byFamily) {
    const hue = HUES.get(family);
    names.sort(byCodePoint).forEach((name, rank) => {
      const input = hue === undefined ? GREY : shade(hue, rank);
      styles.set(name, {
        colour: guarded(canvasColor(input), canvas),
        structure: family === STRUCTURE,
        dashed: hue === undefined,
      });
    });
  }
  return styles;
}
