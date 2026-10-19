import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { iconMetrics, spriteColours } from "./sprite";

const REPO = path.resolve(import.meta.dirname, "../../..");
const RAW = path.join(REPO, "assets", "figma-raw");
const SCRIPT = path.join(REPO, "scripts", "build-icons.mjs");
const SPRITE = path.join(REPO, "packages", "renderer", "src", "sprite.json");
const METRICS = path.join(
  REPO,
  "packages",
  "engine",
  "src",
  "layout",
  "icon-metrics.test.json",
);

// The `color` and `tier` of each icon in the v56 mockup `lib/node-icons.js` (read 2026-10-20).
const MOCKUP: Record<string, [string, string]> = {
  asset_group: ["#BD2C77", "group"],
  bigroup: ["#9020AF", "group"],
  column: ["#E4AF00", "leaf"],
  dashboard: ["#B06B1D", "asset"],
  data_source: ["#750F63", "source"],
  database: ["#8141B3", "container"],
  etl: ["#998611", "asset"],
  property: ["#24C8C3", "leaf"],
  property_set: ["#098A86", "group"],
  report: ["#E47D00", "leaf"],
  schema: ["#5B7519", "asset"],
  schema_lg: ["#3D38C8", "container"],
  table: ["#954118", "asset"],
  tag: ["#88A229", "leaf"],
  tag_group: ["#4D6105", "group"],
  user: ["#34A4FF", "leaf"],
  user_group: ["#1684EB", "group"],
  view: ["#BC43D4", "asset"],
};
const NAMES = Object.keys(MOCKUP);

type Element = [string, Record<string, string>, Element[]];
type Icon = {
  w: number;
  h: number;
  tier: string;
  color: string;
  fill: string;
  body: Element[];
};

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function tree(withSprite: boolean): string {
  const root = mkdtempSync(path.join(tmpdir(), "qt-icons-"));
  scratch.push(root);
  const raw = path.join(root, "assets", "figma-raw");
  mkdirSync(raw, { recursive: true });
  for (const name of NAMES)
    copyFileSync(path.join(RAW, `${name}.svg`), path.join(raw, `${name}.svg`));
  const src = path.join(root, "packages", "renderer", "src");
  mkdirSync(src, { recursive: true });
  if (withSprite) copyFileSync(SPRITE, path.join(src, "sprite.json"));
  return root;
}

function run(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

function colours(elements: Element[]): string[] {
  return elements.flatMap(([, attrs, children]) => [
    ...["fill", "stroke"].flatMap((k) => (k in attrs ? [attrs[k]] : [])),
    ...colours(children),
  ]);
}

describe("S1 icon copies", () => {
  it("each of the 18 copies has the committed SHA-256", () => {
    const sums = readFileSync(path.join(RAW, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n")
      .map((line) => /^([0-9a-f]{64}) {2}([a-z_]+\.svg)$/.exec(line));
    expect(sums.every((m) => m !== null)).toBe(true);
    const listed = sums.map((m) => (m as RegExpExecArray)[2]);
    const files = readdirSync(RAW).filter((name) => name.endsWith(".svg"));
    expect(listed.sort()).toEqual(files.sort());
    expect(listed).toHaveLength(18);
    for (const m of sums) {
      const [, sum, file] = m as RegExpExecArray;
      const bytes = readFileSync(path.join(RAW, file));
      expect(createHash("sha256").update(bytes).digest("hex"), file).toBe(sum);
    }
  });
});

describe("S2 sprite build", () => {
  const root = tree(false);
  const result = run("--root", root);
  const built = readFileSync(
    path.join(root, "packages", "renderer", "src", "sprite.json"),
    "utf8",
  );
  const sprite = JSON.parse(built) as Record<string, Icon>;

  it("builds 18 icons, one line each, keys in code-point order", () => {
    expect(result.status).toBe(0);
    expect(Object.keys(sprite)).toEqual([...NAMES].sort());
    expect(built.split("\n")).toHaveLength(19);
    expect(built).toBe(readFileSync(SPRITE, "utf8"));
  });

  it("gives the metrics of icon-metrics.test.json", () => {
    const metrics: unknown = JSON.parse(readFileSync(METRICS, "utf8"));
    expect(iconMetrics).toEqual(metrics);
  });

  it("gives the mockup colour (lower case), tier and the root fill none", () => {
    for (const name of NAMES) {
      const [color, tier] = MOCKUP[name];
      expect(sprite[name].color, name).toBe(color.toLowerCase());
      expect(spriteColours.get(name), name).toBe(color.toLowerCase());
      expect(sprite[name].tier, name).toBe(tier);
      expect(sprite[name].fill, name).toBe("none");
    }
    expect(sprite.user.color).toBe("#34a4ff");
  });

  it("writes every body colour as #rrggbb or none", () => {
    const all = NAMES.flatMap((name) => colours(sprite[name].body));
    expect(all.length).toBeGreaterThan(36);
    for (const value of all) expect(value).toMatch(/^(#[0-9a-f]{6}|none)$/);
    expect(colours(sprite.user.body)).toContain("#34a4ff");
    expect(colours(sprite.table.body)).toContain("#ffffff");
  });
});

describe("S3 --check", () => {
  it("exits 0 on the repository and 1 on a changed copy; the committed file stays", () => {
    const before = statSync(SPRITE).mtimeMs;
    const bytes = readFileSync(SPRITE);
    expect(run("--check").status).toBe(0);
    const root = tree(true);
    const copy = path.join(root, "packages", "renderer", "src", "sprite.json");
    const changed = Buffer.from(readFileSync(copy));
    changed[2] = changed[2] === 0x61 ? 0x62 : 0x61;
    writeFileSync(copy, changed);
    const result = run("--check", "--root", root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("differs from the build");
    expect(readFileSync(copy).equals(changed)).toBe(true);
    expect(statSync(SPRITE).mtimeMs).toBe(before);
    expect(readFileSync(SPRITE).equals(bytes)).toBe(true);
  });
});

const TABLE = readFileSync(path.join(RAW, "table.svg"), "utf8");
const OPEN = TABLE.indexOf(">") + 1;
const inside = (piece: string) =>
  TABLE.slice(0, OPEN) + piece + TABLE.slice(OPEN);
const HOSTILE: [string, string, string][] = [
  ["<script>", inside("<script>x</script>"), "script"],
  ["onload", TABLE.replace("<svg ", '<svg onload="x" '), "onload"],
  ["style", TABLE.replace("<rect ", '<rect style="fill:red" '), "style"],
  ["foreignObject", inside("<foreignObject></foreignObject>"), "foreignObject"],
  ["<!ENTITY>", `<!ENTITY x "y">\n${TABLE}`, "<!ENTITY"],
  [
    "xlink:href",
    TABLE.replace("<rect ", '<rect xlink:href="#a" '),
    "xlink:href",
  ],
  ["url(", TABLE.replace('fill="#954118"', 'fill="url(http://x)"'), "fill"],
  ["&#106;", TABLE.replace('rx="1"', 'rx="1&#106;"'), "rx"],
  ["comment", inside("<!-- x -->"), "<!--"],
  ['fill="red"', TABLE.replace('fill="#954118"', 'fill="red"'), "fill"],
  ["skewX", inside('<path transform="skewX(9)" d="M0 0"/>'), "transform"],
];

describe("S4 allow-list", () => {
  it.each(HOSTILE)("%s stops the build", (_case, text, name) => {
    expect(text).not.toBe(TABLE);
    const root = tree(false);
    writeFileSync(path.join(root, "assets", "figma-raw", "table.svg"), text);
    const result = run("--root", root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("table.svg");
    expect(result.stderr).toContain(name);
    const out = path.join(root, "packages", "renderer", "src", "sprite.json");
    expect(existsSync(out)).toBe(false);
  });
});
