import type { Profile, RenderInput } from "@qdic-topology/contract";
import type { Entity, NodeRecord, Triple } from "../data/merge";

type SlotSpec = Profile["slots"][number];
type ItemName = NonNullable<SlotSpec["itemName"]>[number];
export type Field = NonNullable<NonNullable<RenderInput["fields"]>[string]>;

export type Value = string | number | boolean | string[];
export type Entry = {
  value: Value;
  from: string;
  inferred?: string;
  mapped?: string;
};
export type Slot = { slot: string; entries: Entry[] };
export type Slots = { slots: Slot[]; isCatalog: boolean };

export type SlotContext = {
  profile: Profile;
  fields: ReadonlyMap<string, Field>;
  records: ReadonlyMap<string, NodeRecord>;
  labels: ReadonlyMap<string, string>;
  out: ReadonlyMap<string, Triple[]>;
  chains: ReadonlyMap<string, string[]>;
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
// input name like an attribute
function readKey(record: NodeRecord, key: string): unknown {
  if (Object.hasOwn(record.attrs, key)) return record.attrs[key];
  const aliases: Record<string, unknown> = { logicalName: record.logicalName };
  return Object.hasOwn(aliases, key) ? aliases[key] : undefined;
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
}

function addKeys(
  out: Collector,
  keys: readonly string[],
  records: NodeRecord[],
  spec: SlotSpec,
  mapped?: string,
): void {
  for (const key of keys)
    for (const record of records)
      for (const value of itemsOf(readKey(record, key), spec)) {
        const reason = Object.hasOwn(record.inferred, key)
          ? record.inferred[key]
          : undefined;
        const entry: Entry = { value, from: `${ATTRIBUTE}${key}` };
        if (reason !== undefined) entry.inferred = reason;
        if (mapped !== undefined) entry.mapped = mapped;
        out.add(entry, `${typeof value}:${String(value)}`);
      }
}

function nativeKeys(spec: SlotSpec, profile: Profile, asset: boolean) {
  const late = spec.late ?? [];
  const aliases = profile.notYetIncluded
    .filter((item) => item.slot === spec.slot)
    .map((item) => item.field)
    .filter((field) => !spec.keys.includes(field) && !late.includes(field));
  return [
    ...spec.keys,
    ...aliases,
    ...(asset ? (spec.assetOnlyKeys ?? []) : []),
  ];
}

function addEdges(
  out: Collector,
  from: string,
  subject: string,
  predicate: string,
  ctx: SlotContext,
  objectType?: string,
): void {
  for (const triple of ctx.out.get(subject) ?? []) {
    if (triple.predicate !== predicate) continue;
    if (objectType !== undefined && ctx.typeOf(triple.object) !== objectType)
      continue;
    const label = ctx.labels.get(triple.object) ?? triple.object;
    out.add({ value: label, from }, `#${triple.object}`);
  }
}

function addDerived(
  out: Collector,
  spec: SlotSpec,
  entity: Entity,
  ctx: SlotContext,
): void {
  const chain = ctx.chains.get(entity.id) ?? [];
  if (spec.derive === undefined || chain.length === 0) return;
  const from = `${DERIVE}${spec.derive}`;
  const label = (id: string) => ctx.labels.get(id) ?? id;
  if (spec.derive === "path")
    out.add({ value: [...chain.map(label), entity.label], from }, "path");
  else if (spec.derive === "source") {
    // why: FR-QDIC-1 tree level L0 — the level replaces the mockup type-name test (D13)
    if (ctx.levelOf(chain[0]) === 0)
      out.add({ value: label(chain[0]), from }, `#${chain[0]}`);
  } else if (spec.edge !== undefined)
    addEdges(out, from, chain[chain.length - 1], spec.edge, ctx);
}

// why: SA §4.4 `vocab/slots` and FR-DATA-7 — native keys, edges, the containment chain, late
// keys, then one AI entry for each `fields` mapping; an AI mapping never hides catalog data
function slotOf(spec: SlotSpec, entity: Entity, ctx: SlotContext): Slot {
  const out = new Collector();
  const records = entity.records.flatMap((id) => ctx.records.get(id) ?? []);
  const asset = ctx.isAsset(entity.id);
  addKeys(out, nativeKeys(spec, ctx.profile, asset), records, spec);
  if (spec.edge !== undefined && spec.derive !== "parent-owners")
    addEdges(out, spec.edge, entity.id, spec.edge, ctx, spec.edgeObject);
  addDerived(out, spec, entity, ctx);
  addKeys(out, spec.late ?? [], records, spec);
  for (const [key, field] of ctx.fields)
    if (field.slot === spec.slot)
      addKeys(out, [key], records, spec, field.why ?? "");
  if (spec.labelFallback && out.entries.length === 0)
    out.add({ value: entity.label, from: "label" }, "label");
  return { slot: spec.slot, entries: out.entries };
}

export function slotsOf(entity: Entity, ctx: SlotContext): Slots {
  const specs = ctx.profile.slots;
  const slots = specs.map((spec) => slotOf(spec, entity, ctx));
  const isCatalog = slots.some(
    (slot, i) =>
      specs[i].strong === true &&
      slot.entries.some((entry) => entry.from.startsWith(ATTRIBUTE)),
  );
  return { slots, isCatalog };
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
