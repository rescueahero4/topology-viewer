import type { z } from "zod/mini";
import type { attrs, issueSchema } from "./input";

export type Path = z.infer<typeof issueSchema>["path"];
export type Raw = z.infer<typeof attrs>;

export const NODE_LISTS: Path[] = [["nodes"], ["neighborhood", "nodes"]];
export const EDGE_LISTS: Path[] = [
  ["edges"],
  ["links"],
  ["neighborhood", "edges"],
];

export function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// why: STORY-001-02 T2.4 — read own keys only, so a prototype key never feeds a value
export function own(record: Raw, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function at(raw: Raw, path: Path): unknown {
  const [first, second] = path.map(String);
  const value = own(raw, first);
  if (second === undefined) return value;
  return isRecord(value) ? own(value, second) : undefined;
}
