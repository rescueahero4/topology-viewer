import { useState } from "preact/hooks";

let made = 0;

// why: STORY-005-08 rule 2 (ISSUE-014) — `preact` 10.29.8 `useId` starts its counter again at the
// third `render()` call on one root; one counter for the page gives each id once for the life of
// the page, with a fixed prefix and never from input data
export function useElementId(): string {
  const [id] = useState(() => `ui-${made++}`);
  return id;
}
