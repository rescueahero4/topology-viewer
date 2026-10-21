import type { Profile, RenderInput } from "@qdic-topology/contract";
import { byCodePoint } from "../data/hash";
import type { Triple } from "../data/merge";
import type { Payload } from "../data/normalize";

export type Provenance = "system" | "custom" | "inferred";

type Vocabulary = NonNullable<RenderInput["vocabulary"]>;
export type Row = NonNullable<NonNullable<Vocabulary["nodeTypes"]>[number]>;
type ProfilePredicate = Profile["predicates"][string];
type PayloadPredicate = NonNullable<
  NonNullable<RenderInput["predicates"]>[string]
>;

export type ResolvedPredicate = {
  name: string;
  label: string;
  family: string;
  provenance: Provenance;
  reason?: string;
  inverse: string | null;
  direction: ProfilePredicate["direction"];
  role?: "containment";
  builtIn?: true;
  layoutRole?: NonNullable<ProfilePredicate["layoutRole"]>;
  retired: boolean;
  count: number;
};

export type Family = { key: string; count: number };

// why: FR-VOC-5 — the family of a predicate with no category
export const CUSTOM = "Custom";
const DEFAULT_DIRECTION = "out";

export function own<T>(record: Readonly<Record<string, T>>, key: string) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function entriesOf<T>(record: Readonly<Record<string, T>> | undefined) {
  const map = new Map<string, NonNullable<T>>();
  for (const [key, value] of Object.entries(record ?? {}))
    if (value !== undefined && value !== null) map.set(key, value);
  return map;
}

// why: SA §11 Untrusted input — the first row of each name; a row is read by its own keys only
export function rowsOf(rows: readonly (Row | undefined)[] | undefined) {
  const map = new Map<string, Row>();
  for (const row of rows ?? []) {
    const name = row === undefined ? undefined : own(row, "name");
    if (typeof name === "string" && !map.has(name)) map.set(name, row as Row);
  }
  return map;
}

export function provenanceOf(
  shaped: boolean,
  row: Row | undefined,
  isSystem: boolean | undefined,
): Provenance {
  if (shaped) return "inferred";
  // why: lead decision D88 (2), FR-VOC-2 order — a supplied row `is_system` wins over the profile
  const fromRow = row === undefined ? undefined : own(row, "is_system");
  const system = typeof fromRow === "boolean" ? fromRow : isSystem === true;
  return system ? "system" : "custom";
}

export function retiredOf(row: Row | undefined): boolean {
  return row !== undefined && own(row, "is_active") === false;
}

export const fold = (text: string) => text.normalize("NFC").toLowerCase();

// why: lead decisions D15 (PO P4) and D51 — a supplied category that equals a profile family
// after NFC and lower case is that family with the profile spelling; `Custom` joins Custom
function familyOf(
  supplied: unknown,
  fallback: string | undefined,
  order: readonly string[],
): string {
  if (typeof supplied !== "string" || supplied === "")
    return fallback ?? CUSTOM;
  const key = fold(supplied);
  const known = order.find((name) => fold(name) === key);
  if (known !== undefined) return known;
  return key === fold(CUSTOM) ? CUSTOM : supplied;
}

type Context = {
  profile: Profile;
  payload: ReadonlyMap<string, PayloadPredicate>;
  rows: ReadonlyMap<string, Row>;
  shaped: ReadonlyMap<string, string | undefined>;
  counts: ReadonlyMap<string, number>;
};

function predicateOf(name: string, ctx: Context): ResolvedPredicate {
  const sent = ctx.payload.get(name);
  const row = ctx.rows.get(name);
  const base = own(ctx.profile.predicates, name);
  const supplied = sent?.category ?? (row && own(row, "category"));
  const rowInverse = row && own(row, "inverse_predicate");
  const role = sent?.role ?? base?.role;
  const reason = ctx.shaped.get(name);
  return {
    name,
    label: sent?.label ?? name,
    family: familyOf(supplied, base?.category, ctx.profile.categoryOrder),
    provenance: provenanceOf(ctx.shaped.has(name), row, base?.isSystem),
    ...(reason === undefined ? {} : { reason }),
    inverse:
      sent?.inverse ??
      (typeof rowInverse === "string" ? rowInverse : undefined) ??
      base?.inverse ??
      null,
    direction: base?.direction ?? DEFAULT_DIRECTION,
    ...(role ? { role } : {}),
    ...(base?.builtIn ? { builtIn: base.builtIn } : {}),
    ...(base?.layoutRole ? { layoutRole: base.layoutRole } : {}),
    retired: retiredOf(row),
    count: ctx.counts.get(name) ?? 0,
  };
}

// why: lead decision D41 — the reason of a shaped predicate is the Triple `inferred.predicate` of
// its first triple in the set
function shapedPredicates(triples: Triple[], keys: ReadonlySet<string>) {
  const shaped = new Map<string, string | undefined>();
  for (const triple of triples) {
    if (!keys.has(triple.key) || shaped.has(triple.predicate)) continue;
    const inferred = triple.inferred ?? {};
    shaped.set(triple.predicate, own(inferred, "predicate"));
  }
  return shaped;
}

// why: PRD FR-FILTER-1 and open question 11 — API families in profile order, then custom
// families by code point, then Custom; only families with a triple
function familiesOf(
  predicates: Iterable<ResolvedPredicate>,
  order: readonly string[],
): Family[] {
  const counts = new Map<string, number>();
  for (const { family, count } of predicates)
    if (count > 0) counts.set(family, (counts.get(family) ?? 0) + count);
  const rank = (key: string) =>
    key === CUSTOM
      ? order.length + 1
      : order.includes(key)
        ? order.indexOf(key)
        : order.length;
  return [...counts.keys()]
    .sort((a, b) => rank(a) - rank(b) || byCodePoint(a, b))
    .map((key) => ({ key, count: counts.get(key) as number }));
}

export function predicatesOf(
  triples: Triple[],
  shapedKeys: ReadonlySet<string>,
  payload: Payload,
  profile: Profile,
) {
  const counts = new Map<string, number>();
  for (const { predicate } of triples)
    counts.set(predicate, (counts.get(predicate) ?? 0) + 1);
  const ctx: Context = {
    profile,
    payload: entriesOf(payload.predicates),
    rows: rowsOf(payload.vocabulary?.predicates),
    shaped: shapedPredicates(triples, shapedKeys),
    counts,
  };
  const names = new Set([
    ...counts.keys(),
    ...ctx.payload.keys(),
    ...ctx.rows.keys(),
  ]);
  const predicates = new Map<string, ResolvedPredicate>();
  for (const name of names) predicates.set(name, predicateOf(name, ctx));
  return {
    predicates,
    families: familiesOf(predicates.values(), profile.categoryOrder),
  };
}
