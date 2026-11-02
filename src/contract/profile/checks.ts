import type { z } from "zod/mini";
import type { profileShapeSchema } from "./types";

type Shape = z.infer<typeof profileShapeSchema>;
type Path = (string | number)[];
type Fail = (path: Path, message: string) => void;
type NeedType = (path: Path, name: string, allowAny?: boolean) => void;
type NeedPredicate = (path: Path, name: string) => void;

export type Checker = {
  fail: Fail;
  needType: NeedType;
  needPredicate: NeedPredicate;
};

const ANY = "any";

export function makeChecker(
  p: Shape,
  ctx: z.core.ParsePayload<Shape>,
): Checker {
  const types = new Set(Object.keys(p.nodeTypes));
  const predicates = new Set([
    ...Object.keys(p.predicates),
    ...Object.keys(p.inverses),
  ]);
  const fail: Fail = (path, message) =>
    ctx.issues.push({ code: "custom", path, message, input: ctx.value });
  return {
    fail,
    needType: (path, name, allowAny = false) => {
      if (!types.has(name) && !(allowAny && name === ANY))
        fail(path, `unknown node type "${name}"`);
    },
    needPredicate: (path, name) => {
      if (!predicates.has(name)) fail(path, `unknown predicate "${name}"`);
    },
  };
}

export function checkNodeTypes(p: Shape, { fail }: Checker) {
  for (const [name, t] of Object.entries(p.nodeTypes)) {
    const at = ["nodeTypes", name];
    if ((t.treeRole === "structure") !== (t.level !== undefined)) {
      fail([...at, "level"], "level is set for structure types only");
    }
    const designed = [t.rank, t.color, t.abbr, t.design];
    if (t.icon !== undefined && designed.some((v) => v !== undefined)) {
      fail([...at, "icon"], "a type has an icon or design values, not both");
    }
    if (t.icon === undefined && designed.some((v) => v === undefined)) {
      fail(at, "a type without icon needs rank, color, abbr and design");
    }
    if (t.attributeSet !== null && !(t.attributeSet in p.attributeSets)) {
      fail(
        [...at, "attributeSet"],
        `unknown attribute set "${t.attributeSet}"`,
      );
    }
  }
}

export function checkPredicates(p: Shape, { fail }: Checker) {
  for (const [name, pr] of Object.entries(p.predicates)) {
    const at = ["predicates", name];
    if (!p.categoryOrder.includes(pr.category))
      fail([...at, "category"], `unknown category "${pr.category}"`);
    if (pr.inverse !== null && p.inverses[pr.inverse]?.predicate !== name) {
      fail(
        [...at, "inverse"],
        `"${pr.inverse}" is not an inverse of "${name}"`,
      );
    }
  }
  for (const [name, inv] of Object.entries(p.inverses)) {
    if (!(inv.predicate in p.predicates)) {
      fail(
        ["inverses", name, "predicate"],
        `unknown predicate "${inv.predicate}"`,
      );
    }
  }
}

export function checkPairings(p: Shape, { needType, needPredicate }: Checker) {
  p.pairings.forEach((pa, i) => {
    needPredicate(["pairings", i, "predicate"], pa.predicate);
    needType(["pairings", i, "subject"], pa.subject, true);
    needType(["pairings", i, "object"], pa.object, true);
  });
}

export function checkSlots(
  p: Shape,
  { fail, needPredicate, needType }: Checker,
) {
  p.slots.forEach((s, i) => {
    if (s.edge !== undefined) needPredicate(["slots", i, "edge"], s.edge);
    if (s.edgeObject !== undefined)
      needType(["slots", i, "edgeObject"], s.edgeObject);
  });
  const slotIds = new Set(p.slots.map((s) => s.slot));
  p.notYetIncluded.forEach((n, i) => {
    if (n.slot !== null && !slotIds.has(n.slot))
      fail(["notYetIncluded", i, "slot"], `unknown slot "${n.slot}"`);
  });
}

export function checkReferences(p: Shape, { needType }: Checker) {
  for (const [set, list] of Object.entries(p.attributeSets)) {
    list.forEach((a, i) => {
      a.resolves?.forEach((pair, j) =>
        pair.forEach((name, k) =>
          needType(["attributeSets", set, i, "resolves", j, k], name),
        ),
      );
    });
  }
  for (const [prefix, entry] of Object.entries(p.globalIdPrefixes)) {
    if (entry.type !== null)
      needType(["globalIdPrefixes", prefix, "type"], entry.type);
  }
}

// why: PRD FR-DATA-7 — an asset-only key is one more alias of one slot, never a plain key
export function checkAssetOnlyKeys(p: Shape, { fail }: Checker) {
  const plain = new Set(p.slots.flatMap((s) => [...s.keys, ...(s.late ?? [])]));
  const lists = new Map<string, number>();
  for (const key of p.slots.flatMap((s) => s.assetOnlyKeys ?? []))
    lists.set(key, (lists.get(key) ?? 0) + 1);
  p.slots.forEach((s, i) => {
    s.assetOnlyKeys?.forEach((key, j) => {
      if (plain.has(key) || (lists.get(key) ?? 0) > 1)
        fail(
          ["slots", i, "assetOnlyKeys", j],
          `key "${key}" is also a plain key or in another assetOnlyKeys list`,
        );
    });
  });
}

// why: PRD FR-INSPECT-4 rule (d) — Parent owners reads an edge on the nearest container
export function checkSlotFields(p: Shape, { fail }: Checker) {
  p.slots.forEach((s, i) => {
    if (s.derive === "parent-owners" && s.edge === undefined)
      fail(["slots", i, "edge"], "a parent-owners slot needs an edge");
    s.itemName?.forEach((alternative, j) => {
      if (alternative.paths.length > 1 && alternative.join === "")
        fail(
          ["slots", i, "itemName", j, "join"],
          "an alternative with two or more paths needs a join text",
        );
    });
  });
}

// why: PRD FR-QDIC-7 — "built-in" is for what QDIC ships but does not manage as a system entry
export function checkBuiltIn(p: Shape, { fail }: Checker) {
  type Flagged = { builtIn?: true; isSystem: boolean };
  const lists: [string, Record<string, Flagged>][] = [
    ["nodeTypes", p.nodeTypes],
    ["predicates", p.predicates],
  ];
  for (const [list, record] of lists)
    for (const [name, entry] of Object.entries(record))
      if (entry.builtIn && entry.isSystem)
        fail([list, name, "builtIn"], "a system entry is not built-in");
}

export function checkTypeMenu(p: Shape, { fail }: Checker) {
  const categories = new Set(Object.values(p.nodeTypes).map((t) => t.category));
  p.typeMenuCategories.order.forEach((name, j, order) => {
    if (!categories.has(name) || order.indexOf(name) !== j)
      fail(
        ["typeMenuCategories", "order", j],
        `category "${name}" is repeated or no node type has it`,
      );
  });
}

// why: PRD FR-DATA-10 — each kind has one default entry, and only a tree entry reads label keys
export function checkHeuristics(p: Shape, { fail, needPredicate }: Checker) {
  const defaults = new Set<string>();
  p.shapeHeuristics.forEach((h, k) => {
    const at = ["shapeHeuristics", k];
    needPredicate([...at, "predicate"], h.predicate);
    if ((h.kind === "tree") !== (h.labelKeys !== undefined))
      fail([...at, "labelKeys"], "labelKeys is set for tree entries only");
    if (h.hintDefault === undefined) return;
    if (defaults.has(h.kind))
      fail([...at, "hintDefault"], `a second hintDefault for kind "${h.kind}"`);
    defaults.add(h.kind);
  });
  for (const kind of new Set(p.shapeHeuristics.map((h) => h.kind)))
    if (!defaults.has(kind))
      fail(["shapeHeuristics"], `no hintDefault entry for kind "${kind}"`);
}
