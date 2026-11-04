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
// The token value in the theme can be any CSS colour; a value that this check cannot read counts as
// the default canvas.
const canvasOf = (given?: string): Hex =>
  given === undefined ? LIGHT : (canvasColor(given) ?? LIGHT);
const FALLBACK: AppInput = {
  ok: false,
  fatal: { code: "error-fallback", path: [] },
  source: "model",
};

const noTypes = Object.keys(profile.nodeTypes).length === 0;
const today = () => new Date().toISOString().slice(0, 10);

/** Turns one API payload into the input of the shell. A bad payload gives a notice, not a throw. */
export function toInput(raw: unknown, canvasGiven?: string): AppInput {
  const canvas = canvasOf(canvasGiven);
  try {
    const now = today();
    const result = normalize(raw, { now });
    if (!result.ok)
      return { ok: false, fatal: result.fatal, source: "model" };
    const { graph, payload, hash, counts, shaped } = result;
    const { vocab, issues } = resolveVocab(graph, payload, profile, canvas);
    // A viewer with no node types in its profile has no opinion about a type name.
    const shown = noTypes
      ? issues.filter((issue) => issue.code !== "unknown-type")
      : issues;
    return {
      ok: true,
      model: { graph, payload, hash, vocab, canvas },
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
