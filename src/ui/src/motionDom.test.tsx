// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "./canvas/index";
import { cssRules, PANELS, panelOf, REDUCED } from "./cssRules";

const spy = vi.hoisted(() => ({ canvases: [] as Canvas[] }));
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      const made = mod.createCanvas(...args);
      spy.canvases.push(made);
      return made;
    },
  };
});

// why: STORY-003-04 fake clock, STORY-004-02 rule 15 — the clock comes before `d3-timer` loads
vi.useFakeTimers({
  toFake: [
    "performance",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "Date",
  ],
});
vi.resetModules();
const { mountApp } = await import("./testFrame");
const { fixtureModel } = await import("./fixtureModel");

const SRC = import.meta.dirname;
// why: S12 reads the panel rules with the S1 parser (cssRules.ts): the rules with a transition
const SLIDES = readdirSync(SRC)
  .filter((name) => /^shell-.*\.css$/.test(name))
  .flatMap((name) => cssRules(readFileSync(path.join(SRC, name), "utf8")))
  .filter(
    (rule) =>
      rule.at !== REDUCED &&
      rule.decls.some((d) => d.property === "transition"),
  )
  .flatMap((rule) =>
    rule.selectors
      .filter((selector) => panelOf(selector) !== undefined)
      .map((selector) => ({
        selector,
        value: rule.decls.find((d) => d.property === "transition")?.value,
      })),
  );

const canvas = () => spy.canvases[spy.canvases.length - 1];

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const button = (root: Element, name: string) => {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};

describe("S12 the S1 rules apply to the rendered panels", () => {
  it("matches each rendered panel element with a transform-only panel rule", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    run(() => canvas().select("e:u_12"));
    run(() => button(root, "Hide from canvas").click());
    run(() => root.querySelector<HTMLElement>(".hid-toggle")?.click());
    run(() => button(root, "Dataset").click());
    run(() => canvas().select("e:t_FCT_REVENUE"));
    // why: plant (h) — each panel is found by its role in the markup, not by its class
    const dataset = button(root, "Dataset").getAttribute("aria-controls") ?? "";
    const elements = [
      button(root, "Collapse inspector").closest("aside"),
      root.querySelector('aside[aria-label="Hidden from canvas"]'),
      root.querySelector(".search input")?.parentElement?.parentElement,
      root.ownerDocument.getElementById(dataset),
    ];
    expect(elements.every((el) => el instanceof Element)).toBe(true);
    expect(elements[1]?.getAttribute("data-state")).toBe("expanded");
    const matched = elements.map((el) =>
      SLIDES.filter(({ selector }) => (el as Element).matches(selector)),
    );
    expect(matched.map((found) => found.length > 0)).toEqual(
      PANELS.map(() => true),
    );
    expect(matched.flat().map(({ value }) => value)).toEqual(
      matched.flat().map(() => "transform var(--panel-dur) var(--panel-ease)"),
    );
  });
});
