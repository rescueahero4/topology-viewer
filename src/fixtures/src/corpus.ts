import { notices, type NoticeCode } from "@qdic-topology/contract";

export interface Story {
  prompt: string;
  text: string;
}

export interface FirstPaint {
  approach: "active" | "passive";
  selected: string | null;
}

export interface Expect {
  schema: string;
  firstPaint: FirstPaint;
  notice: NoticeCode | null;
  warnings: Partial<Record<NoticeCode, number>>;
}

export interface DatasetFile {
  key: string;
  label: string;
  description: string;
  graph: Record<string, unknown>;
  story: Story | null;
}

interface FixtureBase {
  key: string;
  group: string;
  label: string;
  tests: string;
  story: Story | null;
  expect: Expect;
}

export type Fixture = FixtureBase &
  (
    | { graph: unknown; dataset?: undefined; view?: undefined }
    | { dataset: string; view?: unknown; graph?: undefined }
  );

export type LoadedFixture = Fixture & { input: unknown };

export interface CorpusFiles {
  datasets: readonly unknown[];
  scenarios: readonly unknown[];
  qdic: readonly unknown[];
}

export interface Corpus {
  fixtures: Record<string, Fixture>;
  datasets: Record<string, DatasetFile>;
  load: (key: string) => LoadedFixture;
}

type Raw = Record<string, unknown>;

const SCHEMA_VERDICTS: readonly string[] = [
  "pass",
  ...notices.codes.filter((code) => notices.severity[code] === "fatal"),
];

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

function isCode(value: string): value is NoticeCode {
  return notices.codes.some((code) => code === value);
}

function record(value: unknown, where: string): Raw {
  return isRecord(value) ? value : fail(where, "expected an object");
}

function text(raw: Raw, field: string, where: string): string {
  const value = raw[field];
  return typeof value === "string" && value !== ""
    ? value
    : fail(where, `"${field}" must be a non-empty string`);
}

function exactKeys(
  raw: Raw,
  required: readonly string[],
  optional: readonly string[],
  where: string,
): void {
  const missing = required.find((key) => !(key in raw));
  if (missing !== undefined) fail(where, `missing field "${missing}"`);
  const extra = Object.keys(raw).find(
    (key) => !required.includes(key) && !optional.includes(key),
  );
  if (extra !== undefined) fail(where, `unknown field "${extra}"`);
}

function story(value: unknown, where: string): Story | null {
  if (value === null) return null;
  const raw = record(value, `${where} story`);
  return {
    prompt: text(raw, "prompt", `${where} story`),
    text: text(raw, "text", `${where} story`),
  };
}

function codeOf(value: unknown, where: string): NoticeCode {
  if (typeof value === "string" && isCode(value)) return value;
  return fail(where, `unknown notice code ${JSON.stringify(value)}`);
}

function warnings(value: unknown, where: string): Expect["warnings"] {
  const raw = record(value, where);
  const entries = Object.entries(raw).map(([name, count]): [string, number] => {
    const code = codeOf(name, where);
    if (notices.severity[code] !== "warning")
      fail(where, `"${code}" is not a warning code`);
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1)
      fail(where, `count of "${code}" must be a positive integer`);
    return [code, count];
  });
  return Object.fromEntries(entries);
}

function expectBlock(value: unknown, key: string): Expect {
  const where = `fixture "${key}" expect`;
  const raw = record(value, where);
  exactKeys(raw, ["schema", "firstPaint", "notice", "warnings"], [], where);
  const schema = text(raw, "schema", where);
  if (!SCHEMA_VERDICTS.includes(schema))
    fail(where, `schema "${schema}" is neither "pass" nor a fatal code`);
  const paint = record(raw.firstPaint, `${where}.firstPaint`);
  exactKeys(paint, ["approach", "selected"], [], `${where}.firstPaint`);
  const { approach, selected } = paint;
  if (approach !== "active" && approach !== "passive")
    fail(where, `firstPaint.approach "${String(approach)}" is not allowed`);
  if (selected !== null && typeof selected !== "string")
    fail(where, "firstPaint.selected must be a string or null");
  if (approach === "passive" && selected !== null)
    fail(where, "a passive first paint selects nothing");
  return {
    schema,
    firstPaint: { approach, selected },
    notice: raw.notice === null ? null : codeOf(raw.notice, `${where}.notice`),
    warnings: warnings(raw.warnings, `${where}.warnings`),
  };
}

export function parseFixture(value: unknown): Fixture {
  const raw = record(value, "fixture");
  const key = text(raw, "key", "fixture");
  const where = `fixture "${key}"`;
  const hasGraph = "graph" in raw;
  const hasDataset = "dataset" in raw;
  if (hasGraph === hasDataset)
    fail(where, 'exactly one of "graph" or "dataset" is required');
  if ("view" in raw && !hasDataset) fail(where, '"view" needs "dataset"');
  exactKeys(
    raw,
    [
      "key",
      "group",
      "label",
      "tests",
      "story",
      "expect",
      hasGraph ? "graph" : "dataset",
    ],
    ["view"],
    where,
  );
  const base: FixtureBase = {
    key,
    group: text(raw, "group", where),
    label: text(raw, "label", where),
    tests: text(raw, "tests", where),
    story: story(raw.story, where),
    expect: expectBlock(raw.expect, key),
  };
  if (hasGraph) return { ...base, graph: raw.graph };
  const dataset = text(raw, "dataset", where);
  return "view" in raw
    ? { ...base, dataset, view: raw.view }
    : { ...base, dataset };
}

export function parseDataset(value: unknown): DatasetFile {
  const raw = record(value, "dataset");
  const key = text(raw, "key", "dataset");
  const where = `dataset "${key}"`;
  exactKeys(raw, ["key", "label", "description", "graph", "story"], [], where);
  return {
    key,
    label: text(raw, "label", where),
    description: text(raw, "description", where),
    graph: record(raw.graph, `${where} graph`),
    story: story(raw.story, where),
  };
}

function byKey<T extends { key: string }>(
  items: readonly T[],
  what: string,
): Record<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.key)) fail(what, `duplicate key "${item.key}"`);
    map.set(item.key, item);
  }
  return Object.fromEntries(map);
}

export function createCorpus(files: CorpusFiles): Corpus {
  const datasets = byKey(files.datasets.map(parseDataset), "datasets");
  const fixtures = byKey(
    [...files.qdic, ...files.scenarios].map(parseFixture),
    "fixtures",
  );
  for (const fixture of Object.values(fixtures)) {
    if (
      fixture.dataset !== undefined &&
      !Object.hasOwn(datasets, fixture.dataset)
    )
      fail(`fixture "${fixture.key}"`, `unknown dataset "${fixture.dataset}"`);
  }
  function load(key: string): LoadedFixture {
    if (!Object.hasOwn(fixtures, key))
      fail("loadFixture", `unknown key "${key}"`);
    const fixture = fixtures[key];
    const graph =
      fixture.dataset === undefined
        ? fixture.graph
        : {
            ...datasets[fixture.dataset].graph,
            ...(fixture.view === undefined ? {} : { view: fixture.view }),
          };
    return { ...fixture, input: structuredClone(graph) };
  }
  return { fixtures, datasets, load };
}
