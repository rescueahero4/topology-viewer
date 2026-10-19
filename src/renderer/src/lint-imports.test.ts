import { readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "../../..");
const RENDERER = "packages/renderer/src";
const CANVAS = "packages/ui/src/canvas";
const TIME_OUT = 60_000;

type Plant = { folder: string; name: string; text: string; errors: 0 | 1 };

const side = (spec: string) => `import "${spec}";\n`;
const one = (folder: string, name: string, text: string): Plant => ({
  folder,
  name,
  text,
  errors: 1,
});

const rendererPlants: Plant[] = [
  ...[
    "@qdic-topology/ui",
    "@qdic-topology/contract",
    "@qdic-topology/fixtures",
    "d3",
    "d3-transition",
    "d3-force",
    "jsdom",
    "node:fs",
    "../../../apps/widget/src/main",
    "@qdic-topology/engine/src/view/frontier",
  ].map((spec) => one(RENDERER, spec, side(spec))),
  one(
    RENDERER,
    "value import of the engine",
    'import { frontier } from "@qdic-topology/engine";\nexport { frontier };\n',
  ),
  one(
    RENDERER,
    "value re-export of the engine",
    'export { frontier } from "@qdic-topology/engine";\n',
  ),
  one(
    RENDERER,
    "export * of the engine",
    'export * from "@qdic-topology/engine";\n',
  ),
  one(RENDERER, "dynamic import", 'export const m = import("./scene");\n'),
  one(RENDERER, "require", 'require("./scene");\nexport {};\n'),
  {
    folder: RENDERER,
    name: "import type",
    text: 'import type { Frontier } from "@qdic-topology/engine";\nexport type { Frontier };\n',
    errors: 0,
  },
  {
    folder: RENDERER,
    name: "inline type import",
    text: 'import { type Frontier } from "@qdic-topology/engine";\nexport type { Frontier };\n',
    errors: 0,
  },
];

const canvasPlants: Plant[] = [
  ...[
    "preact",
    "@preact/signals",
    "d3",
    "d3-selection",
    "jsdom",
    "node:fs",
    "../../../../apps/widget/src/main",
    "@qdic-topology/engine/src/view/frontier",
    "@qdic-topology/fixtures",
    "@qdic-topology/contract",
  ].map((spec) => one(CANVAS, spec, side(spec))),
];

const scriptPlants: Plant[] = [
  ...["node:http", "node:child_process", "vite"].map((spec) =>
    one("scripts", spec, side(spec)),
  ),
  one(
    "scripts",
    "fetch",
    'export const r = fetch("https://example.invalid");\n',
  ),
];

const files = [...rendererPlants, ...canvasPlants, ...scriptPlants].map(
  (plant, i) => ({
    ...plant,
    file:
      plant.folder === "scripts"
        ? path.join(REPO, "scripts", `build-icons-plant-${i}.mjs`)
        : path.join(REPO, plant.folder, `zz-plant-import-${i}.ts`),
  }),
);

// why: build-time item (c) — the clean tree leaves out the plants of both lint test files
const clean = [
  ...[RENDERER, CANVAS].flatMap((folder) =>
    readdirSync(path.join(REPO, folder))
      .filter((name) => name.endsWith(".ts") && !name.startsWith("zz-plant-"))
      .map((name) => path.join(REPO, folder, name)),
  ),
  path.join(REPO, "scripts", "build-icons.mjs"),
  path.join(REPO, "scripts", "eslint.config.mjs"),
];

let eslint: ESLint;
let results: ESLint.LintResult[] = [];

beforeAll(async () => {
  for (const plant of files) writeFileSync(plant.file, plant.text);
  eslint = new ESLint({
    cwd: REPO,
    overrideConfigFile: path.join(REPO, "scripts", "eslint.config.mjs"),
  });
  results = await eslint.lintFiles(files.map((plant) => plant.file));
}, TIME_OUT);

afterAll(() => {
  for (const plant of files) rmSync(plant.file, { force: true });
});

const errorsOf = (file: string) =>
  (results.find((r) => path.resolve(r.filePath) === file)?.messages ?? [])
    .filter((m) => m.severity === 2)
    .map((m) => `${m.ruleId}: ${m.message}`);

describe("S15 import bans", () => {
  it.each(files.map((p) => [p.folder, p.name, p.errors, p.file] as const))(
    "%s: %s gives %i error",
    (_folder, _name, count, file) => {
      expect(errorsOf(file)).toHaveLength(count);
    },
  );

  it(
    "gives no error on the clean tree",
    async () => {
      const cleanResults = await eslint.lintFiles(clean);
      const errors = cleanResults.flatMap((r) =>
        r.messages.map((m) => `${r.filePath}: ${m.ruleId}: ${m.message}`),
      );
      expect(errors).toEqual([]);
      expect(cleanResults.length).toBeGreaterThanOrEqual(20);
    },
    TIME_OUT,
  );
});
