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
const state = await import("./state");

const catalog = () => f.opened(mountApp, appInput(datasets.catalog.graph));
const active = () => state.editHistory.value.history.active();
const stops = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".wb-table tbody td[tabindex='0']"),
];
const focused = (root: Element) => root.ownerDocument.activeElement;
const place = (root: Element) => {
  const td = focused(root) as HTMLTableCellElement;
  const tr = td.parentElement as HTMLTableRowElement;
  return [f.rows(root).indexOf(tr), td.cellIndex];
};

describe("S7 the cell focus keys", () => {
  it("has one tab stop, moves by the arrow keys, F2 edits, Escape and Enter", async () => {
    const { root } = await catalog();
    expect(stops(root)).toHaveLength(1);
    expect(stops(root)[0]).toBe(f.rows(root)[0].children[1]);
    stops(root)[0].focus();
    for (let i = 0; i < 3; i++) f.key(focused(root), "ArrowDown");
    f.key(focused(root), "ArrowRight");
    f.key(focused(root), "ArrowRight");
    expect(place(root)).toEqual([3, 3]);
    expect(stops(root)).toEqual([focused(root)]);
    f.key(focused(root), "ArrowRight");
    f.key(focused(root), "ArrowRight");
    expect(f.heads(root)[place(root)[1]]).toBe("Name");
    const name = f.text(focused(root));
    f.key(focused(root), "F2");
    expect(f.input(root)?.value).toBe(name);
    expect(focused(root)).toBe(f.input(root));
    f.key(f.input(root), "Escape");
    expect(f.editors(root)).toHaveLength(0);
    expect(place(root)).toEqual([3, 5]);
    expect(state.selection.value).toBeNull();
    f.key(focused(root), "Enter");
    expect(f.editors(root)).toHaveLength(0);
    expect(state.selection.value).not.toBeNull();
  });

  it("stops at the edges of the table", async () => {
    const { root } = await catalog();
    stops(root)[0].focus();
    f.key(focused(root), "ArrowUp");
    f.key(focused(root), "ArrowLeft");
    expect(place(root)).toEqual([0, 1]);
  });
});

describe("S5 Escape cancels and keeps the selection", () => {
  it("shows the old value, adds no edit and keeps the canvas selection", async () => {
    const { root } = await catalog();
    f.search(root, "db_RAW");
    f.dblclick(f.cellOf(root, "db_RAW", "Name"));
    const picked = state.selection.value;
    expect(picked).not.toBeNull();
    f.type(f.input(root), "typed");
    f.key(f.input(root), "Escape");
    expect(f.text(f.cellOf(root, "db_RAW", "Name"))).toBe("RAW");
    expect(active()).toHaveLength(0);
    expect(state.selection.value).toBe(picked);
    expect(focused(root)).toBe(f.cellOf(root, "db_RAW", "Name"));
  });
});

describe("S12 a start on another cell", () => {
  it("saves the open editor first; only one input exists", async () => {
    const { root } = await catalog();
    f.search(root, "RAW");
    f.dblclick(f.cellOf(root, "db_RAW", "Name"));
    f.type(f.input(root), "RAW_EU");
    f.dblclick(f.cellOf(root, "sc_SALESFORCE", "Name"));
    expect(f.text(f.cellOf(root, "db_RAW", "Name"))).toBe("RAW_EU");
    expect(active()).toHaveLength(1);
    expect(f.editors(root)).toHaveLength(1);
    expect(f.input(root)?.value).toBe("RAW.SALESFORCE");
  });

  it("keeps a bad value in edit and does not open the other cell", async () => {
    const { root } = await catalog();
    f.search(root, "RAW");
    f.dblclick(f.cellOf(root, "db_RAW", "Name"));
    f.type(f.input(root), "");
    f.dblclick(f.cellOf(root, "sc_SALESFORCE", "Name"));
    expect(f.editors(root)).toHaveLength(1);
    expect(f.message(root)).toBe("Type a value. This cell cannot be empty.");
    expect(f.cellOf(root, "db_RAW", "Name").contains(f.input(root))).toBe(true);
    expect(active()).toHaveLength(0);
  });
});

describe("S6 a press outside the editor", () => {
  it("saves a valid value and keeps a bad one open", async () => {
    const { root } = await catalog();
    f.search(root, "db_RAW");
    const bar = root.querySelector(".wb-bar") as Element;
    f.dblclick(f.cellOf(root, "db_RAW", "Name"));
    f.type(f.input(root), "");
    f.click(bar);
    expect(f.editors(root)).toHaveLength(1);
    expect(f.input(root)?.getAttribute("aria-invalid")).toBe("true");
    expect(f.input(root)?.getAttribute("aria-describedby")).toBe(
      root.querySelector(".cell-msg p")?.id,
    );
    const live = root.querySelector(".cell-edit [aria-live=polite]");
    expect(f.text(live)).toBe("Type a value. This cell cannot be empty.");
    f.type(f.input(root), "RAW_EU");
    f.click(bar);
    expect(f.editors(root)).toHaveLength(0);
    expect(f.text(f.cellOf(root, "db_RAW", "Name"))).toBe("RAW_EU");
    expect(focused(root)).toBe(f.cellOf(root, "db_RAW", "Name"));
  });
});

describe("rule 9 the row in edit stays rendered", () => {
  it("keeps the input and its typed value through a scroll of 3,000 px", async () => {
    const { root } = await catalog();
    f.dblclick(f.rows(root)[0].children[5]);
    f.type(f.input(root), "kept text");
    const scroll = root.querySelector(".wb-scroll") as HTMLElement;
    f.run(() => {
      scroll.scrollTop = 3000;
      scroll.dispatchEvent(new Event("scroll"));
    });
    expect(f.rows(root).length).toBeGreaterThan(1);
    expect(f.input(root)?.value).toBe("kept text");
    f.run(() => {
      scroll.scrollTop = 0;
      scroll.dispatchEvent(new Event("scroll"));
    });
    expect(f.input(root)?.value).toBe("kept text");
  });
});
