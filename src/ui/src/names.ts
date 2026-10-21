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
  return tableName(lang, `type.${type}`) ?? types.get(type)?.label ?? type;
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
