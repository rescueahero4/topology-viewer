import type { Issue, Profile, RenderInput } from "@qdic-topology/contract";
import { containment, type Entity, type NodeRecord } from "../data/merge";
import type { Graph, Payload } from "../data/normalize";
import type { Hex } from "./colors";
import {
  entriesOf,
  own,
  predicatesOf,
  provenanceOf,
  retiredOf,
  rowsOf,
  type Family,
  type Provenance,
  type ResolvedPredicate,
  type Row,
} from "./predicates";
import {
  chainsOf,
  edgeIndex,
  mappingsOf,
  nativeKeysOf,
  slotsOf,
  type Slot,
  type SlotContext,
  type Slots,
} from "./slots";
import {
  visualsOf,
  type Designed,
  type Visual,
  type VisualSpec,
} from "./visual";

type NodeType = Profile["nodeTypes"][string];
type TypeEntry = NonNullable<NonNullable<RenderInput["types"]>[string]>;
type TreeRole = NodeType["treeRole"];

export type ResolvedType = {
  name: string;
  label: string;
  labelSupplied?: true;
  provenance: Provenance;
  reason?: string;
  declared: boolean;
  retired: boolean;
  builtIn?: true;
  level?: number;
  treeRole?: TreeRole;
  description?: string;
  count: number;
  visual: Visual;
};

export type ResolvedEntity = {
  id: string;
  label: string;
  type: string | null;
  provenance: Provenance;
  lost: boolean;
  writable?: boolean;
  path: string[];
  slots: Slot[];
  isCatalog: boolean;
};

export type Vocab = {
  types: Map<string, ResolvedType>;
  predicates: Map<string, ResolvedPredicate>;
  families: Family[];
  entities: Map<string, ResolvedEntity>;
  untyped: Designed | null;
  provenance: Record<Provenance, number>;
};

type Typed = { type: string | null; inferred: boolean };

type Context = {
  profile: Profile;
  types: ReadonlyMap<string, TypeEntry>;
  rows: ReadonlyMap<string, Row>;
  records: ReadonlyMap<string, NodeRecord>;
  shapedRecords: ReadonlySet<string>;
  lost: readonly string[];
};

// why: FR-VOC-2 steps 3 and 4 — a global-id prefix, then the profile `resolves` pairs of an
// attribute (SA §4.4 `vocab/resolve`); no type name or attribute key is in engine code (D13)
function inferType(entity: Entity, ctx: Context): string | null {
  const prefix = Object.entries(ctx.profile.globalIdPrefixes).find(([start]) =>
    entity.id.startsWith(start),
  );
  const prefixType = prefix?.[1].type ?? null;
  const attrs = ctx.records.get(entity.id)?.attrs ?? {};
  for (const set of Object.values(ctx.profile.attributeSets))
    for (const { key, resolves } of set) {
      const value = Object.hasOwn(attrs, key) ? attrs[key] : undefined;
      if (typeof value !== "string") continue;
      const pair = resolves?.find(
        (members) =>
          members.includes(value) &&
          (prefixType === null || members.includes(prefixType)),
      );
      if (pair !== undefined) return value;
    }
  return prefixType;
}

function typeOfEntity(entity: Entity, ctx: Context): Typed {
  if (entity.type !== undefined) return { type: entity.type, inferred: false };
  const type = inferType(entity, ctx);
  return { type, inferred: type !== null };
}

// why: lead decisions D18, D41, D50 — a type is `inferred` when `data/shape` chose it for a record;
// its reason is the record `inferred.type` of the first such record
function shapedTypes(records: NodeRecord[], shaped: ReadonlySet<string>) {
  const types = new Map<string, string | undefined>();
  for (const record of records)
    if (
      shaped.has(record.id) &&
      record.type !== undefined &&
      !types.has(record.type)
    )
      types.set(record.type, own(record.inferred, "type"));
  return types;
}

function isDeclared(name: string, ctx: Context): boolean {
  return (
    ctx.types.has(name) ||
    ctx.rows.has(name) ||
    Object.hasOwn(ctx.profile.nodeTypes, name)
  );
}

function specOf(name: string | null, ctx: Context): VisualSpec {
  if (name === null) return { name, markLabel: "" };
  const sent = ctx.types.get(name);
  const base = own(ctx.profile.nodeTypes, name);
  return {
    name,
    ...(base?.icon === undefined ? {} : { icon: base.icon }),
    markLabel: sent?.label ?? name.replace(/[_-]/g, " "),
    rank: sent?.rank ?? (sent?.shape === undefined ? base?.rank : undefined),
    shape: sent?.shape,
    color: sent?.color,
    profileColor: base?.color,
    abbr: sent?.abbr ?? base?.abbr,
    glyph: sent?.glyph,
  };
}

function labelOf(name: string, ctx: Context): string {
  const label =
    ctx.types.get(name)?.label ?? own(ctx.profile.nodeTypes, name)?.label;
  if (label !== undefined) return label;
  const spaced = name.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function typeEntry(
  name: string,
  ctx: Context,
  shaped: ReadonlyMap<string, string | undefined>,
): Omit<ResolvedType, "count" | "visual"> {
  const sent = ctx.types.get(name);
  const base = own(ctx.profile.nodeTypes, name);
  const row = ctx.rows.get(name);
  const reason = shaped.get(name);
  const level = base?.level ?? sent?.level;
  const treeRole = base?.treeRole ?? sent?.role;
  // why: STORY-004-01 Rule D (FR-INSPECT-2) — the first supplied row of the name; `types[t]` has
  // no description key (SA §4.1)
  const description = row === undefined ? undefined : own(row, "description");
  return {
    name,
    label: labelOf(name, ctx),
    // why: SA §4.4 cascade (supplied → system), ISSUE-012 C11 — the shell names a profile type
    // from its string table only when the payload gave no label
    ...(sent?.label === undefined ? {} : { labelSupplied: true as const }),
    provenance: provenanceOf(shaped.has(name), row, base?.isSystem),
    ...(reason === undefined ? {} : { reason }),
    declared: isDeclared(name, ctx),
    retired: retiredOf(row),
    ...(base?.builtIn ? { builtIn: base.builtIn } : {}),
    ...(level === undefined ? {} : { level }),
    ...(treeRole === undefined ? {} : { treeRole }),
    ...(typeof description === "string" && description !== ""
      ? { description }
      : {}),
  };
}

function typesOf(
  graph: Graph,
  typed: ReadonlyMap<string, Typed>,
  ctx: Context,
  canvas: Hex,
) {
  const counts = new Map<string, number>();
  for (const { type } of typed.values())
    if (type !== null) counts.set(type, (counts.get(type) ?? 0) + 1);
  // why: FR-CANVAS-15 — palette colours and derived letters follow the order of first appearance;
  // the entities with no type share one entry at the place of the first of them
  const order = [
    ...new Set<string | null>([
      ...[...typed.values()].map(({ type }) => type),
      ...ctx.types.keys(),
      ...ctx.rows.keys(),
    ]),
  ];
  const { visuals, issues } = visualsOf(
    order.map((name) => specOf(name, ctx)),
    [...ctx.types.values()].flatMap((entry) => entry.abbr ?? []),
    canvas,
  );
  const shaped = shapedTypes(graph.records, ctx.shapedRecords);
  const types = new Map<string, ResolvedType>();
  order.forEach((name, i) => {
    if (name !== null)
      types.set(name, {
        ...typeEntry(name, ctx, shaped),
        count: counts.get(name) ?? 0,
        visual: visuals[i],
      });
  });
  const at = order.indexOf(null);
  const untyped = at === -1 ? null : (visuals[at] as Designed);
  return { types, untyped, issues };
}

// why: FR-QDIC-4 and lead decision D11 — the "lost" key is the profile attribute with `lost: true`
function lostKeys(profile: Profile): string[] {
  return Object.values(profile.attributeSets).flatMap((set) =>
    set.filter((attribute) => attribute.lost).map((attribute) => attribute.key),
  );
}

// why: FR-QDIC-6 and FR-QDIC-7 — the record `isWritable`, else a writable profile prefix
function writableOf(records: NodeRecord[], profile: Profile) {
  const sent = records.find((record) => record.isWritable !== undefined);
  if (sent !== undefined) return sent.isWritable;
  const prefixes = Object.entries(profile.globalIdPrefixes)
    .filter(([, entry]) => entry.writable)
    .map(([start]) => start);
  return records.some((record) => prefixes.some((p) => record.id.startsWith(p)))
    ? true
    : undefined;
}

// why: Security blocking item (1) — each index is built once for each call, so the slot work
// stays near-linear in the input size (S46)
function slotContext(
  graph: Graph,
  payload: Payload,
  ctx: Context,
  typeAt: (id: string) => ResolvedType | undefined,
  typed: ReadonlyMap<string, Typed>,
): SlotContext {
  return {
    profile: ctx.profile,
    native: nativeKeysOf(ctx.profile),
    mappings: mappingsOf(entriesOf(payload.fields)),
    records: ctx.records,
    labels: new Map(graph.entities.map((entity) => [entity.id, entity.label])),
    out: edgeIndex(graph.triples),
    owners: new Map(),
    chains: chainsOf(
      graph.entities,
      graph.triples,
      containment(ctx.profile, payload.predicates),
    ),
    typeOf: (id) => typed.get(id)?.type ?? null,
    levelOf: (id) => typeAt(id)?.level,
    // why: lead decision D61 — an asset type is a type whose resolved `treeRole` is `structure`
    isAsset: (id) => typeAt(id)?.treeRole === "structure",
  };
}

function entityOf(
  entity: Entity,
  typed: Typed,
  types: ReadonlyMap<string, ResolvedType>,
  slots: Slots & { path: string[] },
  ctx: Context,
): ResolvedEntity {
  const records = entity.records.flatMap((id) => ctx.records.get(id) ?? []);
  const writable = writableOf(records, ctx.profile);
  const type = typed.type === null ? undefined : types.get(typed.type);
  return {
    id: entity.id,
    label: entity.label,
    type: typed.type,
    provenance: typed.inferred ? "inferred" : (type?.provenance ?? "custom"),
    lost: records.some((record) =>
      ctx.lost.some(
        (key) => Object.hasOwn(record.attrs, key) && record.attrs[key] === true,
      ),
    ),
    ...(writable === undefined ? {} : { writable }),
    ...slots,
  };
}

// why: PRD v0.8 FR-DATA-3 and lead decision D50 — one `unknown-type` for each entity of a type with
// no source, unless every record of the entity is a shaped record
function unknownIssues(
  graph: Graph,
  typed: ReadonlyMap<string, Typed>,
  ctx: Context,
): Issue[] {
  return graph.entities
    .filter((entity) => {
      const type = typed.get(entity.id)?.type ?? null;
      if (type !== null && isDeclared(type, ctx)) return false;
      return !entity.records.every((id) => ctx.shapedRecords.has(id));
    })
    .map((entity) => ({ code: "unknown-type", path: ["entities", entity.id] }));
}

// why: lead decision D47 — one entry runs `vocab/resolve`, `vocab/visual` and `vocab/slots` on the
// `normalize` result; the caller joins these issues after the `normalize` issues
export function resolveVocab(
  graph: Graph,
  payload: Payload,
  profile: Profile,
  canvas: Hex,
): { vocab: Vocab; issues: Issue[] } {
  const ctx: Context = {
    profile,
    types: entriesOf(payload.types),
    rows: rowsOf(payload.vocabulary?.nodeTypes),
    records: new Map(graph.records.map((record) => [record.id, record])),
    shapedRecords: new Set(graph.shapedSet.records),
    lost: lostKeys(profile),
  };
  const typed = new Map(
    graph.entities.map((e) => [e.id, typeOfEntity(e, ctx)]),
  );
  const { types, untyped, issues } = typesOf(graph, typed, ctx, canvas);
  const typeAt = (id: string) => {
    const type = typed.get(id)?.type;
    return type === null || type === undefined ? undefined : types.get(type);
  };
  const slots = slotContext(graph, payload, ctx, typeAt, typed);
  const entities = new Map<string, ResolvedEntity>();
  const provenance: Record<Provenance, number> = {
    system: 0,
    custom: 0,
    inferred: 0,
  };
  for (const entity of graph.entities) {
    const path = (slots.chains.get(entity.id) ?? []).map(
      (id) => slots.labels.get(id) ?? id,
    );
    const resolved = entityOf(
      entity,
      typed.get(entity.id) as Typed,
      types,
      { ...slotsOf(entity, slots), path },
      ctx,
    );
    entities.set(entity.id, resolved);
    provenance[resolved.provenance]++;
  }
  const shapedTriples = new Set(graph.shapedSet.triples);
  const { predicates, families } = predicatesOf(
    graph.triples,
    shapedTriples,
    payload,
    profile,
  );
  const vocab = { types, predicates, families, entities, untyped, provenance };
  return { vocab, issues: [...issues, ...unknownIssues(graph, typed, ctx)] };
}

export function entityType(vocab: Vocab, entityId: string): string | null {
  return vocab.entities.get(entityId)?.type ?? null;
}

export function entitySlots(vocab: Vocab, entityId: string): Slots | null {
  const entity = vocab.entities.get(entityId);
  return entity === undefined
    ? null
    : { slots: entity.slots, isCatalog: entity.isCatalog };
}

export function containerPath(vocab: Vocab, entityId: string): string[] {
  return vocab.entities.get(entityId)?.path ?? [];
}
