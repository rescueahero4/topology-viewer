export type Ticks<K> = { ticked: ReadonlySet<K>; anchor: K | null };

// why: FR-CANVAS-12, FR-TABLE-5 (mockup app.js lines 926-937) — a press flips the row; with Shift,
// every row from the last row pressed to this row takes the new state of this row. STORY-004-07
// uses the same function for the Workbench rows
export function rangeSelect<K>(
  keys: readonly K[],
  now: Ticks<K>,
  key: K,
  shift: boolean,
): Ticks<K> {
  const ticked = new Set(now.ticked);
  const on = !ticked.has(key);
  const at = keys.indexOf(key);
  const from = shift && now.anchor !== null ? keys.indexOf(now.anchor) : -1;
  const [low, high] =
    from < 0 ? [at, at] : [Math.min(from, at), Math.max(from, at)];
  for (let i = low; i <= high; i++)
    if (on) ticked.add(keys[i]);
    else ticked.delete(keys[i]);
  return { ticked, anchor: key };
}

// why: mockup `renderHidden` (app.js lines 846-848) — a key that left the list loses its tick, and
// an anchor that left the list is cleared
export function keepTicks<K>(keys: readonly K[], now: Ticks<K>): Ticks<K> {
  const present = new Set(keys);
  const ticked = new Set([...now.ticked].filter((key) => present.has(key)));
  const anchor =
    now.anchor !== null && present.has(now.anchor) ? now.anchor : null;
  return { ticked, anchor };
}
