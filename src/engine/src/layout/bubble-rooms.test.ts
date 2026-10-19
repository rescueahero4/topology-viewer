import { readFileSync } from "node:fs";
import path from "node:path";
import { profile } from "@qdic-topology/contract";
import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import {
  bubbleRooms,
  canvasColor,
  firstView,
  frontier,
  normalize,
  resolveVocab,
  transition,
  type Hex,
  type IconMetrics,
} from "../index";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const METRICS = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "icon-metrics.test.json"),
    "utf8",
  ),
) as IconMetrics;
const TABLE = 'g:["tag_pii","taggedWith","<","table"]';
const COLUMN = 'g:["tag_pii","taggedWith","<","column"]';

function load(input: unknown) {
  const result = normalize(input, { now: "2026-10-19" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const state = firstView(graph, vocab, payload, hash);
  const drawn = frontier(state, graph, vocab);
  return {
    graph,
    vocab,
    state,
    drawn,
    rooms: () => bubbleRooms(drawn, vocab, METRICS),
  };
}

// why: the engine gives 73.19999999999999 for 73.2; the story tolerance is 1e-9
function expectRooms(got: [string, number][], want: [string, number][]) {
  expect(got.map(([id]) => id)).toEqual(want.map(([id]) => id));
  got.forEach(([id, room], at) =>
    expect(Math.abs(room - want[at][1]), id).toBeLessThanOrEqual(1e-9),
  );
}

const edge = (predicate: string) => (object: string) => ({
  subject: 'a"]<x',
  predicate,
  object,
});

// why: LEARNINGS 21 — the hostile payload H of the story Context (S7, S11)
const H = {
  nodes: [
    { id: 'a"]<x', type: "hub", label: "HUB" },
    { id: "m1", label: "M" },
    { id: "m2", label: "M2" },
    { id: "m3a", label: "SAME" },
    { id: "m3b", label: "SAME" },
    { id: "ds1", type: "data_source", label: "DS" },
    { id: "t1", type: "table", label: "L".repeat(10_000) },
  ],
  edges: [
    ...["m1", "m2", "m3a", "m3b"].map(edge("p")),
    ...["ds1", "t1"].map(edge("q")),
  ],
  view: { budget: "all" },
};

describe("S9 s-designed first view", () => {
  it("gives 8 rooms in frontier order", () => {
    expectRooms(load(loadFixture("s-designed").input).rooms(), [
      ["e:reg_eu_battery", 103.6],
      ["e:sup_cell", 84.6],
      ["e:sup_pack", 77],
      ["e:fac_osaka", 80.8],
      ["e:fac_brno", 73.2],
      ["e:prd_cell", 65.6],
      ["e:prd_pack", 80.8],
      ["e:prd_bike", 99.8],
    ]);
  });
});

describe("S10 s-star first view", () => {
  it("gives the leaf room, the named room and the group width", () => {
    expectRooms(load(loadFixture("s-star").input).rooms(), [
      ["e:tag_pii", 39.5],
      ["e:tg_class", 73.2],
      [TABLE, 103.6],
      [COLUMN, 103.6],
    ]);
  });
});

describe("S11 the hostile payload H", () => {
  it("gives the r + 22 room and caps the long label at 22 characters", () => {
    const rooms = new Map(load(H).rooms());
    expect(rooms.size).toBe(4);
    expectRooms(
      [
        ["e:ds1", rooms.get("e:ds1") as number],
        ["e:t1", rooms.get("e:t1") as number],
      ],
      [
        ["e:ds1", 64],
        ["e:t1", 103.6],
      ],
    );
  });
});

describe("S12 an empty frontier", () => {
  it("gives no room", () => {
    const run = load(loadFixture("s-empty").input);
    expect(run.drawn.nodes).toEqual([]);
    expect(run.rooms()).toEqual([]);
  });
});

describe("S13 two independent loads", () => {
  const twice = (make: () => string) => expect(make()).toBe(make());

  it("give the same bytes for s-designed", () =>
    twice(() => {
      const run = load(structuredClone(loadFixture("s-designed").input));
      return JSON.stringify([run.rooms(), run.drawn]);
    }));

  it("give the same bytes for s-star after the expand", () =>
    twice(() => {
      const run = load(structuredClone(loadFixture("s-star").input));
      const action = { kind: "expandGroup", group: TABLE } as const;
      const open = transition(run.state, action, run.graph, run.vocab);
      const drawn = frontier(open, run.graph, run.vocab);
      expect(drawn.nodes).toHaveLength(303);
      return JSON.stringify([bubbleRooms(drawn, run.vocab, METRICS), drawn]);
    }));
});
