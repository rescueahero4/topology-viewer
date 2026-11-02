import type { Issue } from "./input";
import type { FatalInfo } from "./notices/values";

const TOO_LARGE = "too-large";

// why: SA §11 harm criterion 4 — no caller can raise a cap at run time (Security round 4 note e)
export const CAPS = Object.freeze({
  nodes: 2000,
  edges: 4000,
  bytes: 8388608,
  depth: 256,
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

export type DepthFatal = {
  code: typeof TOO_LARGE;
  path: [];
  info: Extract<FatalInfo, { code: typeof TOO_LARGE }>;
};

// why: SA §4.1 nesting cap (Amendment 2026-10-22) — an explicit stack, never recursion, so a value
// nested far above the cap cannot overflow the call stack before the walk stops
export function checkDepth(value: unknown): DepthFatal | null {
  const stack: [unknown, number][] = [[value, 0]];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const [item, level] = next;
    if (typeof item !== "object" || item === null) continue;
    if (level > CAPS.depth) {
      const levels = (count: number) => ({ unit: "levels" as const, count });
      return {
        code: TOO_LARGE,
        path: [],
        info: {
          code: TOO_LARGE,
          got: levels(CAPS.depth + 1),
          limit: levels(CAPS.depth),
        },
      };
    }
    for (const key of Object.keys(item))
      stack.push([(item as Record<string, unknown>)[key], level + 1]);
  }
  return null;
}
