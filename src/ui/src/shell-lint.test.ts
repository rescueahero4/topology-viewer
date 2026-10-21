import { readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "../../..");
const UI = "packages/ui/src";
const TIME_OUT = 180_000;

type Plant = { name: string; text: string; at: string; errors: number };
const plant = (name: string, text: string, at = `${UI}/x.tsx`, errors = 1) => ({
  name,
  text,
  at,
  errors,
});

// why: S16, LEARNINGS 34 — each ban of rule 12 in call form, bare name and alias
const CALLS: Record<string, string> = {
  eval: 'eval("1");',
  Function: "Function.call(undefined);",
  fetch: 'export const r = fetch("u");',
  XMLHttpRequest: "export const x = new XMLHttpRequest();",
  WebSocket: 'export const x = new WebSocket("u");',
  EventSource: 'export const x = new EventSource("u");',
  Worker: 'export const x = new Worker("u");',
  SharedWorker: 'export const x = new SharedWorker("u");',
  indexedDB: 'export const x = indexedDB.open("u");',
  caches: 'export const x = caches.open("u");',
  sessionStorage: 'sessionStorage.setItem("k", "v");',
  localStorage: 'localStorage.setItem("k", "v");',
  postMessage: 'postMessage("m", "*");',
  console: 'console.log("x");',
  location: 'location.assign("u");',
  open: 'open("u");',
  parent: "export const p = parent.length;",
  top: "export const t = top?.length;",
  opener: "export const o: unknown = opener;",
};
const globals = Object.entries(CALLS).flatMap(([name, call]) => [
  plant(`${name} call`, call),
  plant(`${name} bare name`, `export const v: unknown = ${name};`),
  plant(
    `${name} on window`,
    call.replace(new RegExp(`\\b${name}\\b`), `window.${name}`),
  ),
]);
const SCRIPTS =
  "declare global {\n  function importScripts(...urls: string[]): void;\n}\n";
const navigation = [
  plant("importScripts call", `${SCRIPTS}importScripts("u");`),
  plant(
    "importScripts bare name",
    `${SCRIPTS}export const v: unknown = importScripts;`,
  ),
  plant(
    "importScripts on globalThis",
    `${SCRIPTS}export const v: unknown = globalThis.importScripts;`,
  ),
  plant("self.location", "export const v: unknown = self.location;"),
  plant(
    "globalThis.location",
    "export const v: unknown = globalThis.location;",
  ),
  plant("document.location", "export const v: unknown = document.location;"),
  plant("window.top string member", 'export const v: unknown = window["top"];'),
  plant(
    "window.opener on globalThis",
    "export const v: unknown = globalThis.opener;",
  ),
];

const EL = (name: string) =>
  `declare const el: { ${name}: (a: string, b?: string) => unknown };\n`;
const PROP = (name: string) =>
  `declare const el: { ${name}: string };\ndeclare const s: string;\n`;
const props = ["innerHTML", "outerHTML"].flatMap((name) => [
  plant(`${name} assignment`, `${PROP(name)}el.${name} = s;`),
  plant(`${name} string member`, `${PROP(name)}el["${name}"] = s;`),
  plant(
    `${name} destructuring`,
    `declare const el: { ${name}: string };\nconst { ${name}: v } = el;\nexport { v };`,
  ),
]);
const members = [
  plant(
    "insertAdjacentHTML call",
    `${EL("insertAdjacentHTML")}el.insertAdjacentHTML("p", "s");`,
  ),
  plant(
    "insertAdjacentHTML bare member",
    `${EL("insertAdjacentHTML")}export const f = el.insertAdjacentHTML;`,
  ),
  plant(
    "insertAdjacentHTML string member",
    `${EL("insertAdjacentHTML")}el["insertAdjacentHTML"]("p", "s");`,
  ),
  plant("document.write call", 'document.write("x");'),
  plant(
    "document.write bare member",
    "declare const doc: { write: (s: string) => void };\nexport const f = doc.write;",
  ),
  plant("document.write string member", 'document["write"]("x");'),
  plant("sendBeacon call", 'navigator.sendBeacon("u", "d");'),
  plant(
    "sendBeacon bare member",
    "export const b = navigator.sendBeacon.bind(navigator);",
  ),
  plant("sendBeacon string member", 'navigator["sendBeacon"]("u", "d");'),
  plant("clipboard member", "export const c = navigator.clipboard;"),
  plant("clipboard string member", 'export const c = navigator["clipboard"];'),
  plant(
    "clipboard destructuring",
    "const { clipboard } = navigator;\nexport { clipboard };",
  ),
  plant("cookie member", "export const c = document.cookie;"),
  plant("cookie string member", 'export const c = document["cookie"];'),
  plant(
    "cookie destructuring",
    "const { cookie } = document;\nexport { cookie };",
  ),
  plant(
    "openai member",
    "declare const w: { openai: string };\nexport const o = w.openai;",
  ),
  plant(
    "openai string member",
    'declare const w: { openai: string };\nexport const o = w["openai"];',
  ),
  plant(
    "openai destructuring",
    "declare const w: { openai: string };\nconst { openai } = w;\nexport { openai };",
  ),
];

const J = "declare const x: string;\n";
const H = `import { h } from "preact";\n${J}`;
const html = [
  plant(
    "dangerouslySetInnerHTML attribute",
    `${J}export const a = <div dangerouslySetInnerHTML={{ __html: x }} />;`,
  ),
  plant(
    "dangerouslySetInnerHTML spread",
    `${J}export const a = <div {...{ dangerouslySetInnerHTML: { __html: x } }} />;`,
  ),
  plant(
    "dangerouslySetInnerHTML in h()",
    `${H}export const a = h("div", { dangerouslySetInnerHTML: { __html: x } });`,
  ),
];
const ATTRS: [string, string][] = [
  ["href", "a"],
  ["xlinkHref", "use"],
  ["src", "img"],
  ["srcSet", "img"],
  ["srcDoc", "iframe"],
  ["action", "form"],
  ["formAction", "button"],
  ["poster", "video"],
  ["ping", "a"],
];
const urls = [
  ...ATTRS.flatMap(([attr, tag]) => [
    plant(`<${tag} ${attr}>`, `${J}export const a = <${tag} ${attr}={x} />;`),
    plant(
      `<${tag}> ${attr} spread`,
      `${J}export const a = <${tag} {...{ ${attr}: x }} />;`,
    ),
    plant(
      `h("${tag}") ${attr}`,
      `${H}export const a = h("${tag}", { ${attr}: x });`,
    ),
  ]),
  plant("<use xlink:href>", `${J}export const a = <use xlink:href={x} />;`),
  plant(
    "<use> xlink:href spread",
    `${J}export const a = <use {...{ "xlink:href": x }} />;`,
  ),
  plant(
    'h("use") xlink:href',
    `${H}export const a = h("use", { "xlink:href": x });`,
  ),
  plant("<object data>", `${J}export const a = <object data={x} />;`),
  plant(
    "<object> data spread",
    `${J}export const a = <object {...{ data: x }} />;`,
  ),
  plant('h("object") data', `${H}export const a = h("object", { data: x });`),
  plant(
    "setAttribute href",
    'declare const el: Element;\nel.setAttribute("href", "u");',
  ),
];
const timers = ["setTimeout", "setInterval"].flatMap((name) => [
  plant(`${name} string`, `export const t = ${name}("x()", 1);`),
  plant(
    `${name} string on window`,
    `export const t = window.${name}("x()", 1);`,
  ),
  plant(
    `${name} string variable`,
    `const code: string = "x()";\nexport const t = ${name}(code, 1);`,
  ),
]);
const dynamic = [
  plant("import() literal", 'export const m = import("./names");'),
  plant(
    "import() variable",
    "declare const x: string;\nexport const m = import(x);",
  ),
  plant("import() template", 'export const m = import(`./${"names"}`);'),
];

const side = (spec: string) => `import "${spec}";\n`;
const imports = [
  ...["node:fs/promises", "fs", "path", "node:url"].map((s) =>
    plant(s, side(s)),
  ),
  plant("@qdic-topology/fixtures", side("@qdic-topology/fixtures")),
  plant(
    "@qdic-topology/contract value",
    'import { profile } from "@qdic-topology/contract";\nexport { profile };',
  ),
  plant("export * from fixtures", 'export * from "@qdic-topology/fixtures";'),
  plant("./testFrame", side("./testFrame")),
  plant("../testFrame", side("../testFrame"), `${UI}/strings/x.ts`),
  plant(
    "./shellAudit value",
    'import { shellAudit } from "./shellAudit";\nexport { shellAudit };',
  ),
  plant("./fixtureModel", side("./fixtureModel")),
  plant("./shell-harness", side("./shell-harness")),
  ...[
    "react",
    "react-dom/client",
    "react/jsx-runtime",
    "d3",
    "d3-selection",
  ].map((s) => plant(s, side(s))),
  plant(
    "renderer value",
    'import { createRenderer } from "@qdic-topology/renderer";\nexport { createRenderer };',
  ),
  plant(
    "renderer re-export",
    'export { iconMetrics } from "@qdic-topology/renderer";',
  ),
  plant(
    "renderer namespace",
    'import * as r from "@qdic-topology/renderer";\nexport { r };',
  ),
  plant(
    "renderer type",
    'import type { RendererText } from "@qdic-topology/renderer";\nexport type { RendererText };',
    `${UI}/x.ts`,
    0,
  ),
  plant("deep import", side("@qdic-topology/engine/src/view/frontier")),
];
const SIGNALS =
  'import { signal } from "@preact/signals-core";\nexport { signal };';
const packages = [
  plant("signals-core in ui", SIGNALS, `${UI}/x.ts`),
  plant(
    "signals-core re-export in ui",
    'export * from "@preact/signals-core";',
    `${UI}/x.ts`,
  ),
  plant("signals-core in renderer", SIGNALS, "packages/renderer/src/x.ts"),
  plant("signals-core in fixtures", SIGNALS, "packages/fixtures/src/x.ts"),
  plant("signals-core in contract", SIGNALS, "packages/contract/src/x.ts"),
  plant("signals-core in a ui test", SIGNALS, `${UI}/x.test.ts`),
  plant(
    "preact in src/canvas",
    'import { h } from "preact";\nexport { h };',
    `${UI}/canvas/x.ts`,
  ),
  plant(".tsx in src/canvas", "export const a = 1;", `${UI}/canvas/x.tsx`),
  plant(
    "contract in a test",
    'import { profile } from "@qdic-topology/contract";\nexport { profile };',
    `${UI}/x.test.ts`,
    0,
  ),
  plant(
    "testFrame in a test",
    'import { mountApp } from "./testFrame";\nexport { mountApp };',
    `${UI}/x.test.ts`,
    0,
  ),
  plant(
    "setTimeout with a function",
    "export const t = setTimeout(() => 1, 1);",
    `${UI}/x.ts`,
    0,
  ),
];

const PLANTS: Plant[] = [
  ...globals,
  ...navigation,
  ...props,
  ...members,
  ...html,
  ...urls,
  ...timers,
  ...dynamic,
  ...imports,
  ...packages,
];
const files = PLANTS.map((p, i) => {
  const dir = path.dirname(p.at);
  const name = path.basename(p.at).replace(/^x/, `zz-plant-shell-${i}`);
  return {
    ...p,
    file: path.join(REPO, dir, name),
    text: `${p.text}\nexport {};\n`,
  };
});

let eslint: ESLint;
let results: ESLint.LintResult[] = [];

beforeAll(async () => {
  for (const p of files) writeFileSync(p.file, p.text);
  eslint = new ESLint({
    cwd: REPO,
    overrideConfigFile: path.join(REPO, "scripts", "eslint.config.mjs"),
  });
  results = await eslint.lintFiles(files.map((p) => p.file));
}, TIME_OUT);

afterAll(() => {
  for (const p of files) rmSync(p.file, { force: true });
});

const errorsOf = (file: string) =>
  (results.find((r) => path.resolve(r.filePath) === file)?.messages ?? [])
    .filter((m) => m.severity === 2)
    .map((m) => `${m.ruleId}: ${m.message}`);

describe("S16 the shell lint bans", () => {
  it.each(files.map((p) => [p.name, p.errors, p.file] as const))(
    "%s gives %i error",
    (_name, count, file) => {
      const errors = errorsOf(file);
      expect(errors.length, errors.join(" | ")).toBe(count);
    },
  );

  it(
    "gives no error on the shell files",
    async () => {
      const shell = readdirSync(path.join(REPO, UI))
        .filter((name) => /\.tsx?$/.test(name) && !name.startsWith("zz-plant-"))
        .map((name) => path.join(REPO, UI, name));
      const clean = await eslint.lintFiles([
        ...shell,
        ...readdirSync(path.join(REPO, UI, "strings"))
          .filter((name) => !name.startsWith("zz-plant-"))
          .map((name) => path.join(REPO, UI, "strings", name)),
        path.join(REPO, "scripts", "eslint-shell.mjs"),
      ]);
      const errors = clean.flatMap((r) =>
        r.messages.map((m) => `${r.filePath}: ${m.ruleId}: ${m.message}`),
      );
      expect(errors).toEqual([]);
    },
    TIME_OUT,
  );
});
