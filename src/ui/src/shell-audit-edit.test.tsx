// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { describe, expect, it, vi } from "vitest";

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
const f = await import("./cellEditFrame");
const { mountApp } = await import("./testFrame");
const { appInput } = await import("./fixtureModel");
const { hostilePayload, shellAudit, MARKERS } = await import("./shellAudit");
const { domAudit } = await import("./canvas/domAudit");
const { en } = await import("./strings/en");
const state = await import("./state");

const TAIL = `"<>&javascript:`;
// why: LEARNINGS 24, 75 — 30 saves took 5.3 s in the full gate run (the 5 s default failed); the
// limit is more than 2 × that time
const TIME_OUT = 30_000;
// why: S20 (i) — a number attribute whose key holds a marker, so a message shows on a column
// whose name is model text
const NUMBER_KEY = `${MARKERS[26]}${TAIL}n`;

function payload(): unknown {
  const raw = hostilePayload() as { nodes: { attrs?: object }[] };
  raw.nodes[0].attrs = { ...raw.nodes[0].attrs, [NUMBER_KEY]: 7 };
  return raw;
}

const ROW = `${MARKERS[0]}${TAIL}`;

function canvasAudit(root: Element): string[] {
  const svg = root.querySelector(".graph-canvas")?.firstElementChild;
  if (svg === null || svg === undefined) throw new Error("no canvas");
  return domAudit(svg, MARKERS, en["canvas.name"]);
}

describe("S15 typed hostile values reach text nodes and input values only", () => {
  it(
    "saves each marker into Name, System and a text attribute with no attribute finding",
    async () => {
      const { root } = await f.opened(mountApp, appInput(payload()));
      f.search(root, MARKERS[0]);
      const columns = ["Name", "System", `${MARKERS[3]}${TAIL}`];
      MARKERS.forEach((marker, i) => {
        f.dblclick(f.cellOf(root, ROW, columns[i % 3]));
        f.type(f.input(root), `${marker}${TAIL}`);
        expect(shellAudit(root)).toEqual([]);
        f.key(f.input(root), "Enter");
        expect(shellAudit(root)).toEqual([]);
      });
      expect(state.editHistory.value.history.done).toHaveLength(20);
      expect(f.text(f.cellOf(root, ROW, "Name"))).toBe(`${MARKERS[27]}${TAIL}`);
      expect(canvasAudit(root)).toEqual([]);
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    },
    TIME_OUT,
  );

  it("keeps the ids of the editor and the message free of a column name", async () => {
    const { root } = await f.opened(mountApp, appInput(payload()));
    f.search(root, MARKERS[0]);
    f.dblclick(f.cellOf(root, ROW, NUMBER_KEY));
    f.markBad(f.input(root));
    f.key(f.input(root), "Enter");
    expect(f.message(root)).toBe("Type a number.");
    expect(f.text(root.querySelector(".cell-edit .sr-only"))).toBe(
      `Edit ${NUMBER_KEY}`,
    );
    expect(shellAudit(root)).toEqual([]);
    expect(canvasAudit(root)).toEqual([]);
  });
});
