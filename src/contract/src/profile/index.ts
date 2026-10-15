import { z } from "zod";
import qdic from "./qdic.json";
import {
  checkNodeTypes,
  checkPairings,
  checkPredicates,
  checkReferences,
  checkSlots,
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
