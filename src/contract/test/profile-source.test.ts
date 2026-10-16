import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadProfile, profile } from "../src/index";
import qdic from "../src/profile/qdic.json";

const root = new URL("../../../", import.meta.url);
const specDir = new URL("docs/technical-spec/", root);
const prdFile = new URL(
  "docs/prd/PRD-001-qdic-data-visualization-mcp-app.md",
  root,
);

const rawText = readFileSync(
  new URL("../src/profile/qdic.json", import.meta.url),
  "utf8",
);

function specText(prefix: string) {
  const name = readdirSync(specDir).find((f) => f.startsWith(prefix));
  if (name === undefined) throw new Error(`spec file ${prefix} missing`);
  return readFileSync(new URL(name, specDir), "utf8");
}

function headings(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => /^#{1,6} /.test(line))
    .map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replaceAll("`", "")
        .trim(),
    );
}

const documents = {
  GV: headings(specText("Graph Vocabulary")),
  "SA-Intro": headings(specText("Semantic Annotation Introduction")),
};
const prdText = readFileSync(prdFile, "utf8");

type Draft = {
  nodeTypes: Record<string, Record<string, unknown>>;
  pairings: Record<string, unknown>[];
  slots: Record<string, unknown>[];
};

function clone() {
  return structuredClone(qdic) as unknown as Draft;
}

function failure(raw: unknown) {
  try {
    loadProfile(raw);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the loader accepted the profile");
}

function entries(p: typeof profile) {
  type Source = { doc: string; section: string; note?: string };
  const all: { path: string; source: Source | undefined }[] = [];
  const add = (path: string, entry: { source?: Source }) =>
    all.push({ path, source: entry.source });
  add("typeMenuCategories", p.typeMenuCategories);
  for (const [k, v] of Object.entries(p.nodeTypes)) add(`nodeTypes.${k}`, v);
  for (const [k, v] of Object.entries(p.predicates)) add(`predicates.${k}`, v);
  for (const [k, v] of Object.entries(p.inverses)) add(`inverses.${k}`, v);
  for (const [k, v] of Object.entries(p.globalIdPrefixes))
    add(`globalIdPrefixes.${k}`, v);
  for (const [set, list] of Object.entries(p.attributeSets)) {
    list.forEach((v, i) => add(`attributeSets.${set}.${i}`, v));
  }
  const lists = {
    pairings: p.pairings,
    writeRules: p.writeRules,
    notYetIncluded: p.notYetIncluded,
    slots: p.slots,
    shapeHeuristics: p.shapeHeuristics,
  };
  for (const [name, list] of Object.entries(lists))
    list.forEach((v, i) => add(`${name}.${i}`, v));
  return all;
}

function findDuplicateKey(text: string) {
  let i = 0;
  const skip = () => {
    while (/\s/.test(text[i] ?? "")) i++;
  };
  const string = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (path: string): string | null => {
    skip();
    if (text[i] === "{") {
      i++;
      const seen = new Set<string>();
      skip();
      while (text[i] !== "}") {
        skip();
        const key = string();
        if (seen.has(key)) return `${path}.${key}`;
        seen.add(key);
        skip();
        i++;
        const nested = value(`${path}.${key}`);
        if (nested !== null) return nested;
        skip();
        if (text[i] === ",") i++;
        skip();
      }
      i++;
      return null;
    }
    if (text[i] === "[") {
      i++;
      skip();
      let n = 0;
      while (text[i] !== "]") {
        const nested = value(`${path}.${n++}`);
        if (nested !== null) return nested;
        skip();
        if (text[i] === ",") i++;
        skip();
      }
      i++;
      return null;
    }
    if (text[i] === '"') {
      string();
      return null;
    }
    while (!/[\s,\]}]/.test(text[i] ?? ",")) i++;
    return null;
  };
  return value("$");
}

const prdAllowed = new Set([
  "shapeHeuristics.0",
  "shapeHeuristics.1",
  "shapeHeuristics.2",
  "shapeHeuristics.4",
  "shapeHeuristics.5",
  "globalIdPrefixes.schm-",
]);

function sourceErrors(p: typeof profile) {
  const errors: string[] = [];
  for (const { path, source } of entries(p)) {
    if (source === undefined || source.section.length === 0) {
      errors.push(`${path}: no source section`);
    } else if (source.doc === "PRD") {
      if (!prdAllowed.has(path))
        errors.push(`${path}: PRD citation outside the allow-list`);
      if (!prdText.includes(`**${source.section}**`))
        errors.push(`${path}: no FR id ${source.section} in the PRD`);
    } else if (
      !documents[source.doc as keyof typeof documents].includes(source.section)
    ) {
      errors.push(`${path}: no heading ${source.doc} "${source.section}"`);
    }
  }
  for (const path of prdAllowed) {
    const found = entries(p).find((e) => e.path === path);
    if (found?.source?.doc !== "PRD")
      errors.push(`${path}: allow-listed entry does not cite the PRD`);
  }
  return errors;
}

describe("QDIC profile sources", () => {
  it("S4 cites a heading, or an allow-listed PRD requirement, for every entry", () => {
    expect(entries(profile)).toHaveLength(158);
    expect(sourceErrors(profile)).toEqual([]);
  });

  it("S23 cites GV or SA-Intro for the 13 slots and subject/object", () => {
    const cited = [
      ...profile.slots.map((s) => [s.slot, s.source] as const),
      ["subject/object", profile.shapeHeuristics[3].source] as const,
    ];
    expect(cited).toHaveLength(14);
    expect(cited.filter(([, src]) => src.doc === "PRD")).toEqual([]);
    const derived = ["path", "data_source", "parent_owners", "subject/object"];
    for (const [name, src] of cited) {
      if (derived.includes(name))
        expect(src.note?.length, name).toBeGreaterThan(0);
    }
  });

  it("S28 fails a PRD citation outside the allow-list", () => {
    const copy = structuredClone(profile);
    const index = copy.slots.findIndex((s) => s.slot === "description");
    copy.slots[index].source = { doc: "PRD", section: "FR-INSPECT-4" };
    expect(sourceErrors(copy)).toEqual([
      `slots.${index}: PRD citation outside the allow-list`,
    ]);
  });

  it("S29 fails a missing heading and a missing FR id", () => {
    const copy = structuredClone(profile);
    copy.nodeTypes.table.source = { doc: "GV", section: "No such heading" };
    copy.shapeHeuristics[0].source = { doc: "PRD", section: "FR-NOPE-9" };
    expect(sourceErrors(copy)).toEqual([
      'nodeTypes.table: no heading GV "No such heading"',
      "shapeHeuristics.0: no FR id FR-NOPE-9 in the PRD",
    ]);
  });

  it("S9 rejects an entry without source and names its path", () => {
    const copy = clone();
    delete copy.nodeTypes.table.source;
    expect(failure(copy)).toContain("nodeTypes.table.source");
  });

  it("S10 detects a duplicate node type key in the file text", () => {
    expect(findDuplicateKey(rawText)).toBeNull();
    const doubled = rawText.replace(
      '"nodeTypes": {',
      '"nodeTypes": {\n "table": {},',
    );
    expect(findDuplicateKey(doubled)).toBe("$.nodeTypes.table");
  });

  it("S11 cites the sections a reader looks for", () => {
    expect(profile.predicates.permissionedTo?.source.section).toBe(
      "Predicates",
    );
    expect(
      profile.pairings.find((p) => p.predicate === "permissionedTo")?.source
        .section,
    ).toBe("System pairings");
    expect(profile.nodeTypes.classification?.source).toMatchObject({
      doc: "SA-Intro",
      section: "Reference",
    });
  });
});

const REFERENCE = ["SA-Intro", "Reference"];
const GV_PREDICATES = ["GV", "Predicates"];
const FR_DATA_10 = ["PRD", "FR-DATA-10"];

// why: STORY-002-09 T3 source-note table — doc and section of each entry on `dev` 163f676
const NEW_FIELDS: [string, string[], string[]][] = [
  [
    "slots.physical_name",
    ["labelFallback"],
    ["SA-Intro", "Browsing before you write anything"],
  ],
  [
    "slots.logical_name",
    ["strong", "assetOnlyKeys"],
    ["SA-Intro", "Scenario A: Classify CUSTOMER_EMAIL as PII"],
  ],
  ["slots.owners", ["strong", "itemName"], GV_PREDICATES],
  ["slots.tags", ["strong", "assetOnlyKeys", "itemName"], GV_PREDICATES],
  ["slots.path", ["strong"], GV_PREDICATES],
  ["slots.ddl_comment", ["strong"], ["GV", "Not yet included"]],
  ["slots.parent_owners", ["edge", "itemName"], GV_PREDICATES],
  ["slots.asset_groups", ["itemName"], GV_PREDICATES],
  ["attributeSets.asset.8", ["lost"], ["GV", "Attributes"]],
  ["predicates.contains", ["role", "layoutRole"], GV_PREDICATES],
  ["predicates.broader", ["layoutRole"], GV_PREDICATES],
  ["predicates.derivedFrom", ["layoutRole"], GV_PREDICATES],
  ["predicates.definedBy", ["layoutRole"], GV_PREDICATES],
  ["predicates.dependsOn", ["layoutRole"], GV_PREDICATES],
  ["predicates.mapsTo", ["layoutRole"], GV_PREDICATES],
  ["predicates.relatedTo", ["builtIn"], GV_PREDICATES],
  ["predicates.synonymOf", ["builtIn"], GV_PREDICATES],
  ["predicates.classifiedAs", ["builtIn"], REFERENCE],
  ["predicates.governedBy", ["builtIn"], REFERENCE],
  ["predicates.calculatedFrom", ["builtIn"], REFERENCE],
  ["predicates.sourcedFrom", ["builtIn"], REFERENCE],
  ["nodeTypes.classification", ["builtIn"], REFERENCE],
  ["nodeTypes.domain", ["builtIn"], REFERENCE],
  ["nodeTypes.policy", ["builtIn"], REFERENCE],
  ["nodeTypes.metric", ["builtIn"], REFERENCE],
  ["nodeTypes.external_system", ["builtIn"], REFERENCE],
  ["nodeTypes.model", ["builtIn"], REFERENCE],
  ["shapeHeuristics.0", ["predicate", "hintDefault"], FR_DATA_10],
  ["shapeHeuristics.1", ["predicate"], FR_DATA_10],
  ["shapeHeuristics.2", ["predicate"], FR_DATA_10],
  ["shapeHeuristics.3", ["predicate"], GV_PREDICATES],
  ["shapeHeuristics.4", ["predicate"], FR_DATA_10],
  ["shapeHeuristics.5", ["predicate", "labelKeys", "hintDefault"], FR_DATA_10],
];

type Entry = Record<string, unknown> & {
  source: { doc: string; section: string; note?: string };
};

function entryAt(path: string): Entry | undefined {
  const [list, name, index] = path.split(".");
  if (list === "slots") return profile.slots.find((s) => s.slot === name);
  if (list === "attributeSets")
    return profile.attributeSets[name]?.[Number(index)];
  if (list === "shapeHeuristics") return profile.shapeHeuristics[Number(name)];
  if (list === "predicates") return profile.predicates[name];
  return profile.nodeTypes[name];
}

describe("STORY-002-09 sources of the new fields", () => {
  it("S28 keeps each source and names each new field in its note", () => {
    expect(NEW_FIELDS).toHaveLength(33);
    for (const [path, fields, [doc, section]] of NEW_FIELDS) {
      const entry = entryAt(path);
      expect(entry?.source, path).toMatchObject({ doc, section });
      for (const field of fields) {
        expect(entry?.[field], `${path} ${field}`).toBeDefined();
        expect(entry?.source.note, `${path} ${field}`).toMatch(
          new RegExp(`\\b${field}\\b`),
        );
      }
    }
    expect(profile.slots.filter((s) => s.source.doc === "PRD")).toEqual([]);
    const withFr = entries(profile).filter(
      ({ path, source }) =>
        !prdAllowed.has(path) && (source?.note?.includes("FR-") ?? false),
    );
    expect(withFr).toEqual([]);
  });
});

describe("QDIC profile loader failures", () => {
  it("S21 rejects an unknown predicate in a pairing and in a slot edge", () => {
    const copy = clone();
    copy.pairings.push({
      predicate: "ownz",
      subject: "table",
      object: "user",
      owner: "System",
      status: null,
      source: { doc: "GV", section: "System pairings" },
    });
    copy.slots[0].edge = "hasOwner";
    const message = failure(copy);
    expect(message).toContain(`pairings.${copy.pairings.length - 1}.predicate`);
    expect(message).toContain("slots.0.edge");
  });

  it("S22 rejects an unknown node type in a pairing", () => {
    const copy = clone();
    copy.pairings[0].object = "tabel";
    expect(failure(copy)).toContain("pairings.0.object");
  });
});
