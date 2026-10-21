import type {
  Lang,
  Provenance,
  ResolvedType,
  Vocab,
} from "@qdic-topology/engine";
import { isKey, t } from "./strings/index";

// why: epic question 7, rule 16 — a profile name has a string-table key; any other name is model
// text. The key is an own key of the table, so `constructor` or `__proto__` reads no inherited value
function tableName(lang: Lang, key: string): string | undefined {
  return isKey(key) ? t(lang, key) : undefined;
}

export function typeName(
  lang: Lang,
  type: string | null,
  types: ReadonlyMap<string, ResolvedType>,
): string {
  if (type === null) return t(lang, "unknownType");
  // why: SA §4.4 cascade (supplied → system), ISSUE-012 C11 — a label that the model gave is the
  // name, also for a profile type; the string table names only a profile type with no such label
  const resolved = types.get(type);
  if (resolved?.labelSupplied === true) return resolved.label;
  return tableName(lang, `type.${type}`) ?? resolved?.label ?? type;
}

export function familyName(lang: Lang, family: string): string {
  return tableName(lang, `family.${family}`) ?? family;
}

export function slotName(lang: Lang, slot: string): string {
  return tableName(lang, `slot.${slot}`) ?? slot;
}

export function groupName(lang: Lang, group: string): string {
  return tableName(lang, `group.${group}`) ?? group;
}

export function provenanceName(lang: Lang, provenance: Provenance): string {
  return tableName(lang, `provenance.${provenance}`) ?? provenance;
}

// why: FR-VOC-3 (mockup `.prov`, app.js line 772) — the one tag text of the inspector and the table
export const provTag = (lang: Lang, provenance: Provenance) =>
  t(lang, "relations.prov", { prov: provenanceName(lang, provenance) });

// why: NF-10, epic question 7 — the canvas names a profile type in the UI language too: the scene
// reads `ResolvedType.label` (canvas/scene.ts line 90), so the canvas gets these labels
export function localVocab(lang: Lang, vocab: Vocab): Vocab {
  const types = new Map(
    [...vocab.types].map(([key, type]) => [
      key,
      { ...type, label: typeName(lang, key, vocab.types) },
    ]),
  );
  return { ...vocab, types };
}
