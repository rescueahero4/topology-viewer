import { z } from "zod/mini";
import { en } from "zod/locales";
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
import { source } from "./source";
import { profileShapeSchema } from "./types";

export const profileSchema = profileShapeSchema.check((ctx) => {
  const p = ctx.value;
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
  // why: zod/mini loads no locale, so the built-in messages come from here
  const result = profileSchema.safeParse(raw, { error: en().localeError });
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`Invalid profile:\n${lines.join("\n")}`);
  }
  return result.data;
}

export const profile = loadProfile(source);
