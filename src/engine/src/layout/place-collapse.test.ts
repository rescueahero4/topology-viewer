import { profile } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import { normalize } from "../data/normalize";
import type {
  Action,
  CanvasState,
  DrawnId,
  Grouping,
  Point,
} from "../state/canvasState";
import { frontier } from "../view/frontier";
import { firstView, transition } from "../view/story";
import { canvasColor, type Hex } from "../vocab/colors";
import { resolveVocab } from "../vocab/resolve";
import type { IconMetrics } from "./drawn";
import { place } from "./place";

const LIGHT = canvasColor("#F4F4F5") as Hex;
const LEAF = { w: 24, h: 24, tier: "leaf" } as const;
const METRICS: IconMetrics = { tx: LEAF, ta: LEAF, t: LEAF, tl: LEAF };

const rel = (subject: string, object: string, predicate = "relatedTo") => ({
  subject,
  predicate,
  object,
});

type Input = {
  nodes: { id: string; type: string }[];
  edges: ReturnType<typeof rel>[];
};

function rig(
  input: Input,
  revealed: string[],
  positions: [DrawnId, Point][],
  grouping: Grouping,
) {
  const result = normalize(input, { now: "2026-10-14" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  const { graph, payload, hash } = result;
  const { vocab } = resolveVocab(graph, payload, profile, LIGHT);
  const view = (s: CanvasState) => frontier(s, graph, vocab);
  const ids = (s: CanvasState) => view(s).nodes.map((n) => n.id);
  const act = (s: CanvasState, action: Action) => {
    const next = transition(s, action, graph, vocab);
    const change = { action, before: view(s), after: view(next) };
    return place(next, change, vocab, METRICS).state;
  };
  const state: CanvasState = {
    ...firstView(graph, vocab, payload, hash),
    grouping,
    layout: "force",
    revealed,
    positions,
  };
  return { state, act, ids };
}

const at = (s: CanvasState, id: string) =>
  new Map(s.positions).get(id) as Point;

const records = (s: CanvasState, key: DrawnId) =>
  [...s.homes, ...s.nudges, ...s.treeShifts].filter(([id]) => id === key);

describe("S31 a collapse of an entity that is not drawn (rule (h)(5), QA F-1)", () => {
  const input: Input = {
    nodes: [
      { id: "X", type: "tx" },
      ...["Y", "Z", "a"].map((id) => ({ id, type: "ta" })),
    ],
    edges: [rel("X", "Y"), rel("Y", "Z"), rel("X", "a")],
  };
  const spots: [DrawnId, Point][] = [
    ["e:X", { x: 0, y: 0 }],
    ["e:Y", { x: 100, y: 0 }],
    ["e:Z", { x: -110, y: 0 }],
  ];
  const routes: [string, Action, (s: CanvasState) => Action][] = [
    [
      "type off",
      { kind: "toggleType", type: "tx", on: false },
      () => ({ kind: "toggleType", type: "tx", on: true }),
    ],
    [
      "hide",
      { kind: "hide", node: "e:X" },
      (s) => ({ kind: "restore", keys: [s.hidden[0].key] }),
    ],
  ];
  it.each(routes)(
    "%s: the records of e:X go, the next collapse is exact",
    (_, away, back) => {
      const run = rig(input, ["X", "Y", "Z"], spots, "off");
      const one = run.act(run.state, { kind: "explore", id: "X" });
      expect(records(one, "e:X").length).toBeGreaterThan(0);
      const off = run.act(one, away);
      expect(run.ids(off)).not.toContain("e:X");
      const shut = run.act(off, { kind: "collapse", id: "X" });
      expect(records(shut, "e:X")).toEqual([]);
      const again = run.act(shut, back(shut));
      expect(run.ids(again)).toContain("e:X");
      const two = run.act(again, { kind: "explore", id: "X" });
      const end = run.act(two, { kind: "collapse", id: "X" });
      expect(run.ids(end)).toEqual(run.ids(again));
      for (const id of run.ids(again))
        expect(at(end, id)).toEqual(at(again, id));
      expect(records(end, "e:X")).toEqual([]);
    },
  );
});

describe("S32 a leaf that goes into a group and out again (rule (h)(4), QA O-3)", () => {
  it("is in the group again after collapse Y and back at (−150, 0) after collapse A", () => {
    const input: Input = {
      nodes: [
        ...["A", "Y", "N"].map((id) => ({ id, type: "t" })),
        ...["L", "L2"].map((id) => ({ id, type: "tl" })),
      ],
      edges: [
        rel("A", "L", "p"),
        rel("A", "L2", "p"),
        rel("A", "Y"),
        rel("Y", "N"),
        rel("N", "L"),
      ],
    };
    const run = rig(
      input,
      ["A", "Y", "L"],
      [
        ["e:A", { x: 0, y: 0 }],
        ["e:Y", { x: 300, y: 0 }],
        ["e:L", { x: -150, y: 0 }],
      ],
      2,
    );
    const s1 = run.act(run.state, { kind: "explore", id: "A" });
    expect(run.ids(s1)).not.toContain("e:L");
    const s2 = run.act(s1, { kind: "explore", id: "Y" });
    expect(run.ids(s2)).toContain("e:L");
    const items = s2.nudges.flatMap(([key, , list]) =>
      key === "e:Y" ? list : [],
    );
    expect(items).toContainEqual(["e:L", -150, 0, -150, 0]);
    const s3 = run.act(s2, { kind: "collapse", id: "Y" });
    expect(run.ids(s3)).toEqual(run.ids(s1));
    expect(at(s3, "e:L")).toEqual({ x: -150, y: 0 });
    const s4 = run.act(s3, { kind: "collapse", id: "A" });
    expect(run.ids(s4)).toEqual(run.ids(run.state));
    expect(s4.positions).toEqual(run.state.positions);
  });
});
