import type { Profile } from "@qdic-topology/contract";
import type { Graph, Payload } from "../data/normalize";
import { familyOf } from "../vocab/predicates";

// why: SA §4.8 addendum 0.33 (5) — "this row only" gives the edge `<predicate> (<family>)`, with the
// family as `familyOf` gives it; a name in use (edited graph, profile predicates or inverses,
// payload predicates) takes the first free ` n`, n = 2, 3, …
export function familyPredicateName(
  graph: Graph,
  profile: Profile,
  payload: Payload,
  predicate: string,
  family: string,
): string {
  const used = new Set(graph.triples.map((triple) => triple.predicate));
  const sent = payload.predicates ?? {};
  const taken = (name: string) =>
    used.has(name) ||
    Object.hasOwn(profile.predicates, name) ||
    Object.hasOwn(profile.inverses, name) ||
    Object.hasOwn(sent, name);
  const name = `${predicate} (${familyOf(family, undefined, profile.categoryOrder)})`;
  if (!taken(name)) return name;
  let n = 2;
  while (taken(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}
