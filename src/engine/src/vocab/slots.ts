import {
  profile as engineProfile,
  type Profile,
  type RenderInput,
} from "@qdic-topology/contract";
import type { Entity, NodeRecord, Triple } from "../data/merge";
import type { Payload } from "../data/normalize";
import { entriesOf } from "./predicates";
import type { Vocab } from "./resolve";

type SlotSpec = Profile["slots"][number];
type ItemName = NonNullable<SlotSpec["itemName"]>[number];
export type Field = NonNullable<NonNullable<RenderInput["fields"]>[string]>;

export type Value = string | number | boolean | string[];
export type Entry = {
  value: Value;
  from: string;
  inferred?: string;
  mapped?: string;
  external?: true;
};
export type Slot = { slot: string; entries: readonly Entry[] };
export type Slots = { slots: Slot[]; isCatalog: boolean };

type Mapping = { index: number; why: string };
type Mappings = ReadonlyMap<string, ReadonlyMap<string, Mapping>>;
type EdgeIndex = ReadonlyMap<string, ReadonlyMap<string, Triple[]>>;
type NativeKeys = {
  plain: string[];
  asset: string[];
  external: ReadonlySet<string>;
};
type Mark = { mapped?: string; external?: true };

export type SlotContext = {
  profile: Profile;
  native: readonly NativeKeys[];
  mappings: Mappings;
  records: ReadonlyMap<string, NodeRecord>;
  labels: ReadonlyMap<string, string>;
  out: EdgeIndex;
  chains: ReadonlyMap<string, string[]>;
  owners: Map<string, Entry[]>;
  typeOf: (entityId: string) => string | null;
  levelOf: (entityId: string) => number | undefined;
  isAsset: (entityId: string) => boolean;
};

// why: lead decision D47 and app.js line 608 — the container chain holds at most 8 parents
const CHAIN_LIMIT = 8;
const ATTRIBUTE = "attribute ";
const DERIVE = "derive ";

type Item = string | number | boolean;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// why: open question 16, Security round 4 minor (a) — each path step reads an own key only
function walk(item: Record<string, unknown>, path: string[]): string {
  let current: unknown = item;
  for (const step of path) {
    if (!isObject(current) || !Object.hasOwn(current, step)) return "";
    current = current[step];
  }
  return typeof current === "string" ? current : "";
}

function nameOf(item: Record<string, unknown>, names: ItemName[]) {
  for (const name of names) {
    const parts = name.paths.map((path) => walk(item, path)).filter(Boolean);
    if (parts.length > 0) return parts.join(name.join);
  }
  return undefined;
}

function itemOf(item: unknown, spec: SlotSpec): Item | undefined {
  if (typeof item === "string") return item === "" ? undefined : item;
  if (typeof item === "number" || typeof item === "boolean") return item;
  if (isObject(item) && spec.itemName) return nameOf(item, spec.itemName);
  return undefined;
}

// why: FR-DATA-7 — a value is data, never HTML; an empty value or list gives no entry
function itemsOf(raw: unknown, spec: SlotSpec): Item[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : [raw];
  return list.flatMap((item) => itemOf(item, spec) ?? []);
}

// why: SA §4.1 — the QDIC `logicalName` is a record field of the canonical graph, read under its
// input name like an attribute; an attribute of the same name hides it
function aliasesOf(record: NodeRecord): Record<string, unknown> {
  return { logicalName: record.logicalName };
}

function readKey(record: NodeRecord, key: string): unknown {
  if (Object.hasOwn(record.attrs, key)) return record.attrs[key];
  const aliases = aliasesOf(record);
  return Object.hasOwn(aliases, key) ? aliases[key] : undefined;
}

function keysOf(record: NodeRecord): string[] {
  const aliases = Object.entries(aliasesOf(record))
    .filter(
      ([key, value]) =>
        value !== undefined && !Object.hasOwn(record.attrs, key),
    )
    .map(([key]) => key);
  return [...Object.keys(record.attrs), ...aliases];
}

class Collector {
  readonly entries: Entry[] = [];
  private readonly seen = new Set<string>();

  add(entry: Entry, identity: string): void {
    const key = `${entry.from}\u0000${identity}\u0000${entry.mapped ?? "\u0001"}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.entries.push(entry);
  }

  // why: QA Q-D1 — an empty label gives no entry, as an empty attribute value does
  label(value: string, from: string, identity: string): void {
    if (value !== "") this.add({ value, from }, identity);
  }
}

function addKey(
  out: Collector,
  key: string,
  record: NodeRecord,
  spec: SlotSpec,
  mark: Mark,
): void {
  for (const value of itemsOf(readKey(record, key), spec)) {
    const reason = Object.hasOwn(record.inferred, key)
      ? record.inferred[key]
      : undefined;
    const entry: Entry = { value, from: `${ATTRIBUTE}${key}` };
    if (reason !== undefined) entry.inferred = reason;
    if (mark.mapped !== undefined) entry.mapped = mark.mapped;
    if (mark.external) entry.external = true;
    out.add(entry, `${typeof value}:${String(value)}`);
  }
}

function addKeys(
  out: Collector,
  keys: readonly string[],
  records: NodeRecord[],
  spec: SlotSpec,
  external: ReadonlySet<string>,
): void {
  for (const key of keys) {
    const mark: Mark = external.has(key) ? { external: true } : {};
    for (const record of records) addKey(out, key, record, spec, mark);
  }
}

// why: Security blocking item (1) (a) — a record reads only its own keys that have a mapping, so
// the work grows with the attributes, not with entities × mappings; the `fields` order stays
function addMapped(
  out: Collector,
  records: NodeRecord[],
  spec: SlotSpec,
  ctx: SlotContext,
): void {
  const mappings = ctx.mappings.get(spec.slot);
  if (mappings === undefined) return;
  const found: { key: string; record: NodeRecord; mapping: Mapping }[] = [];
  for (const record of records)
    for (const key of keysOf(record)) {
      const mapping = mappings.get(key);
      if (mapping !== undefined) found.push({ key, record, mapping });
    }
  found.sort((a, b) => a.mapping.index - b.mapping.index);
  for (const { key, record, mapping } of found)
    addKey(out, key, record, spec, { mapped: mapping.why });
}

export function mappingsOf(fields: ReadonlyMap<string, Field>): Mappings {
  const mappings = new Map<string, Map<string, Mapping>>();
  let index = 0;
  for (const [key, field] of fields) {
    if (field.slot === undefined) continue;
    const slot = mappings.get(field.slot) ?? new Map<string, Mapping>();
    slot.set(key, { index: index++, why: field.why ?? "" });
    mappings.set(field.slot, slot);
  }
  return mappings;
}

export function edgeIndex(triples: Triple[]): EdgeIndex {
  const index = new Map<string, Map<string, Triple[]>>();
  for (const triple of triples) {
    const bySubject = index.get(triple.subject) ?? new Map<string, Triple[]>();
    const list = bySubject.get(triple.predicate) ?? [];
    list.push(triple);
    bySubject.set(triple.predicate, list);
    index.set(triple.subject, bySubject);
  }
  return index;
}

// why: the step-1 key list of each profile slot is made once for each call, for an asset type and
// for any other type; STORY-004-01 Rule C — `external` holds every `notYetIncluded` field of the
// slot, also one that is a native or late key (GV §Not yet included: source data, not the graph)
export function nativeKeysOf(profile: Profile): NativeKeys[] {
  return profile.slots.map((spec) => {
    const late = spec.late ?? [];
    const fields = profile.notYetIncluded
      .filter((item) => item.slot === spec.slot)
      .map((item) => item.field);
    const aliases = fields.filter(
      (field) => !spec.keys.includes(field) && !late.includes(field),
    );
    const plain = [...spec.keys, ...aliases];
    return {
      plain,
      asset: [...plain, ...(spec.assetOnlyKeys ?? [])],
      external: new Set(fields),
    };
  });
}

function addEdges(
  out: Collector,
  from: string,
  subject: string,
  predicate: string,
  ctx: SlotContext,
  objectType?: string,
): void {
  for (const triple of ctx.out.get(subject)?.get(predicate) ?? []) {
    if (objectType !== undefined && ctx.typeOf(triple.object) !== objectType)
      continue;
    const label = ctx.labels.get(triple.object) ?? triple.object;
    out.label(label, from, `#${triple.object}`);
  }
}

// why: Security blocking item (1) (b) — the owners of a container are read once, not once for
// each child
function ownersOf(
  container: string,
  edge: string,
  from: string,
  ctx: SlotContext,
): Entry[] {
  const key = `${edge}\u0000${container}`;
  const known = ctx.owners.get(key);
  if (known !== undefined) return known;
  const out = new Collector();
  addEdges(out, from, container, edge, ctx);
  ctx.owners.set(key, out.entries);
  return out.entries;
}

// why: a derive entry has its own `from`, so no entry of another step can repeat it
function derivedOf(
  spec: SlotSpec,
  entity: Entity,
  ctx: SlotContext,
): readonly Entry[] {
  const chain = ctx.chains.get(entity.id) ?? [];
  if (spec.derive === undefined || chain.length === 0) return [];
  const from = `${DERIVE}${spec.derive}`;
  const label = (id: string) => ctx.labels.get(id) ?? id;
  if (spec.derive === "path")
    return [{ value: [...chain.map(label), entity.label], from }];
  if (spec.derive === "source") {
    // why: FR-QDIC-1 tree level L0 — the level replaces the mockup type-name test (D13)
    const top = label(chain[0]);
    return ctx.levelOf(chain[0]) === 0 && top !== ""
      ? [{ value: top, from }]
      : [];
  }
  if (spec.edge === undefined) return [];
  return ownersOf(chain[chain.length - 1], spec.edge, from, ctx);
}

// why: SA §4.4 `vocab/slots` and FR-DATA-7 — native keys, edges, the containment chain, late
// keys, then one AI entry for each `fields` mapping; an AI mapping never hides catalog data
function slotOf(
  spec: SlotSpec,
  keys: readonly string[],
  external: ReadonlySet<string>,
  entity: Entity,
  records: NodeRecord[],
  ctx: SlotContext,
): Slot {
  const out = new Collector();
  addKeys(out, keys, records, spec, external);
  if (spec.edge !== undefined && spec.derive !== "parent-owners")
    addEdges(out, spec.edge, entity.id, spec.edge, ctx, spec.edgeObject);
  const at = out.entries.length;
  const derived = derivedOf(spec, entity, ctx);
  addKeys(out, spec.late ?? [], records, spec, external);
  addMapped(out, records, spec, ctx);
  // why: Security blocking item (1) (b) — the children of one container share its read-only
  // owner list when the slot has no other entry
  const entries =
    derived.length === 0
      ? out.entries
      : out.entries.length === 0
        ? derived
        : [...out.entries.slice(0, at), ...derived, ...out.entries.slice(at)];
  if (spec.labelFallback && entries.length === 0) {
    out.label(entity.label, "label", "label");
    return { slot: spec.slot, entries: out.entries };
  }
  return { slot: spec.slot, entries };
}

export function slotsOf(entity: Entity, ctx: SlotContext): Slots {
  const specs = ctx.profile.slots;
  const records = entity.records.flatMap((id) => ctx.records.get(id) ?? []);
  const asset = ctx.isAsset(entity.id);
  const slots = specs.map((spec, i) => {
    const { plain, asset: assetKeys, external } = ctx.native[i];
    const keys = asset ? assetKeys : plain;
    return slotOf(spec, keys, external, entity, records, ctx);
  });
  const isCatalog = slots.some(
    (slot, i) =>
      specs[i].strong === true &&
      slot.entries.some((entry) => entry.from.startsWith(ATTRIBUTE)),
  );
  return { slots, isCatalog };
}

const NATIVE = nativeKeysOf(engineProfile);
const SLOT_NAMES = new Set(engineProfile.slots.map((spec) => spec.slot));

// why: STORY-004-01 Rule E (G7; PRD FR-INSPECT-4, mockup `KNOWN_KEYS`, app.js lines 595, 753) —
// every key that a slot of the entity reads: native keys with the alias list, late keys, and each
// `fields` key mapped to a profile slot (FR-DATA-7: unknown slots are ignored); the inspector shows
// the other keys as "Other attributes", so the slot map stays in the profile
export function slotKeys(
  vocab: Vocab,
  payload: Payload,
  entityId: string,
): ReadonlySet<string> {
  const keys = new Set<string>();
  const entity = vocab.entities.get(entityId);
  if (entity === undefined) return keys;
  const type = entity.type === null ? undefined : vocab.types.get(entity.type);
  // why: lead decision D61, as `isAsset` of `vocab/resolve` — `treeRole` `structure` is an asset
  const asset = type?.treeRole === "structure";
  engineProfile.slots.forEach((spec, i) => {
    for (const key of asset ? NATIVE[i].asset : NATIVE[i].plain) keys.add(key);
    for (const key of spec.late ?? []) keys.add(key);
  });
  for (const [key, field] of entriesOf(payload.fields))
    if (field.slot !== undefined && SLOT_NAMES.has(field.slot)) keys.add(key);
  return keys;
}

// why: app.js lines 600-628 — one parent for each entity, the first containment triple in triple
// order; the chain runs from the top container down and stops at a loop
export function chainsOf(
  entities: Entity[],
  triples: Triple[],
  contains: ReadonlySet<string>,
): Map<string, string[]> {
  const parents = new Map<string, string>();
  for (const triple of triples)
    if (contains.has(triple.predicate) && !parents.has(triple.object))
      parents.set(triple.object, triple.subject);
  const chains = new Map<string, string[]>();
  for (const { id } of entities) {
    const chain: string[] = [];
    const seen = new Set([id]);
    let parent = parents.get(id);
    while (
      parent !== undefined &&
      !seen.has(parent) &&
      chain.length < CHAIN_LIMIT
    ) {
      seen.add(parent);
      chain.unshift(parent);
      parent = parents.get(parent);
    }
    chains.set(id, chain);
  }
  return chains;
}
