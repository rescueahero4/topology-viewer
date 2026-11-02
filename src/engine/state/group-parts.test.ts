import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import {
  canvasColor,
  firstView,
  frontier,
  groupParts,
  normalize,
  resolveVocab,
  type Hex,
} from "../index";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const TABLE = 'g:["tag_pii","taggedWith","<","table"]';
const COLUMN = 'g:["tag_pii","taggedWith","<","column"]';

describe("S15 groupParts", () => {
  it("reads the two s-star group ids of the first view", () => {
    const result = normalize(loadFixture("s-star").input, {
      now: "2026-10-20",
    });
    if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
    const { graph, payload, hash } = result;
    const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
    const ids = frontier(firstView(graph, vocab, payload, hash), graph, vocab)
      .nodes.map((node) => node.id)
      .filter((id) => id.startsWith("g:"));
    expect(ids).toEqual(expect.arrayContaining([TABLE, COLUMN]));
    expect(groupParts(TABLE)).toEqual({
      anchor: "tag_pii",
      predicate: "taggedWith",
      direction: "<",
      type: "table",
    });
    expect(groupParts(COLUMN)).toEqual({
      anchor: "tag_pii",
      predicate: "taggedWith",
      direction: "<",
      type: "column",
    });
  });

  it("gives a null type for the group of entities with no type", () => {
    expect(groupParts('g:["a","p",">",null]')).toEqual({
      anchor: "a",
      predicate: "p",
      direction: ">",
      type: null,
    });
  });

  it.each([
    "e:t_0",
    "g:",
    "g:[1,2,3,4]",
    'g:["a","p",">"]',
    "g:not json",
    'g:["a","p","x","t"]',
    'g:{"0":"a","1":"p","2":">","3":"t","length":4}',
  ])("gives null for %s, with no throw", (id) => {
    expect(groupParts(id)).toBeNull();
  });
});
