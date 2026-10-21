import { profile } from "@qdic-topology/contract";
import {
  canvasColor,
  normalize,
  resolveVocab,
  warningEntries,
  type Hex,
} from "@qdic-topology/engine";
import { loadFixture } from "@qdic-topology/fixtures";
import type { AppInput } from "./App";

// why: the date of the EPIC-003 fixture traces, so the `valid_to` checks give the same results
const NOW = "2026-10-19";
export const LIGHT = canvasColor("#F4F4F5") as Hex;
export const DARK = canvasColor("#18181b") as Hex;

// why: rule 13 and Context — the caller makes the full warning list from the `normalize` and the
// `resolveVocab` issues (`vocab/corpus.test.ts` line 22); the App never gets the `issues`
export function appInput(raw: unknown, canvas: Hex = LIGHT): AppInput {
  const result = normalize(raw, { now: NOW });
  if (!result.ok) return { ok: false, fatal: result.fatal };
  const { graph, payload, hash, counts, shaped } = result;
  const { vocab, issues } = resolveVocab(graph, payload, profile, canvas);
  return {
    ok: true,
    model: { graph, payload, hash, vocab, canvas },
    warnings: warningEntries([...result.issues, ...issues], shaped),
    counts,
    ...(shaped === undefined ? {} : { shaped }),
    source: "model",
  };
}

export function fixtureModel(key: string, canvas: Hex = LIGHT): AppInput {
  return appInput(loadFixture(key).input, canvas);
}
