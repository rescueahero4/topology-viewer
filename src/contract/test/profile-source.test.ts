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
  const all: {
    path: string;
    source: { doc: string; section: string } | undefined;
  }[] = [];
  const add = (
    path: string,
    entry: { source?: { doc: string; section: string } },
  ) => all.push({ path, source: entry.source });
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

describe("QDIC profile sources", () => {
  it("S4 cites a heading of the cited document for every entry", () => {
    const all = entries(profile);
    expect(all).toHaveLength(157);
    for (const { path, source } of all) {
      if (source === undefined) throw new Error(`${path} has no source`);
      expect(source.section.length, path).toBeGreaterThan(0);
      if (source.doc === "PRD") {
        expect(prdText, path).toContain(`**${source.section}**`);
      } else {
        const list = documents[source.doc as keyof typeof documents];
        expect(
          list,
          `${path} cites ${source.doc} §${source.section}`,
        ).toContain(source.section);
      }
    }
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
    expect(profile.nodeTypes.classification?.source).toEqual({
      doc: "SA-Intro",
      section: "Reference",
    });
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
