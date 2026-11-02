import { profile } from "#contract";
import {
  canvasColor,
  normalize,
  resolveVocab,
  warningEntries,
  type Hex,
} from "#engine";
import type { AppInput } from "#ui";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const FALLBACK: AppInput = {
  ok: false,
  fatal: { code: "error-fallback", path: [] },
  source: "model",
};

const noTypes = Object.keys(profile.nodeTypes).length === 0;
const today = () => new Date().toISOString().slice(0, 10);

/** Turns one API payload into the input of the shell. A bad payload gives a notice, not a throw. */
export function toInput(raw: unknown): AppInput {
  try {
    const now = today();
    const result = normalize(raw, { now });
    if (!result.ok)
      return { ok: false, fatal: result.fatal, source: "model" };
    const { graph, payload, hash, counts, shaped } = result;
    const { vocab, issues } = resolveVocab(graph, payload, profile, LIGHT);
    // A viewer with no node types in its profile has no opinion about a type name.
    const shown = noTypes
      ? issues.filter((issue) => issue.code !== "unknown-type")
      : issues;
    return {
      ok: true,
      model: { graph, payload, hash, vocab, canvas: LIGHT },
      warnings: warningEntries([...result.issues, ...shown], shaped),
      counts,
      ...(shaped === undefined ? {} : { shaped }),
      source: "model",
      profile,
      now,
    };
  } catch {
    return FALLBACK;
  }
}
