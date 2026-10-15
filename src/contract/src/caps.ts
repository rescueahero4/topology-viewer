import type { Issue } from "./input";

const TOO_LARGE = "too-large";

// why: SA §11 harm criterion 4 — no caller can raise a cap at run time (Security round 4 note e)
export const CAPS = Object.freeze({
  nodes: 2000,
  edges: 4000,
  bytes: 262144,
  pasteBytes: 1048576,
});

// why: SA §11 — count UTF-8 bytes before JSON.parse; CJK text has fewer characters than bytes
export function checkSize(text: string): Issue | null {
  const bytes = new TextEncoder().encode(text).length;
  return bytes > CAPS.bytes ? { code: TOO_LARGE, path: [] } : null;
}

export function checkCounts(nodes: number, edges: number): Issue | null {
  if (nodes > CAPS.nodes) return { code: TOO_LARGE, path: ["nodes"] };
  if (edges > CAPS.edges) return { code: TOO_LARGE, path: ["edges"] };
  return null;
}
