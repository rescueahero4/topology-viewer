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
const { datasets } = await import("@qdic-topology/fixtures");
const { hostilePayload, shellAudit, MARKERS } = await import("./shellAudit");
const { domAudit } = await import("./canvas/domAudit");
const { en } = await import("./strings/en");
const state = await import("./state");

const active = () => state.editHistory.value.history.active();
const combo = (root: Element) =>
  root.querySelector<HTMLInputElement>(".cell-edit input[role=combobox]");
const list = (root: Element) =>
  root.querySelector<HTMLElement>(".cell-edit [role=listbox]");
const options = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".cell-edit [role=option]"),
];

function edgeOf(root: Element, subject: string, predicate: string) {
  const edge = f
    .rows(root)
    .find((tr) =>
      f
        .text(tr.children[f.heads(root).indexOf("ID")])
        .startsWith(`${subject} · ${predicate} · `),
    );
  if (edge === undefined) throw new Error("no edge");
  return (name: string) => edge.children[f.heads(root).indexOf(name)];
}

describe("S8 the node search of a Subject cell", () => {
  it("lists at most 50 nodes with glyph, name and type; Enter with no active item saves nothing", async () => {
    const { root } = await f.opened(mountApp, appInput(datasets.catalog.graph));
    f.search(root, "t_FCT_REVENUE");
    const at = edgeOf(root, "t_FCT_REVENUE", "contains");
    f.dblclick(at("Subject"));
    expect(combo(root)?.value).toBe("FCT_REVENUE");
    f.type(combo(root), "ID");
    expect(list(root)?.getAttribute("aria-label")).toBe("Nodes");
    expect(options(root)).toHaveLength(36);
    for (const item of options(root))
      expect(
        [".glyph", ".name", ".meta"].map(
          (part) => item.querySelector(part) !== null,
        ),
      ).toEqual([true, true, true]);
    f.key(combo(root), "Enter");
    expect(f.editors(root)).toHaveLength(1);
    expect(f.message(root)).toBe("");
    f.type(combo(root), "e");
    expect(options(root)).toHaveLength(50);
    expect(active()).toHaveLength(0);
  });

  it("gives empty on Enter in an emptied field and saves nothing", async () => {
    const { root } = await f.opened(mountApp, appInput(datasets.catalog.graph));
    f.search(root, "t_FCT_REVENUE");
    const at = edgeOf(root, "t_FCT_REVENUE", "contains");
    f.dblclick(at("Subject"));
    f.type(combo(root), "");
    f.key(combo(root), "Enter");
    expect(f.editors(root)).toHaveLength(1);
    expect(f.message(root)).toBe("Type a value. This cell cannot be empty.");
    expect(combo(root)?.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("S11 a Subject equal to the Object", () => {
  it("gives self-edge and saves nothing", async () => {
    const { root } = await f.opened(mountApp, appInput(datasets.catalog.graph));
    f.search(root, "t_FCT_PIPELINE");
    const at = edgeOf(root, "t_FCT_PIPELINE", "derivedFrom");
    const object = f.text(at("Object"));
    f.dblclick(at("Subject"));
    f.type(combo(root), object);
    const index = options(root).findIndex(
      (item) => f.text(item.querySelector(".name")) === object,
    );
    for (let i = 0; i <= index; i++) f.key(combo(root), "ArrowDown");
    f.key(combo(root), "Enter");
    expect(f.message(root)).toBe(
      "The subject and the object cannot be the same node.",
    );
    expect(active()).toHaveLength(0);
  });
});

describe("S9 a Subject save to a not-drawn node", () => {
  it("draws the new end and keeps the place of every node drawn before", async () => {
    const { root } = await f.opened(mountApp, appInput(datasets.catalog.graph));
    const before = new Map(state.canvasState.value?.positions);
    expect(before.has("e:t_STRIPE_CUSTOMERS")).toBe(false);
    f.search(root, "t_FCT_PIPELINE");
    const at = edgeOf(root, "t_FCT_PIPELINE", "derivedFrom");
    f.dblclick(at("Object"));
    f.type(combo(root), "STRIPE_CUSTOMERS");
    f.key(combo(root), "ArrowDown");
    f.key(combo(root), "Enter");
    f.thisRow(root);
    const after = new Map(state.canvasState.value?.positions);
    expect(after.has("e:t_STRIPE_CUSTOMERS")).toBe(true);
    for (const [id, point] of before) expect(after.get(id), id).toEqual(point);
  });
});

const TAIL = `"<>&javascript:`;

function canvasAudit(root: Element): string[] {
  const svg = root.querySelector(".graph-canvas")?.firstElementChild;
  if (svg === null || svg === undefined) throw new Error("no canvas");
  return domAudit(svg, MARKERS, en["canvas.name"]);
}

describe("S13 hostile labels, types and typed names in the lists", () => {
  it("keeps every marker out of the attributes and the option ids", async () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const { root } = await f.opened(mountApp, appInput(hostilePayload()));
    f.search(root, MARKERS[0]);
    const row = `${MARKERS[0]}${TAIL}`;
    const pick = (cell: Element, typed: string) => {
      f.dblclick(cell);
      f.type(combo(root), typed);
      expect(shellAudit(root)).toEqual([]);
      f.key(combo(root), "Enter");
    };
    pick(f.cellOf(root, row, "Kind"), `${MARKERS[5]}${TAIL}`);
    const at = edgeOf(root, row, `${MARKERS[15]}${TAIL}`);
    pick(at("Predicate"), `${MARKERS[6]}${TAIL}`);
    f.dblclick(at("Subject"));
    f.type(combo(root), "qxm");
    expect(options(root).length).toBeGreaterThan(0);
    expect(shellAudit(root)).toEqual([]);
    f.key(combo(root), "Escape");
    f.dblclick(at("Predicate"));
    f.type(combo(root), "qxm");
    expect(options(root).length).toBeGreaterThan(0);
    expect(shellAudit(root)).toEqual([]);
    f.key(combo(root), "Escape");
    expect(active()).toHaveLength(2);
    expect(shellAudit(root)).toEqual([]);
    expect(canvasAudit(root)).toEqual([]);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
  });
});
