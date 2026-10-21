import { z } from "zod";
import qdic from "./qdic.json" with { type: "json" };
import {
  checkAssetOnlyKeys,
  checkBuiltIn,
  checkHeuristics,
  checkNodeTypes,
  checkPairings,
  checkPredicates,
  checkReferences,
  checkSlotFields,
  checkSlots,
  checkTypeMenu,
  makeChecker,
} from "./checks";
import { profileShapeSchema } from "./types";

export const profileSchema = profileShapeSchema.superRefine((p, ctx) => {
  const checker = makeChecker(p, ctx);
  checkNodeTypes(p, checker);
  checkPredicates(p, checker);
  checkPairings(p, checker);
  checkSlots(p, checker);
  checkReferences(p, checker);
  checkAssetOnlyKeys(p, checker);
  checkSlotFields(p, checker);
  checkBuiltIn(p, checker);
  checkTypeMenu(p, checker);
  checkHeuristics(p, checker);
});

export type Profile = z.infer<typeof profileSchema>;

export function loadProfile(raw: unknown): Profile {
  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`Invalid profile:\n${lines.join("\n")}`);
  }
  return result.data;
}

export const profile = loadProfile(qdic);
