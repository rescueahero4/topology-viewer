import { z } from "zod";
import qdic from "./qdic.json";
import { profileShapeSchema } from "./types";

const ANY = "any";

export const profileSchema = profileShapeSchema.superRefine((p, ctx) => {
  const types = new Set(Object.keys(p.nodeTypes));
  const predicates = new Set([
    ...Object.keys(p.predicates),
    ...Object.keys(p.inverses),
  ]);
  const slotIds = new Set(p.slots.map((s) => s.slot));
  const fail = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });
  const needType = (
    path: (string | number)[],
    name: string,
    allowAny = false,
  ) => {
    if (!types.has(name) && !(allowAny && name === ANY))
      fail(path, `unknown node type "${name}"`);
  };
  const needPredicate = (path: (string | number)[], name: string) => {
    if (!predicates.has(name)) fail(path, `unknown predicate "${name}"`);
  };

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

  p.pairings.forEach((pa, i) => {
    needPredicate(["pairings", i, "predicate"], pa.predicate);
    needType(["pairings", i, "subject"], pa.subject, true);
    needType(["pairings", i, "object"], pa.object, true);
  });

  p.slots.forEach((s, i) => {
    if (s.edge !== undefined) needPredicate(["slots", i, "edge"], s.edge);
  });

  p.notYetIncluded.forEach((n, i) => {
    if (n.slot !== null && !slotIds.has(n.slot))
      fail(["notYetIncluded", i, "slot"], `unknown slot "${n.slot}"`);
  });

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
});

export type Profile = z.infer<typeof profileSchema>;

export function loadProfile(raw: unknown): Profile {
  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`Invalid profile:\n${lines.join("\n")}`);
  }
  return result.data;
}

export const profile = loadProfile(qdic);
