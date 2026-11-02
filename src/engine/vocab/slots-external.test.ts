import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import {
  canvasColor,
  entitySlots,
  normalize,
  resolveVocab,
  slotKeys,
  type Entry,
  type Hex,
} from "../index";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-20" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return { vocab, payload };
}

const entries = (vocab: ReturnType<typeof load>["vocab"], id: string) =>
  (entitySlots(vocab, id)?.slots ?? []).flatMap((slot) =>
    slot.entries.map((entry) => ({ slot: slot.slot, ...entry })),
  );

const plain = (entry: Entry & { slot: string }) => {
  const rest: Partial<typeof entry> = { ...entry };
  delete rest.external;
  return rest;
};

describe("S10 s-vocab-meta, entity tb", () => {
  it("flags only the ddl_comment entry from comment_on_ddl", () => {
    const { vocab } = load(loadFixture("s-vocab-meta").input);
    const all = entries(vocab, "tb");
    const flagged = all.filter((entry) => Object.hasOwn(entry, "external"));
    expect(flagged).toEqual([
      {
        slot: "ddl_comment",
        value: "one row per issued invoice",
        from: "attribute comment_on_ddl",
        external: true,
      },
    ]);
    const owners = all.filter((entry) => entry.slot === "owners");
    expect(owners.map((entry) => entry.from)).toEqual([
      "ownedBy",
      "attribute steward_email",
    ]);
  });
});

describe("S11 the six notYetIncluded fields in each read step", () => {
  const KEYS = [
    "description",
    "ext_description",
    "tags",
    "ext_tags",
    "owners",
    "ext_owners",
    "updated_at",
    "record_updated_at",
    "data_source_id",
    "ddl_comment",
    "comment_on_ddl",
  ];
  const { vocab } = load({
    nodes: [
      {
        id: "t",
        type: "table",
        label: "T",
        attrs: Object.fromEntries(KEYS.map((key) => [key, `v-${key}`])),
      },
    ],
    edges: [],
  });
  const all = entries(vocab, "t");

  it("flags the source-system fields and no other key", () => {
    const from = (flag: boolean) =>
      all
        .filter((entry) => entry.from.startsWith("attribute "))
        .filter((entry) => (entry.external === true) === flag)
        .map((entry) => entry.from.replace("attribute ", ""));
    expect(from(true).sort()).toEqual(
      [
        "ext_description",
        "ext_tags",
        "ext_owners",
        "record_updated_at",
        "data_source_id",
        "comment_on_ddl",
      ].sort(),
    );
    expect(from(false).sort()).toEqual(
      ["description", "tags", "owners", "updated_at", "ddl_comment"].sort(),
    );
    for (const entry of all)
      if (Object.hasOwn(entry, "external")) expect(entry.external).toBe(true);
  });

  it("keeps the slot order and the entry order", () => {
    expect(all.map(plain)).toEqual([
      { slot: "physical_name", value: "T", from: "label" },
      ...[
        ["description", "description"],
        ["description", "ext_description"],
        ["owners", "owners"],
        ["owners", "ext_owners"],
        ["tags", "tags"],
        ["tags", "ext_tags"],
        ["data_source", "data_source_id"],
        ["ddl_comment", "ddl_comment"],
        ["ddl_comment", "comment_on_ddl"],
        ["updated", "updated_at"],
        ["updated", "record_updated_at"],
      ].map(([slot, key]) => ({
        slot,
        value: `v-${key}`,
        from: `attribute ${key}`,
      })),
    ]);
  });
});

describe("S14 slotKeys", () => {
  it("s-vocab-meta tb: the read keys, the mapped key and the asset-only keys", () => {
    const { vocab, payload } = load(loadFixture("s-vocab-meta").input);
    const keys = slotKeys(vocab, payload, "tb");
    for (const key of [
      "physical_name",
      "comment_on_ddl",
      "ext_description",
      "service_name",
      "updated_at",
      "steward_email",
      "title",
      "labels",
    ])
      expect(keys.has(key), key).toBe(true);
    for (const key of ["asset_type", "rto_hours", "pii_level", "retentionDays"])
      expect(keys.has(key), key).toBe(false);
  });

  it("s-access: an asset type has title and labels, user has not; an unknown id gives no key", () => {
    const { vocab, payload } = load(loadFixture("s-access").input);
    const table = slotKeys(vocab, payload, "t_FCT_REVENUE");
    const user = slotKeys(vocab, payload, "u_0");
    expect([table.has("title"), table.has("labels")]).toEqual([true, true]);
    expect([user.has("title"), user.has("labels")]).toEqual([false, false]);
    expect(user.has("physical_name")).toBe(true);
    expect(slotKeys(vocab, payload, "nope").size).toBe(0);
    expect(slotKeys(vocab, payload, "__proto__").size).toBe(0);
  });

  it("takes a fields key only when its slot is a profile slot", () => {
    const { vocab, payload } = load({
      nodes: [
        { id: "n1", type: "table", attrs: { k1: "a", k2: "b", k3: "c" } },
      ],
      edges: [],
      fields: {
        k1: { slot: "owners" },
        k2: { slot: "nope" },
        k3: { label: "K3" },
      },
    });
    const keys = slotKeys(vocab, payload, "n1");
    expect([keys.has("k1"), keys.has("k2"), keys.has("k3")]).toEqual([
      true,
      false,
      false,
    ]);
  });
});
