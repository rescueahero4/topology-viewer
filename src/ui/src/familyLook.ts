import { computed } from "@preact/signals";
import {
  familyOrder,
  type FamilyRow,
  type Lang,
  type PredicateRow,
  type Stats,
  type Vocab,
} from "@qdic-topology/engine";
import { edgeStyles, type EdgeStyle } from "./canvas/index";
import type { IconName } from "./icons";
import { familyName } from "./names";
import { editedModel } from "./state";
import { t } from "./strings/index";

// why: rule 7 — the six token sets of tokens.css go by the place of a family in `familyOrder()`
// (mockup `CATEGORIES` and its lucide icons, lib/topology.js lines 34-39); a custom family and
// Custom take the Other set, as the mockup sends a predicate with no profile family to `other`
// (app.js line 1043). No family name goes into a class or a property name
const ICONS: readonly IconName[] = [
  "structure",
  "lineage",
  "reference",
  "classification",
  "access",
  "other",
];
const OTHER = ICONS.length - 1;
const PLACES = new Map(familyOrder().map((family, place) => [family, place]));

function placeOf(family: string): number {
  return Math.min(PLACES.get(family) ?? OTHER, OTHER);
}

export const familyClass = (family: string) => `qt-fam-${placeOf(family)}`;

export const familyIcon = (family: string) => ICONS[placeOf(family)];

// why: gap G5 — the predicate colours of the canvas, made once for each input
const styles = computed<ReadonlyMap<string, EdgeStyle>>(() => {
  const now = editedModel.value;
  return now === null ? new Map() : edgeStyles(now.vocab, now.canvas);
});
const HEX = /^#[0-9A-Fa-f]{6}$/;

// why: reading (d1) — one fixed property `--c`, and only when the value is a six-digit hex colour;
// else the element has no colour property
export const colourVar = (colour: string | null | undefined) =>
  colour != null && HEX.test(colour) ? { "--c": colour } : undefined;

// why: rule 7 — the predicate colour comes only from `edgeStyles`
export const predicateColour = (predicate: string) =>
  colourVar(styles.value.get(predicate)?.colour);

// why: mockup `famPartial` (app.js line 300) — a family that is on with some predicates off
export function partialOf(rows: Stats, family: FamilyRow): boolean {
  const own = rows.predicates.filter((row) => row.family === family.family);
  return family.on && own.some((row) => !row.on) && own.some((row) => row.on);
}

export function familyTip(language: Lang, row: FamilyRow): string {
  const family = familyName(language, row.family);
  return t(language, "catbar.familyTip", { family, count: row.count });
}

export function predicateTip(language: Lang, vocab: Vocab, row: PredicateRow) {
  const system = vocab.predicates.get(row.predicate)?.provenance === "system";
  return t(language, "catbar.predicateTip", {
    predicate: row.predicate,
    count: row.count,
    custom: system ? "" : t(language, "catbar.customPredicate"),
  });
}
