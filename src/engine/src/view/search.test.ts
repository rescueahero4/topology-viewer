import { loadFixture } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import { matchEntities, normalize, type Graph } from "../index";

function graphOf(input: unknown): Graph {
  const result = normalize(input, { now: "2026-10-20" });
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result.graph;
}

const inOrder = (graph: Graph, ids: string[]) => {
  const at = new Map(graph.entities.map((e, k) => [e.id, k]));
  const order = ids.map((id) => at.get(id) ?? -1);
  return order.every((k, i) => k >= 0 && (i === 0 || order[i - 1] < k));
};

describe("S7 s-access text matches", () => {
  const graph = graphOf(loadFixture("s-access").input);
  const cases: [string, string[]][] = [
    [
      "revenue",
      [
        "t_FCT_REVENUE",
        "c_FCT_REVENUE.REVENUE_ID",
        "c_FCT_REVENUE.REVENUE_DATE",
        "c_SF_ACCOUNT.ANNUAL_REVENUE",
        "tag_Revenue",
      ],
    ],
    ["FCT", ["t_FCT_REVENUE", "t_FCT_PIPELINE", "t_FCT_SPEND", "t_FCT_CHURN"]],
    ["hana", ["u_7"]],
    ["t_FCT_REVENUE", ["t_FCT_REVENUE"]],
    ["u_0", ["u_0"]],
    ["u_20", ["u_0"]],
    ["u_2", ["u_2"]],
    ["exec", ["ag_exec", "ug_exec"]],
  ];

  it.each(cases)("%s gives the Context hits in entity order", (query, ids) => {
    const hits = matchEntities(graph, query);
    expect([...hits].sort()).toEqual([...ids].sort());
    expect(inOrder(graph, hits)).toBe(true);
  });

  it("trims the query; an empty or blank query gives no hit", () => {
    expect(matchEntities(graph, "  Revenue  ")).toEqual(
      matchEntities(graph, "revenue"),
    );
    expect(matchEntities(graph, "")).toEqual([]);
    expect(matchEntities(graph, "   ")).toEqual([]);
  });
});

describe("S8 NFC, full width, a long label and a prototype name", () => {
  const nfc = "Café";
  const nfd = "Café";
  const long = "x".repeat(10_000);
  const graph = graphOf({
    nodes: [
      { id: "c1", type: "t", label: nfc, attrs: { k: 1 } },
      { id: "c2", type: "t", label: nfd, attrs: { k: 2 } },
      { id: "w", type: "t", label: "ＡＢＣ" },
      { id: "l", type: "t", label: long },
      { id: "__proto__", type: "t", label: "proto" },
    ],
    edges: [],
  });

  it("finds both Café entities with the NFC and the NFD query", () => {
    expect(graph.entities.map((e) => e.id)).toEqual([
      "c1",
      "c2",
      "w",
      "l",
      "__proto__",
    ]);
    expect(matchEntities(graph, nfc.toLowerCase())).toEqual(["c1", "c2"]);
    expect(matchEntities(graph, nfd.toLowerCase())).toEqual(["c1", "c2"]);
  });

  it("does not fold full width; finds the long label; finds __proto__ by its record id only", () => {
    expect(matchEntities(graph, "abc")).toEqual([]);
    expect(matchEntities(graph, "x")).toEqual(["l"]);
    expect(matchEntities(graph, "__proto__")).toEqual(["__proto__"]);
  });
});
