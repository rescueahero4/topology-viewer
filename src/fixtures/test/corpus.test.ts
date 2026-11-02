import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { notices, type NoticeCode } from "#contract";
import { describe, expect, it } from "vitest";
import { createCorpus, datasets, fixtures, loadFixture } from "..";
import { datasetFiles, qdicFiles, scenarioFiles } from "../files";
import {
  constraintViolationCount,
  firstPaintOf,
  isRecord,
  nodesOf,
  skipCounts,
  unknownTypeCount,
  type Raw,
} from "./payload";

const DATA = path.join(import.meta.dirname, "../data");

// SA §6 Fixture row (30 scenarios, then the five new scenarios of STORY-005-02); `s-custom-*` is two
// keys and `s-designed*` is three
const SCENARIO_KEYS = [
  "s-access",
  "s-lineage",
  "s-root-only",
  "s-vague",
  "s-nohint",
  "s-badroot",
  "s-single",
  "s-islands",
  "s-star",
  "s-chain",
  "s-many-preds",
  "s-stress",
  "s-custom-passive",
  "s-custom-active",
  "s-mixed",
  "s-extend",
  "s-ladder",
  "s-designed",
  "s-designed-glyph",
  "s-mixed-designed",
  "s-unsafe-colors",
  "s-undeclared",
  "s-vocab-meta",
  "s-empty",
  "s-dirty",
  "s-invalid",
  "s-noid-some",
  "s-noid-all",
  "s-edges-only",
  "s-not-graph",
  "s-constraint-violation",
  "s-unsafe-glyph",
  "s-merge-namesakes",
  "s-fields-vs-edge",
  "s-cjk-labels",
];
const QDIC_KEYS = [
  "q-spec-scenarios",
  "q-full-vocabulary",
  "q-semantic-layer-steward",
];
const DATASET_KEYS = ["access", "catalog", "governance", "extend", "stress"];
const SKIP_CODES = ["no-id", "duplicate-id", "dangling-edge"] as const;

function names(folder: string): string[] {
  return readdirSync(path.join(DATA, folder))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort();
}

function scenario(key: string): Raw {
  const file = readFileSync(
    path.join(DATA, "scenarios", `${key}.json`),
    "utf8",
  );
  return JSON.parse(file) as Raw;
}

function corpusOf(...scenarios: unknown[]) {
  return createCorpus({ datasets: datasetFiles, scenarios, qdic: [] });
}

describe("S1 the corpus loads", () => {
  it("has the 35 scenario keys of SA §6, the three QDIC keys and 5 datasets", () => {
    expect(Object.keys(fixtures)).toHaveLength(38);
    expect(Object.keys(fixtures).sort()).toEqual(
      [...SCENARIO_KEYS, ...QDIC_KEYS].sort(),
    );
    expect(Object.keys(datasets).sort()).toEqual([...DATASET_KEYS].sort());
  });

  it("imports every file of the data folder", () => {
    expect(names("scenarios")).toEqual([...SCENARIO_KEYS].sort());
    expect(names("qdic")).toEqual([...QDIC_KEYS].sort());
    expect(names("datasets")).toEqual([...DATASET_KEYS].sort());
    expect(scenarioFiles).toHaveLength(SCENARIO_KEYS.length);
    expect(qdicFiles).toHaveLength(QDIC_KEYS.length);
    expect(datasetFiles).toHaveLength(DATASET_KEYS.length);
  });

  it("loads each key to a payload and rejects an unknown key", () => {
    for (const key of Object.keys(fixtures)) {
      const loaded = loadFixture(key);
      expect(loaded.key).toBe(key);
      expect(loaded.input).not.toBeUndefined();
    }
    expect(() => loadFixture("s-nope")).toThrow(/unknown key "s-nope"/);
  });

  it("returns a copy, so a test cannot change the corpus", () => {
    const first = loadFixture("s-single").input as { nodes: unknown[] };
    first.nodes.length = 0;
    expect(nodesOf(loadFixture("s-single").input)).toHaveLength(1);
  });
});

describe("S2 every fixture declares its expected outcome", () => {
  const fatal = notices.codes.filter(
    (code) => notices.severity[code] === "fatal",
  );

  it.each(Object.keys(fixtures))("%s", (key) => {
    const { expect: outcome } = fixtures[key];
    expect(["pass", ...fatal]).toContain(outcome.schema);
    expect(["active", "passive"]).toContain(outcome.firstPaint.approach);
    if (outcome.notice !== null)
      expect(notices.codes).toContain(outcome.notice);
    for (const [code, count] of Object.entries(outcome.warnings)) {
      expect(notices.severity[code as NoticeCode]).toBe("warning");
      expect(count).toBeGreaterThan(0);
    }
  });

  it("names the first-paint selection that the mockup rule gives", () => {
    for (const key of Object.keys(fixtures)) {
      const { input, expect: outcome } = loadFixture(key);
      const drawn = outcome.schema === "pass" && outcome.notice === null;
      expect(outcome.firstPaint, key).toEqual(
        drawn ? firstPaintOf(input) : { approach: "passive", selected: null },
      );
    }
  });

  it("declares the skipped-record counts that the mockup rules give", () => {
    for (const key of Object.keys(fixtures)) {
      const { input, expect: outcome } = loadFixture(key);
      if (outcome.schema !== "pass" || outcome.notice === "no-valid-nodes")
        continue;
      const counts = skipCounts(input);
      for (const code of SKIP_CODES) {
        expect(outcome.warnings[code] ?? 0, `${key} ${code}`).toBe(
          counts[code],
        );
      }
    }
  });
});

describe("S6 s-dirty", () => {
  const { input, expect: outcome } = loadFixture("s-dirty");
  const graph = input as { nodes: Raw[]; edges: Raw[] };

  it("has one repeated id, two edges to missing nodes, one numeric id (no id by the contract) and one self-loop", () => {
    expect(graph.nodes.filter((node) => node.id === "t1")).toHaveLength(2);
    expect(
      graph.nodes.filter((node) => typeof node.id === "number"),
    ).toHaveLength(1);
    const missing = graph.edges
      .flatMap((edge) => [edge.source, edge.target])
      .filter((end) => typeof end === "string" && end.startsWith("ghost_"));
    expect(missing).toEqual(["ghost_1", "ghost_2"]);
    expect(
      graph.edges.filter((edge) => edge.source === edge.target),
    ).toHaveLength(1);
  });

  it("declares the counts that the rules give and a passing schema", () => {
    expect(skipCounts(input)).toEqual({
      "no-id": 1,
      "duplicate-id": 1,
      "dangling-edge": 3,
    });
    expect(outcome.warnings).toEqual({
      "no-id": 1,
      "duplicate-id": 1,
      "dangling-edge": 3,
      "unknown-type": 1,
    });
    expect(outcome.schema).toBe("pass");
  });
});

function declared(code: NoticeCode, counter: (input: unknown) => number) {
  const counts: Record<string, number> = {};
  for (const key of Object.keys(fixtures)) {
    const { input, expect: outcome } = loadFixture(key);
    const count = outcome.warnings[code as keyof typeof outcome.warnings];
    if (count !== undefined) counts[key] = count;
    if (outcome.schema === "pass" && outcome.notice === null)
      expect(count ?? 0, `${key} ${code}`).toBe(counter(input));
  }
  return counts;
}

describe("STORY-002-09 T5 warning counts", () => {
  it("S39 declares unknown-type per node on exactly 7 fixtures", () => {
    expect(declared("unknown-type", unknownTypeCount)).toEqual({
      "s-undeclared": 11,
      "s-custom-active": 29,
      "s-custom-passive": 29,
      "s-mixed": 9,
      "s-many-preds": 3,
      "s-extend": 1,
      "s-dirty": 1,
    });
  });

  it("S48 declares constraint-violation per relationship on exactly 13 fixtures", () => {
    expect(declared("constraint-violation", constraintViolationCount)).toEqual({
      "s-access": 2,
      "s-badroot": 6,
      "s-lineage": 6,
      "s-vague": 6,
      "s-chain": 13,
      "s-extend": 1,
      "s-islands": 2,
      "s-many-preds": 6,
      "s-mixed": 6,
      "s-mixed-designed": 6,
      "s-undeclared": 6,
      "s-vocab-meta": 1,
      "s-constraint-violation": 2,
    });
  });

  it("S47 keeps the QDIC fixtures free of warnings", () => {
    for (const key of QDIC_KEYS) {
      const { input, expect: outcome } = loadFixture(key);
      expect(outcome.warnings, key).toEqual({});
      expect(constraintViolationCount(input), key).toBe(0);
    }
  });

  it("S41 names exactly 11 of the 23 SA §4.2 codes", () => {
    const issueCodes = notices.codes.filter(
      (code) =>
        notices.severity[code] === "warning" ||
        notices.severity[code] === "fatal",
    );
    expect(issueCodes).toHaveLength(23);
    const named = new Set(
      Object.values(fixtures).flatMap(({ expect: outcome }) => [
        ...Object.keys(outcome.warnings),
        outcome.notice,
        outcome.schema,
      ]),
    );
    expect(issueCodes.filter((code) => named.has(code)).sort()).toEqual(
      [
        "no-id",
        "duplicate-id",
        "dangling-edge",
        "root-not-found",
        "unknown-type",
        "constraint-violation",
        "glyph-rejected",
        "no-valid-nodes",
        "not-object",
        "nodes-not-array",
        "too-large",
      ].sort(),
    );
  });
});

describe("S7 records without an id", () => {
  it("s-noid-some skips 2 of 5 nodes", () => {
    const { input, expect: outcome } = loadFixture("s-noid-some");
    expect(nodesOf(input)).toHaveLength(5);
    expect(skipCounts(input)["no-id"]).toBe(2);
    expect(outcome.warnings["no-id"]).toBe(2);
    expect(outcome.schema).toBe("pass");
  });

  it("s-noid-all has no node with an id and gives notice no-valid-nodes", () => {
    const { input, expect: outcome } = loadFixture("s-noid-all");
    expect(nodesOf(input)).toHaveLength(2);
    expect(skipCounts(input)["no-id"]).toBe(2);
    expect(outcome.schema).toBe("pass");
    expect(outcome.notice).toBe("no-valid-nodes");
  });
});

describe("S13 an unknown code in expect", () => {
  const good = scenario("s-empty");
  const withExpect = (change: Raw) => ({
    ...good,
    expect: { ...(good.expect as Raw), ...change },
  });

  it("fails and names the notice code", () => {
    expect(() => corpusOf(withExpect({ notice: "no-such-code" }))).toThrow(
      /no-such-code/,
    );
  });

  it("fails and names a warning code that is not in the catalog", () => {
    expect(() => corpusOf(withExpect({ warnings: { "made-up": 1 } }))).toThrow(
      /made-up/,
    );
  });

  it("fails on a code that is not a warning code", () => {
    expect(() => corpusOf(withExpect({ warnings: { "no-data": 1 } }))).toThrow(
      /no-data/,
    );
  });

  it("fails on a schema verdict that is not pass or a fatal code", () => {
    expect(() => corpusOf(withExpect({ schema: "no-id" }))).toThrow(/no-id/);
  });
});

describe("S14 duplicate key", () => {
  it("rejects two fixture files with the same key", () => {
    const file = scenario("s-empty");
    expect(() => corpusOf(file, file)).toThrow(/duplicate key "s-empty"/);
  });

  it("rejects a key that a scenario and a QDIC file share", () => {
    const file = scenario("s-empty");
    expect(() =>
      createCorpus({ datasets: datasetFiles, scenarios: [file], qdic: [file] }),
    ).toThrow(/duplicate key "s-empty"/);
  });

  it("rejects two dataset files with the same key", () => {
    expect(() =>
      createCorpus({
        datasets: [datasetFiles[0], datasetFiles[0]],
        scenarios: [],
        qdic: [],
      }),
    ).toThrow(/duplicate key/);
  });
});

describe("S17 the field set of a scenario file", () => {
  it.each(SCENARIO_KEYS)("%s", (key) => {
    const file = scenario(key);
    const fields = Object.keys(file);
    const source = fields.includes("graph") ? "graph" : "dataset";
    expect(
      fields.filter((field) => field !== "view" && field !== source).sort(),
    ).toEqual(["expect", "group", "key", "label", "story", "tests"]);
    expect(fields.includes("graph") !== fields.includes("dataset")).toBe(true);
    if (fields.includes("view")) expect(source).toBe("dataset");
    expect(file.key).toBe(key);
    if (typeof file.dataset === "string")
      expect(DATASET_KEYS).toContain(file.dataset);
    if (file.story !== null) {
      expect(isRecord(file.story) && Object.keys(file.story).sort()).toEqual([
        "prompt",
        "text",
      ]);
    }
  });
});

describe("S18 an unknown dataset reference", () => {
  it("rejects the reference and names the key", () => {
    const file = { ...scenario("s-access"), dataset: "nope" };
    expect(() => corpusOf(file)).toThrow(
      /fixture "s-access".*unknown dataset "nope"/,
    );
  });

  it("rejects a scenario with both graph and dataset", () => {
    const file = { ...scenario("s-access"), graph: { nodes: [] } };
    expect(() => corpusOf(file)).toThrow(/exactly one of/);
  });

  it("rejects a view without a dataset", () => {
    const file = { ...scenario("s-empty"), view: {} };
    expect(() => corpusOf(file)).toThrow(/"view" needs "dataset"/);
  });
});
