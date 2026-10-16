import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, type Hex } from "./colors";
import {
  containerPath,
  entitySlots,
  resolveVocab,
  type Vocab,
} from "./resolve";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function resolved(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return resolveVocab(result.graph, result.payload, profile, LIGHT).vocab;
}

const slot = (vocab: Vocab, id: string, name: string) =>
  entitySlots(vocab, id)?.slots.find((s) => s.slot === name)?.entries ?? [];
const table = (attrs: object, extra: object = {}) =>
  resolved({
    nodes: [{ id: "t", type: "table", label: "T", attrs }],
    ...extra,
  });

describe("list items and item names", () => {
  it("names people, tags and groups from the profile paths", () => {
    const vocab = table({
      owners: [
        { given_name: "Aiko", family_name: "Tanaka" },
        "Bob",
        { email: "c@acme.example" },
        { label: "" },
        null,
        7,
      ],
      tags: [
        { parent_tag: { label: "PII" }, child_tag: { label: "Email" } },
        { name: "Gold" },
      ],
      asset_groups: { name: "Finance" },
    });
    expect(slot(vocab, "t", "owners").map((e) => e.value)).toEqual([
      "Aiko Tanaka",
      "Bob",
      "c@acme.example",
      7,
    ]);
    expect(slot(vocab, "t", "tags").map((e) => e.value)).toEqual([
      "PII / Email",
      "Gold",
    ]);
    expect(slot(vocab, "t", "asset_groups").map((e) => e.value)).toEqual([
      "Finance",
    ]);
  });

  it("gives no entry for an object value of a slot with no itemName, or for empty values", () => {
    const vocab = table({
      description: { text: "x" },
      data_type: null,
      ddl_comment: "",
      link: [],
      updated_at: 0,
      ext_url: false,
    });
    expect(slot(vocab, "t", "description")).toEqual([]);
    expect(slot(vocab, "t", "data_type")).toEqual([]);
    expect(slot(vocab, "t", "ddl_comment")).toEqual([]);
    expect(slot(vocab, "t", "updated").map((e) => e.value)).toEqual([0]);
    expect(slot(vocab, "t", "link").map((e) => e.value)).toEqual([false]);
  });
});

describe("record fields and duplicates", () => {
  it("reads the QDIC logicalName after an attribute of the same name", () => {
    const vocab = resolved({
      nodes: [{ globalId: "tbl-1", nodeType: "table", logicalName: "Orders" }],
    });
    expect(slot(vocab, "tbl-1", "logical_name")).toEqual([
      { value: "Orders", from: "attribute logicalName" },
    ]);
  });

  it("gives one entry for a value that each record of a merged entity holds", () => {
    const vocab = resolved({
      nodes: [
        { id: "a", type: "table", label: "T", attrs: { owner: "Bob" } },
        { id: "b", type: "table", label: "T", attrs: { owner: "Bob" } },
      ],
    });
    expect(entitySlots(vocab, "b")).toBeNull();
    expect(slot(vocab, "a", "owners")).toEqual([
      { value: "Bob", from: "attribute owner" },
    ]);
  });

  it("keeps a native entry and the AI entry of the same key", () => {
    const vocab = table(
      { owner: "Bob" },
      { fields: { owner: { slot: "owners", why: "w" } } },
    );
    expect(slot(vocab, "t", "owners")).toEqual([
      { value: "Bob", from: "attribute owner" },
      { value: "Bob", from: "attribute owner", mapped: "w" },
    ]);
  });

  it("keeps two owners with the same label and drops a second triple to one owner", () => {
    const vocab = resolved({
      nodes: [
        { id: "t", type: "table" },
        { id: "u1", type: "user", label: "Ann" },
        { id: "u2", type: "user", label: "Ann", attrs: { email: "x" } },
      ],
      edges: [
        { subject: "t", predicate: "ownedBy", object: "u1" },
        {
          subject: "t",
          predicate: "ownedBy",
          object: "u1",
          attrs: { since: "2020" },
        },
        { subject: "t", predicate: "ownedBy", object: "u2" },
      ],
    });
    expect(slot(vocab, "t", "owners")).toEqual([
      { value: "Ann", from: "ownedBy" },
      { value: "Ann", from: "ownedBy" },
    ]);
  });
});

describe("containment chains", () => {
  it("stops at a loop and at 8 parents", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const vocab = resolved({
      nodes: [
        ...ids.map((id) => ({ id, type: "box", label: id })),
        { id: "x" },
        { id: "y" },
      ],
      edges: [
        ...ids.slice(1).map((id, i) => [ids[i], "contains", id]),
        ["x", "contains", "y"],
        ["y", "contains", "x"],
      ],
    });
    expect(containerPath(vocab, "c11")).toEqual(ids.slice(3, 11));
    expect(containerPath(vocab, "y")).toEqual(["x"]);
    expect(containerPath(vocab, "x")).toEqual(["y"]);
  });

  it("uses a payload containment predicate and the first parent", () => {
    const vocab = resolved({
      nodes: [{ id: "p" }, { id: "q" }, { id: "k" }],
      edges: [
        ["p", "holds", "k"],
        ["q", "contains", "k"],
      ],
      predicates: { holds: { role: "containment" } },
    });
    expect(containerPath(vocab, "k")).toEqual(["p"]);
  });
});

describe("plain strings", () => {
  it("copies labels with markup byte-equal", () => {
    const vocab = resolved({
      nodes: [
        { id: "t", type: "table", label: "<script>" },
        { id: "u", type: "user", label: '<b a="1">&amp;' },
      ],
      edges: [["t", "ownedBy", "u"]],
    });
    expect(slot(vocab, "t", "owners")).toEqual([
      { value: '<b a="1">&amp;', from: "ownedBy" },
    ]);
    expect(slot(vocab, "t", "physical_name")).toEqual([
      { value: "<script>", from: "label" },
    ]);
  });
});
