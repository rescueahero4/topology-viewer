import { fixtures, generate, loadFixture } from "@qdic-topology/fixtures";
import { render } from "preact";
import { App, type AppProps } from "./App";
import { appInput, DARK, LIGHT } from "./fixtureModel";
import type { ShellHost } from "./host";
import { hostilePayload } from "./shellAudit";
import { langOf } from "./strings/index";

// why: rule 13, Security notes "Harness" — a dev page for the QA browser checks (S18), served on
// localhost by the `shell-harness` script; never exported or bundled. Its labels are dev text
const HOSTILE = "hostile payload";
const RANDOM = "generate.random(2000, 4000, 1)";

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const fixture = byId<HTMLSelectElement>("fixture");
const language = byId<HTMLSelectElement>("lang");
const theme = byId<HTMLSelectElement>("theme");
const mount = byId<HTMLDivElement>("app");
const readout = byId<HTMLPreElement>("readout");

// why: Security notes "Harness" — each host call goes into the readout by `textContent` only
function note(line: string): void {
  readout.textContent = `${readout.textContent ?? ""}${line}\n`;
}
const host: ShellHost = {
  copyForAi: (text) => {
    note(`copyForAi: ${text}`);
    return Promise.resolve("copied");
  },
  openLink: (url) => {
    note(`openLink: ${url}`);
    return Promise.resolve();
  },
  requestDisplayMode: (mode) => {
    note(`requestDisplayMode: ${mode}`);
    return Promise.resolve();
  },
};

function raw(key: string): unknown {
  if (key === HOSTILE) return hostilePayload();
  if (key === RANDOM) return generate.random(2000, 4000, 1);
  return loadFixture(key).input;
}

// why: owner decision H8 — a new input, a theme with its canvas colour, or a new language is a
// new canvas
function draw(): void {
  const dark = theme.value === "dark";
  const props: AppProps = {
    input: appInput(raw(fixture.value), dark ? DARK : LIGHT),
    lang: langOf(language.value),
    locale: language.value,
    theme: dark ? "dark" : "light",
    host,
  };
  render(<App {...props} />, mount);
}

for (const key of [...Object.keys(fixtures).sort(), HOSTILE, RANDOM]) {
  const item = document.createElement("option");
  item.value = key;
  item.textContent = key;
  fixture.appendChild(item);
}
fixture.value = "s-access";
for (const control of [fixture, language, theme])
  control.addEventListener("change", draw);
byId<HTMLButtonElement>("again").addEventListener("click", draw);
draw();
