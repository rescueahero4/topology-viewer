import { notices, profile } from "@qdic-topology/contract";
import type { Lang, Provenance } from "@qdic-topology/engine";
import { describe, expect, it } from "vitest";
import { appInput, fixtureModel } from "./fixtureModel";
import {
  familyName,
  groupName,
  provenanceName,
  slotName,
  typeName,
} from "./names";
import { rendererText } from "./rendererText";
import { hostilePayload } from "./shellAudit";
import { en } from "./strings/en";
import { isKey, langOf, t, type Key } from "./strings/index";
import { ja } from "./strings/ja";

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const enKeys = Object.keys(en) as Key[];
const LANGS: Lang[] = ["en", "ja"];

describe("S6 the two string tables", () => {
  it("have the same keys and the same placeholder names", () => {
    expect(Object.keys(ja).sort()).toEqual([...enKeys].sort());
    for (const key of enKeys) {
      const value = en[key];
      const forms =
        typeof value === "string" ? [value] : [value.one, value.other];
      for (const form of forms)
        expect([key, placeholders(form)]).toEqual([key, placeholders(ja[key])]);
    }
  });

  it("give one ja text for each en count text", () => {
    const counted = enKeys.filter((key) => typeof en[key] !== "string");
    expect(counted.length).toBeGreaterThan(0);
    for (const key of counted) expect(typeof ja[key]).toBe("string");
  });

  it("use the UI names of the notice texts", () => {
    expect(notices.en["types-off"].body).toContain(en.typesMenu);
    expect(notices.ja["types-off"].body).toContain("タイプメニュー");
    expect(ja.typesMenu).toBe("タイプメニュー");
    expect(notices.en["empty-fallback"].user.join(" ")).toContain(
      en.datasetTable,
    );
    expect(notices.ja["empty-fallback"].user.join(" ")).toContain(
      "データセット表",
    );
    expect(ja.datasetTable).toBe("データセット表");
  });
});

// why: STORY-004-08 rule 3 — the action labels live in `contract`, which `ui` does not import
describe("S21 (STORY-004-08) the notice action labels", () => {
  const names = ["show-types", "reset-view", "retry", "table", "copy"] as const;

  it.each(LANGS)("equal the contract labels in %s", (lang) => {
    expect(Object.keys(notices.actions[lang]).sort()).toEqual(
      [...names].sort(),
    );
    for (const name of names)
      expect(t(lang, `action.${name}`)).toBe(notices.actions[lang][name].label);
  });
});

describe("S7 langOf", () => {
  it.each([
    ["ja", "ja"],
    ["ja-JP", "ja"],
    ["JA", "ja"],
    ["en-US", "en"],
    ["fr", "en"],
    ["", "en"],
    [undefined, "en"],
  ] as const)("%s gives %s", (locale, lang) => {
    expect(langOf(locale)).toBe(lang);
  });
});

describe("S21 t()", () => {
  const rows = [0, 1, 2, 1262].map((count) => [
    count,
    t("en", "canvas.tipMore", { sub: "S", count }),
  ]);

  it("takes one for 1 and other for every other count", () => {
    expect(rows).toEqual([
      [0, "S · 0 more connections · double-click to show"],
      [1, "S · 1 more connection · double-click to show"],
      [2, "S · 2 more connections · double-click to show"],
      [1262, "S · 1,262 more connections · double-click to show"],
    ]);
  });

  it("formats the number in ja and gives a dash for a missing value", () => {
    expect(t("ja", "canvas.tipMore", { sub: "S", count: 1262 })).toBe(
      "S · ほかに 1,262 件の接続 · ダブルクリックで表示",
    );
    expect(t("en", "canvas.pillRetired")).toBe("— (retired)");
  });

  it("does not read a placeholder inside a value", () => {
    expect(t("en", "canvas.pillRetired", { label: "{label}" })).toBe(
      "{label} (retired)",
    );
  });
});

describe("S8 display names", () => {
  const sDesigned = fixtureModel("s-designed");
  const spec = fixtureModel("q-spec-scenarios");
  if (!sDesigned.ok || !spec.ok) throw new Error("fatal");
  const { types } = sDesigned.model.vocab;
  const groups = [...profile.typeMenuCategories.order, "Custom"];
  const families = [...profile.categoryOrder, "Custom"];
  const slots = profile.slots.map((slot) => slot.slot);
  const provenances: Provenance[] = ["system", "custom", "inferred"];
  const both = (name: (lang: Lang) => string, key: Key) => {
    expect(LANGS.map(name)).toEqual(LANGS.map((lang) => t(lang, key)));
    expect(name("en")).not.toBe(name("ja"));
  };

  it("give a table name for the 26 types and the null type", () => {
    const names = Object.keys(profile.nodeTypes);
    expect(names).toHaveLength(26);
    for (const type of names)
      both((lang) => typeName(lang, type, types), `type.${type}` as Key);
    both((lang) => typeName(lang, null, types), "unknownType");
  });

  it("give a table name for families, slots, groups and provenances", () => {
    expect([families.length, slots.length, groups.length]).toEqual([7, 13, 5]);
    for (const f of families)
      both((lang) => familyName(lang, f), `family.${f}` as Key);
    for (const s of slots)
      both((lang) => slotName(lang, s), `slot.${s}` as Key);
    for (const g of groups)
      both((lang) => groupName(lang, g), `group.${g}` as Key);
    for (const p of provenances)
      both((lang) => provenanceName(lang, p), `provenance.${p}` as Key);
  });

  it("give the model text for a type or family with no table name", () => {
    expect(typeName("en", "supplier", types)).toBe("Supplier");
    expect(typeName("ja", "supplier", types)).toBe("Supplier");
    const families = spec.model.vocab.families.map((f) => f.key);
    expect(families).toContain("governance");
    expect(familyName("ja", "governance")).toBe("governance");
  });
});

describe("S29 prototype names", () => {
  const input = appInput(hostilePayload());
  if (!input.ok) throw new Error("fatal");
  const { vocab } = input.model;

  it("are no own keys of the string table", () => {
    for (const name of ["constructor", "toString", "__proto__", "valueOf"])
      expect(isKey(name)).toBe(false);
  });

  it("give the engine label or the key, never an inherited value", () => {
    expect(vocab.types.get("constructor")?.label).toBe("Constructor");
    expect(vocab.families.map((f) => f.key)).toContain("constructor");
    for (const lang of LANGS) {
      expect(typeName(lang, "constructor", vocab.types)).toBe("Constructor");
      expect(familyName(lang, "constructor")).toBe("constructor");
      expect(familyName(lang, "__proto__")).toBe("__proto__");
      expect(slotName(lang, "toString")).toBe("toString");
      expect(groupName(lang, "prototype")).toBe("prototype");
    }
  });
});

describe("S9 RendererText", () => {
  it("gives the 13 keys from the tables in both languages", () => {
    for (const lang of LANGS) {
      const text = rendererText(lang);
      expect(Object.keys(text)).toHaveLength(13);
      expect(text.unknownType).toBe(t(lang, "unknownType"));
      expect(text.canvasName).toBe(t(lang, "canvas.name"));
      expect(text.collapsed).toBe(t(lang, "canvas.collapsed"));
      expect(text.lostMark).toBe(t(lang, "canvas.lost"));
    }
  });

  it("gives the fixed English forms", () => {
    const text = rendererText("en");
    expect(text.bubbleCount(1262)).toBe(" · 1262");
    expect(text.lostMark).toBe("lost");
    expect(text.pillRetired("ownedBy")).toBe("ownedBy (retired)");
    const action = text.tipEdgeAction("ownedBy", true, 2, true);
    expect(action).toBe(
      "ownedBy (filtered out) (retired) · 2 links · click to select",
    );
    expect(action.indexOf(" (filtered out)")).toBeLessThan(
      action.indexOf(" (retired)"),
    );
  });

  it("names a group in the plural in English only", () => {
    expect(rendererText("en").groupLabel("Policy", 3)).toBe("Policies");
    expect(rendererText("en").groupLabel("Class", 3)).toBe("Class");
    expect(rendererText("en").groupLabel("Table", 3)).toBe("Tables");
    expect(rendererText("ja").groupLabel("テーブル", 3)).toBe("テーブル");
  });
});
