import { profile } from "#contract";
import { loadFixture } from "#fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, type Hex } from "./colors";
import { resolveVocab } from "./resolve";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function resolved(key: string) {
  const result = normalize(loadFixture(key).input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return resolveVocab(result.graph, result.payload, profile, LIGHT);
}

describe("S31 same input, same output", () => {
  it.each(["s-designed", "s-vocab-meta"])(
    "%s resolves twice to equal output",
    (key) => {
      const first = resolved(key);
      const second = resolved(key);
      expect(second).toStrictEqual(first);
      expect([...second.vocab.types.keys()]).toEqual([
        ...first.vocab.types.keys(),
      ]);
      expect([...second.vocab.entities.keys()]).toEqual([
        ...first.vocab.entities.keys(),
      ]);
    },
  );
});
