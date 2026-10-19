import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "../../..");
const FOLDERS = ["packages/renderer/src", "packages/ui/src/canvas"];
const BAN_RULES = ["no-restricted-syntax", "no-restricted-globals"];
const TIME_OUT = 60_000;

// One planted file per form: [name, file text]. Each declares only what it uses, so the ban is
// the only error of the file.
const EL = (name: string) =>
  `declare const el: { ${name}: (a: string, b?: string) => unknown };\n`;
const PROP = (name: string) =>
  `declare const el: { ${name}: string };\ndeclare const s: string;\n`;
const SEL =
  "declare const sel: { html: (v: string) => unknown; property: (n: string, v: string) => unknown };\ndeclare const s: string;\n";

const htmlProperties = ["innerHTML", "outerHTML", "srcdoc"].flatMap(
  (name): [string, string][] => [
    [`${name} assignment`, `${PROP(name)}el.${name} = s;`],
    [`${name} string literal`, `${PROP(name)}el["${name}"] = s;`],
    [`${name} through property()`, `${SEL}sel.property("${name}", s);`],
  ],
);

const html: [string, string][] = [
  ["html call", `${SEL}sel.html(s);`],
  ["html string member", `${SEL}sel["html"](s);`],
  ["html alias", `${SEL}const h = sel.html;\nh.call(sel, s);`],
];

const methods = ["insertAdjacentHTML", "createContextualFragment"].flatMap(
  (name): [string, string][] => [
    [`${name} call`, `${EL(name)}el.${name}("p", "s");`],
    [`${name} bare member`, `${EL(name)}export const f = el.${name};`],
    [`${name} string member`, `${EL(name)}el["${name}"]("p", "s");`],
  ],
);

const write: [string, string][] = [
  ["document.write call", 'document.write("x");'],
  [
    "document.write bare member",
    "declare const doc: { write: (s: string) => void };\nexport const f = doc.write;",
  ],
  ["document.write string member", 'document["write"]("x");'],
];

const CALLS: Record<string, string> = {
  eval: 'eval("1");',
  Function: "Function.call(undefined);",
  fetch: 'export const r = fetch("u");',
  XMLHttpRequest: "export const x = new XMLHttpRequest();",
  WebSocket: 'export const x = new WebSocket("u");',
  EventSource: 'export const x = new EventSource("u");',
  DOMParser: "export const x = new DOMParser();",
  Image: "export const x = new Image();",
  localStorage: 'localStorage.setItem("k", "v");',
  sessionStorage: 'sessionStorage.setItem("k", "v");',
  indexedDB: 'export const x = indexedDB.open("u");',
  caches: 'export const x = caches.open("u");',
  postMessage: 'postMessage("m", "*");',
  Worker: 'export const x = new Worker("u");',
  SharedWorker: 'export const x = new SharedWorker("u");',
  // why: `importScripts` is not in the DOM types; the global declaration keeps the plant typed
  importScripts:
    'declare global {\n  function importScripts(...urls: string[]): void;\n}\nimportScripts("u");',
  console: 'console.log("x");',
  open: 'open("u");',
  location: 'location.assign("u");',
  setTimeout: "setTimeout(() => 1, 1);",
  setInterval: "setInterval(() => 1, 1);",
  requestAnimationFrame: "requestAnimationFrame(() => 1);",
};

const globals = Object.entries(CALLS).flatMap(
  ([name, call]): [string, string][] => [
    [`${name} call`, call],
    [`${name} bare name`, `export const v: unknown = ${name};`],
    [`${name} on globalThis`, `export const v: unknown = globalThis.${name};`],
  ],
);

const extraAliases: [string, string][] = [
  ["fetch on window", 'export const r = window.fetch("u");'],
  ["fetch on self", 'export const r = self.fetch("u");'],
  ["fetch string member on window", 'export const r = window["fetch"]("u");'],
];

const beacon: [string, string][] = [
  ["sendBeacon call", 'navigator.sendBeacon("u", "d");'],
  [
    "sendBeacon bare member",
    "export const b = navigator.sendBeacon.bind(navigator);",
  ],
  ["sendBeacon on globalThis", 'globalThis.navigator.sendBeacon("u", "d");'],
];

const PLANTS = [
  ...htmlProperties,
  ...html,
  ...methods,
  ...write,
  ...globals,
  ...extraAliases,
  ...beacon,
];

const files = FOLDERS.flatMap((folder) =>
  PLANTS.map(([name, text], i) => ({
    folder,
    name,
    file: path.join(REPO, folder, `zz-plant-sink-${i}.ts`),
    text: `${text}\nexport {};\n`,
  })),
);

let results: ESLint.LintResult[] = [];

beforeAll(async () => {
  for (const plant of files) writeFileSync(plant.file, plant.text);
  const eslint = new ESLint({
    cwd: REPO,
    overrideConfigFile: path.join(REPO, "scripts", "eslint.config.mjs"),
  });
  results = await eslint.lintFiles(files.map((plant) => plant.file));
}, TIME_OUT);

afterAll(() => {
  for (const plant of files) rmSync(plant.file, { force: true });
});

describe("S15 sink and API bans", () => {
  it("plants three forms per ban", () => {
    expect(PLANTS).toHaveLength(9 + 3 + 6 + 3 + 66 + 3 + 3);
  });

  it.each(files.map((plant) => [plant.folder, plant.name, plant.file]))(
    "%s: %s gives exactly one ban error",
    (_folder, _name, file) => {
      const result = results.find((r) => path.resolve(r.filePath) === file);
      const errors = result?.messages.filter((m) => m.severity === 2) ?? [];
      expect(errors.map((m) => `${m.ruleId}: ${m.message}`)).toHaveLength(1);
      expect(BAN_RULES).toContain(errors[0].ruleId);
    },
  );
});
