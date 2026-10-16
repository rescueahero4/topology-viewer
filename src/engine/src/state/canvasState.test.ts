import { profile } from "@qdic-topology/contract";
import { generate, loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import type { Action, CanvasState } from "./canvasState";

const LIGHT = canvasColor("#F4F4F5") as Hex;

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  return {
    graph,
    hash,
    first: () => firstView(graph, vocab, payload, hash),
    act: (state: CanvasState, action: Action) =>
      transition(state, action, graph, vocab),
    drawn: (state: CanvasState) => frontier(state, graph, vocab),
  };
}

type Run = ReturnType<typeof load>;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const roundTrip = (state: CanvasState) =>
  JSON.parse(JSON.stringify(state)) as CanvasState;

const firstGroup = (run: Run, state: CanvasState) =>
  run.drawn(state).nodes.find((node) => "members" in node)?.id ?? "";

function explored(run: Run) {
  const state = run.act(run.first(), { kind: "explore", id: "t_FCT_REVENUE" });
  return run.act(state, { kind: "expandGroup", group: firstGroup(run, state) });
}

describe("S21 the old state stays usable (Undo)", () => {
  it("is unchanged by a budget change and a Reset", () => {
    const run = load(loadFixture("s-access").input);
    const S = deepFreeze(explored(run));
    const snapshot = JSON.stringify(S);
    const before = run.drawn(S);
    const wider = run.act(S, { kind: "budget", budget: 50 });
    run.act(wider, { kind: "reset" });
    run.act(S, { kind: "reset" });
    expect(roundTrip(S)).toStrictEqual(JSON.parse(snapshot));
    expect(run.drawn(S)).toStrictEqual(before);
    expect(run.act(S, { kind: "budget", budget: 50 })).toStrictEqual(wider);
  });
});

describe("S22 JSON round trip", () => {
  it("gives the same frontier and the same next state", () => {
    const run = load(loadFixture("s-access").input);
    let state = explored(run);
    const entity = run.drawn(state).nodes.find((node) => "entity" in node);
    state = run.act(state, { kind: "select", node: entity?.id ?? null });
    state = run.act(state, { kind: "budget", budget: 50 });
    const copy = roundTrip(state);
    expect(copy).toStrictEqual(state);
    expect(run.drawn(copy)).toStrictEqual(run.drawn(state));
    const node = run.drawn(state).nodes.find((item) => item.more > 0);
    if (node === undefined || !("entity" in node)) throw new Error("none");
    const action: Action = { kind: "explore", id: node.entity };
    expect(run.act(copy, action)).toStrictEqual(run.act(state, action));
  });
});

describe("S25 edge selection", () => {
  it("keeps an anchor on the edge, else takes the subject", () => {
    const run = load(loadFixture("s-root-only").input);
    const state = run.act(run.first(), {
      kind: "explore",
      id: "t_FCT_REVENUE",
    });
    const edge = run.drawn(state).edges[0];
    const onEdge = run.act(state, {
      kind: "selectEdge",
      edge: edge.key,
      anchor: edge.object,
    });
    expect(onEdge.selection).toEqual({ edge: edge.key, anchor: edge.object });
    const offEdge = run.act(state, {
      kind: "selectEdge",
      edge: edge.key,
      anchor: "e:nope",
    });
    expect(offEdge.selection).toEqual({ edge: edge.key, anchor: edge.subject });
    expect(
      run.act(state, { kind: "selectEdge", edge: "[]", anchor: edge.object }),
    ).toBe(state);
  });
});

const MARK = "ZZ-TEXT-ZZ <b>";

function marked() {
  const star = generate.star(299);
  return {
    nodes: star.nodes.map((node) => ({
      ...node,
      label: `${MARK} ${node.label}`,
      attrs: { note: MARK },
      _inferred: { note: MARK },
    })),
    edges: star.edges,
    fields: { note: { label: MARK, why: MARK } },
    view: { root: "n0", approach: "active" },
  };
}

const ENUMS = new Set(["active", "passive", "ai", "auto", "all", "custom"]);

function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(stringsOf);
}

function allowed(text: string, ids: Set<string>): boolean {
  const bare = text.replace(/^[eg]:/, "");
  if (ids.has(bare) || ENUMS.has(text) || text === "off") return true;
  const parts = JSON.parse(bare) as unknown[];
  return parts.every((part) => part === null || typeof part === "string");
}

describe("S31 the state holds no payload text", () => {
  it("holds only ids, keys, numbers and enums at each step", () => {
    const run = load(marked());
    const ids = new Set(run.graph.entities.map((entity) => entity.id));
    expect(JSON.stringify(run.graph)).toContain("ZZ-TEXT-ZZ");
    const states = [run.first()];
    expect(run.drawn(states[0]).nodes.map((node) => node.id)).toEqual(["e:n0"]);
    const group = () => firstGroup(run, states[states.length - 1]);
    const actions: (() => Action)[] = [
      () => ({ kind: "explore", id: "n0" }),
      () => ({ kind: "expandGroup", group: group() }),
      () => ({ kind: "select", node: "e:n1" }),
      () => ({ kind: "budget", budget: 50 }),
    ];
    for (const make of actions)
      states.push(run.act(states[states.length - 1], make()));
    expect(states[1].revealed).toHaveLength(300);
    expect(states[4].scope.mode).toBe("all");
    states.forEach((state, index) => {
      if (index > 0) expect(state).not.toStrictEqual(states[index - 1]);
      const text = JSON.stringify(state);
      expect(text).not.toContain("ZZ-TEXT-ZZ");
      expect(text).not.toContain("<b>");
      for (const item of stringsOf(state))
        expect(allowed(item, ids)).toBe(true);
      const revealed = state.revealed?.length ?? ids.size;
      expect(text.length).toBeLessThanOrEqual(64 * revealed + 2048);
    });
  });
});

describe("S35 graphHash is the normalize hash", () => {
  it("stays the same through every step and a round trip", () => {
    const hashes = ["s-access", "s-chain"].map((key) => {
      const run = load(loadFixture(key).input);
      let state = run.first();
      const seen = [state.graphHash];
      const node = run.drawn(state).nodes.find((item) => item.more > 0);
      const id = node && "entity" in node ? node.entity : "";
      for (const action of [
        { kind: "explore", id },
        { kind: "budget", budget: 50 },
        { kind: "reset" },
      ] as Action[]) {
        state = run.act(state, action);
        seen.push(state.graphHash);
      }
      seen.push(roundTrip(state).graphHash);
      expect(new Set(seen)).toEqual(new Set([run.hash]));
      return run.hash;
    });
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});
