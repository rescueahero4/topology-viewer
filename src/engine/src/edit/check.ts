import type { Profile } from "@qdic-topology/contract";
import type { Graph } from "../data/normalize";
import { locate } from "./apply";
import {
  fieldOf,
  valueOf,
  type CellChange,
  type EditCode,
  type Field,
  type ValueKind,
} from "./types";

const DATE_FORM =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):?(\d{2}))?)?$/;

// why: STORY-008-01 rule 7 (PRD-002 FR-CELL-1, FR-CELL-2 addendum 0.3) — an absent or `null` value
// is an empty cell that takes text
export function valueKind(value: unknown): ValueKind {
  if (typeof value === "string") return DATE_FORM.test(value) ? "date" : "text";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object" && value !== null) return "object";
  return "text";
}

const daysIn = (year: number, month: number) =>
  month === 2
    ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

// why: STORY-008-01 rule 6 — a date cell takes only a real calendar date (`2026-02-30` is not one)
function isDate(value: unknown): boolean {
  const parts = typeof value === "string" ? DATE_FORM.exec(value) : null;
  if (parts === null) return false;
  const [year, month, day, hour, minute, second, offHour, offMinute] = parts
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part)));
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysIn(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offHour <= 23 &&
    offMinute <= 59
  );
}

// why: PRD-002 FR-CELL-5 — the columns that may never be empty
const REQUIRED = new Set([
  ...["label", "type", "predicate", "subject", "object"],
  ...["shownId", "typeLabel", "family"],
]);

const blank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

function selfEdge(graph: Graph, index: number, field: Field, after: unknown) {
  if (field.attr || (field.key !== "subject" && field.key !== "object"))
    return false;
  const triple = graph.triples[index];
  const subject = field.key === "subject" ? after : triple.subject;
  const object = field.key === "object" ? after : triple.object;
  return subject === object;
}

// why: STORY-008-09 rule 12 — an ID is in use when another node, entity or edge shows it
function idInUse(graph: Graph, index: number, kind: string, id: unknown) {
  const own = kind === "node" ? graph.records[index].id : null;
  const nodes = [...graph.records, ...graph.entities].some(
    (item) => item.id !== own && (item.shownId ?? item.id) === id,
  );
  return (
    nodes ||
    graph.triples.some(
      (triple, at) =>
        !(kind === "edge" && at === index) && triple.shownId === id,
    )
  );
}

// why: STORY-008-09 rule 18 — the named edge facts keep their kinds (`valid_from`, `valid_to`
// text, `isActive` true/false)
function badEdgeSet(after: unknown): boolean {
  const set = after as Record<string, unknown>;
  const at = (key: string) => (Object.hasOwn(set, key) ? set[key] : undefined);
  const text = (v: unknown) => v === undefined || typeof v === "string";
  const flag = at("isActive");
  return (
    !text(at("valid_from")) ||
    !text(at("valid_to")) ||
    !(flag === undefined || typeof flag === "boolean")
  );
}

// why: STORY-008-09 rule 19 — a list cell takes a list and an object cell an object
function badShape(current: string, after: unknown): boolean {
  if (current === "list") return !Array.isArray(after);
  if (current !== "object") return false;
  return typeof after !== "object" || after === null || Array.isArray(after);
}

// why: SA §4.8, PRD-002 FR-CELL-5 — the engine gives the code only; the shell shows its text.
// The inverse check is an own-key check, so `__proto__` is not an inverse name (LEARNINGS 68)
export function checkEdit(
  graph: Graph,
  profile: Profile,
  change: CellChange,
): EditCode | null {
  const { kind, index } = locate(graph, change.row);
  const field = fieldOf(kind, change.column);
  const { after } = change;
  const required = !field.attr && REQUIRED.has(field.key);
  if (required && blank(after)) return "empty";
  if (after === undefined) return null;
  if (field.key === "shownId" && idInUse(graph, index, kind, after))
    return "id-in-use";
  if (field.key === "attrs")
    return kind === "edge" && badEdgeSet(after) ? "bad-attributes" : null;
  if (kind === "edge" && selfEdge(graph, index, field, after))
    return "self-edge";
  if (
    required &&
    field.key === "predicate" &&
    typeof after === "string" &&
    Object.hasOwn(profile.inverses, after)
  )
    return "inverse-name";
  const target = kind === "node" ? graph.records[index] : graph.triples[index];
  const current = valueKind(valueOf(target, field));
  if (field.attr && badShape(current, after)) return "not-json";
  if (
    current === "number" &&
    !(typeof after === "number" && Number.isFinite(after))
  )
    return "not-a-number";
  if (current === "date" && !isDate(after)) return "not-a-date";
  return null;
}
