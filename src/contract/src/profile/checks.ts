import type { z } from "zod";
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

export function makeChecker(p: Shape, ctx: z.RefinementCtx): Checker {
  const types = new Set(Object.keys(p.nodeTypes));
  const predicates = new Set([
    ...Object.keys(p.predicates),
    ...Object.keys(p.inverses),
  ]);
  const fail: Fail = (path, message) =>
    ctx.addIssue({ code: "custom", path, message });
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

export function checkSlots(p: Shape, { fail, needPredicate }: Checker) {
  p.slots.forEach((s, i) => {
    if (s.edge !== undefined) needPredicate(["slots", i, "edge"], s.edge);
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
      a.resolves?.forEach((name, j) =>
        needType(["attributeSets", set, i, "resolves", j], name),
      );
    });
  }
  for (const [prefix, entry] of Object.entries(p.globalIdPrefixes)) {
    if (entry.type !== null)
      needType(["globalIdPrefixes", prefix, "type"], entry.type);
  }
}
