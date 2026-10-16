import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { afterAll, describe, expect, it } from "vitest";
import { NODE_DESIGN_GUIDE, guidance, notices } from "../src/index";

const SECTION_IDS = [
  "when-to-render",
  "shape-data",
  "quollio-passthrough",
  "how-much",
  "first-view",
  "approach",
  "node-design",
  "inferences-and-fields",
  "notice-vocabulary",
  "reply",
];

const ID_COMMENT = /<!-- id: ([a-z-]+) -->/g;
const FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]*`/g;
const HEADING = /^## (\d+)\./gm;
const LITERAL = /^export const (\w+) =\n {2}("(?:[^"\\\n]|\\.)*");$/gm;

const guidanceFolder = new URL("../src/guidance/", import.meta.url);
const scriptPath = fileURLToPath(
  new URL("../../../scripts/build-guidance.mjs", import.meta.url),
);
const tscPath = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const BACKSLASH = String.fromCharCode(92);
const ESCAPED_QUOTE = `${BACKSLASH}u0022`;

const SOURCE_FILES = [
  "guidance.en.md",
  "guidance.ja.md",
  "NODE_DESIGN_GUIDE.en.md",
  "NODE_DESIGN_GUIDE.ja.md",
];

const scratch = mkdtempSync(path.join(tmpdir(), "guidance-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function ids(text: string): string[] {
  return [...text.matchAll(ID_COMMENT)].map((match) => match[1]);
}

function section(text: string, id: string): string {
  const start = text.indexOf(`<!-- id: ${id} -->`);
  if (start < 0) return "";
  const next = text.indexOf("<!-- id:", start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

function idProblems(en: string, ja: string): string[] {
  const enIds = ids(en);
  const jaIds = ids(ja);
  return [
    ...enIds
      .filter((id) => !jaIds.includes(id))
      .map((id) => `${id} is missing in ja`),
    ...jaIds
      .filter((id) => !enIds.includes(id))
      .map((id) => `${id} is missing in en`),
    ...(enIds.join() === jaIds.join() || enIds.length !== jaIds.length
      ? []
      : ["the order of the ids differs"]),
  ];
}

function codeProblems(text: string, language: "en" | "ja"): string[] {
  const vocabulary = section(text, "notice-vocabulary");
  return notices.codes.flatMap((code) => [
    ...(vocabulary.includes(`\`${code}\``) ? [] : [code]),
    ...(vocabulary.includes(notices[language][code].ai)
      ? []
      : [`${code} text`]),
  ]);
}

function prose(text: string): string {
  return text.replace(FENCE, "").replace(INLINE_CODE, "");
}

function fences(text: string): string {
  return (text.match(FENCE) ?? []).join("\n");
}

function build(folder: string, output: string) {
  return spawnSync(process.execPath, [scriptPath, folder, output], {
    encoding: "utf8",
  });
}

function compile(file: string) {
  return spawnSync(
    process.execPath,
    [tscPath, "--noEmit", "--ignoreConfig", file],
    { encoding: "utf8" },
  );
}

function literals(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(LITERAL)].map((match) => [
      match[1],
      JSON.parse(match[2]) as string,
    ]),
  );
}

describe("S1, S12 section ids", () => {
  it("S1 the two files have the same ids in the same order", () => {
    expect(idProblems(guidance.en, guidance.ja)).toEqual([]);
    expect(ids(guidance.ja)).toEqual(ids(guidance.en));
  });

  it("S12 the English ids are the ten topics in order", () => {
    expect(ids(guidance.en)).toEqual(SECTION_IDS);
  });

  it("S7 a Japanese copy without one section fails and names the id", () => {
    const start = guidance.ja.indexOf("<!-- id: approach -->");
    const end = guidance.ja.indexOf("<!-- id: node-design -->");
    const broken = guidance.ja.slice(0, start) + guidance.ja.slice(end);
    expect(idProblems(guidance.en, broken)).toEqual([
      "approach is missing in ja",
    ]);
  });
});

describe("S2, S8 notice vocabulary", () => {
  it("S2 every code and its text is in the notice-vocabulary section", () => {
    expect(codeProblems(guidance.en, "en")).toEqual([]);
    expect(codeProblems(guidance.ja, "ja")).toEqual([]);
  });

  it("S8 an English copy with a typo in one code fails and names the code", () => {
    const broken = guidance.en.replace("`no-id`", "`no-ids`");
    expect(codeProblems(broken, "en")).toEqual(["no-id"]);
  });
});

describe("S3 keys that the contract does not have", () => {
  it.each([
    ["en", guidance.en],
    ["ja", guidance.ja],
  ])("the %s file never names title, hiddenTypes or show", (_, text) => {
    expect(prose(text)).not.toMatch(/\b(title|hiddenTypes|show)\b/);
    expect(fences(text)).not.toMatch(/"(title|hiddenTypes|show)"\s*:/);
  });
});

describe("S4 content of the English file", () => {
  it.each([
    "get_neighborhood",
    "get_related_nodes",
    "get_nodes",
    "get_node_types",
    "get_predicates",
    "vocabulary",
    "2,000",
    "4,000",
    "256 KB",
    "view.approach",
    "view.root",
    "view.reveal",
    "view.layout",
    "view.budget",
    "shape",
    "_inferred",
    "fields",
  ])("names %s", (term) => {
    expect(guidance.en).toContain(term);
  });

  it("the approach section states the FR-CANVAS-13 rule", () => {
    const approach = section(guidance.en, "approach");
    expect(approach).toMatch(/root, send `active`/);
    expect(approach).toMatch(/no hint[^\n]*send `passive`/);
    expect(approach).toMatch(
      /not in `nodes`[^\n]*`active` on the most connected node/,
    );
  });
});

describe("S5, S6, S13 node design guide", () => {
  it("S5 the English guide equals the constant of the v56 mockup", () => {
    const context = {
      window: {} as { QTopo?: { NODE_DESIGN_GUIDE?: string } },
    };
    runInNewContext(
      readFileSync(
        new URL(
          "../../../.design-recall/mockups/lib/topology.js",
          import.meta.url,
        ),
        "utf8",
      ),
      context,
    );
    expect(guidance.nodeDesignGuide.en).toBe(
      context.window.QTopo?.NODE_DESIGN_GUIDE,
    );
    expect(guidance.nodeDesignGuide.en).toContain("caps saturation at 55%");
    expect(guidance.nodeDesignGuide.en).toContain("below 3:1 contrast");
  });

  it("S6 the Japanese guide has the four numbered sections", () => {
    const numbers = (text: string) =>
      [...text.matchAll(HEADING)].map((match) => match[1]);
    expect(numbers(guidance.nodeDesignGuide.en)).toEqual(["1", "2", "3", "4"]);
    expect(numbers(guidance.nodeDesignGuide.ja)).toEqual(["1", "2", "3", "4"]);
  });

  it("S13 the constant is the English guide", () => {
    expect(NODE_DESIGN_GUIDE).toBe(guidance.nodeDesignGuide.en);
  });
});

describe("S11 size of the tool description", () => {
  it("records the bytes of en and ja", () => {
    const bytes = new TextEncoder().encode(
      `${guidance.en}\n\n${guidance.ja}`,
    ).length;
    console.log(`guidance en + ja: ${bytes} bytes`);
    expect(bytes).toBeLessThan(32768);
  });
});

describe("S14, S15 generated module", () => {
  it("S14 the script output equals the committed generated.ts", () => {
    const output = path.join(scratch, "generated.ts");
    const result = build(fileURLToPath(guidanceFolder), output);
    expect(result.status).toBe(0);
    const committed = readFileSync(
      new URL("generated.ts", guidanceFolder),
      "utf8",
    );
    expect(readFileSync(output, "utf8")).toBe(committed);

    const values = literals(committed);
    const file = (name: string) =>
      readFileSync(new URL(name, guidanceFolder), "utf8");
    expect(values).toEqual({
      guidanceEn: file("guidance.en.md"),
      guidanceJa: file("guidance.ja.md"),
      nodeDesignGuideEn: file("NODE_DESIGN_GUIDE.en.md"),
      nodeDesignGuideJa: file("NODE_DESIGN_GUIDE.ja.md"),
    });
    expect(guidance.en).toBe(values.guidanceEn);
    expect(guidance.ja).toBe(values.guidanceJa);
  });

  it("S15 script-like text stays one string literal and compiles", () => {
    const folder = path.join(scratch, "s15");
    mkdirSync(folder);
    for (const name of SOURCE_FILES) {
      copyFileSync(new URL(name, guidanceFolder), path.join(folder, name));
    }
    const attack = "</script><script>alert(1)</script> and a back-tick ` here";
    const english = path.join(folder, "guidance.en.md");
    writeFileSync(english, `${readFileSync(english, "utf8")}${attack}\n`);

    const output = path.join(folder, "generated.ts");
    expect(build(folder, output).status).toBe(0);
    const source = readFileSync(output, "utf8");
    expect(literals(source).guidanceEn).toContain(attack);
    expect(source.match(LITERAL)).toHaveLength(4);

    const good = compile(output);
    expect(good.stdout).toBe("");
    expect(good.status).toBe(0);

    const broken = path.join(folder, "broken.ts");
    writeFileSync(broken, source.replace(ESCAPED_QUOTE, '"'));
    const bad = compile(broken);
    expect(bad.status).not.toBe(0);
    expect(bad.stdout).toContain("TS1005");
  }, 30_000);
});
