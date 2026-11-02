import { containerPath, type Vocab } from "#engine";
import { MISSING } from "./strings/index";

const counts = new WeakMap<Vocab, ReadonlyMap<string, number>>();

// why: rule 3, rule 7 (Security round 4) — one count for each input over `vocab.entities` (a merged
// entity counts once), in a `Map`, so a label such as `constructor` reads its own count
function labelCounts(vocab: Vocab): ReadonlyMap<string, number> {
  let known = counts.get(vocab);
  if (known === undefined) {
    const made = new Map<string, number>();
    for (const { label } of vocab.entities.values())
      made.set(label, (made.get(label) ?? 0) + 1);
    counts.set(vocab, made);
    known = made;
  }
  return known;
}

export function pathText(segments: readonly string[]): string {
  return segments.map((segment) => segment || MISSING).join(" › ");
}

// why: FR-CANVAS-19, rule 3 (H1 closed) — an entity whose label another entity also has gets the
// labels of its containers from the top down; an empty label is a dash (question 10), and an
// entity with no container gets no line. STORY-004-06 rule 3 uses the same line in search rows
export function namesakeLine(vocab: Vocab, entityId: string): string | null {
  const entity = vocab.entities.get(entityId);
  if (entity === undefined || (labelCounts(vocab).get(entity.label) ?? 0) < 2)
    return null;
  const path = containerPath(vocab, entityId);
  return path.length === 0 ? null : pathText(path);
}
