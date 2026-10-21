// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
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
const { mountApp } = await import("./testFrame");
const { appInput } = await import("./fixtureModel");
const { hostilePayload, shellAudit, MARKERS } = await import("./shellAudit");

const QUERY = `qxm0`;
const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 60; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

function textNodes(root: Element): Text[] {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    nodes.push(node as Text);
  return nodes;
}

const button = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLElement>("button")].find((b) =>
    text(b).startsWith(name),
  ) as HTMLElement;

// why: S19 (STORY-004-02 rule 14) — the marker audit, no prototype text, and no `title` on a cell
// or a header, with each Workbench panel open in turn and each cell tip shown
function visit(root: Element): void {
  expect(shellAudit(root)).toEqual([]);
  const texts = textNodes(root)
    .map((node) => node.data)
    .join("\n");
  expect(texts).not.toContain("function");
  expect(texts).not.toContain("[object Object]");
  expect(root.querySelectorAll(".wb-table [title]")).toHaveLength(0);
}

function hoverCells(root: Element): number {
  const cells = [...root.querySelectorAll(".wb-table tbody td")];
  for (const cell of cells) {
    void act(() => void cell.dispatchEvent(new MouseEvent("mouseenter")));
    visit(root);
    void act(() => void cell.dispatchEvent(new MouseEvent("mouseleave")));
  }
  return cells.length;
}

// why: ISSUE-012 — this one test walks every panel and takes about 4.4 s alone, near the 5 s
// default; under the load of the full suite it went above it
const TIME_OUT = 30_000;

describe("S19 the Workbench on the hostile payload", () => {
  it(
    "puts no marker into an attribute with each Workbench panel open",
    async () => {
      const frame = await mountApp(appInput(hostilePayload()));
      const { root } = frame;
      run(() => button(root, "Dataset").click());
      expect(root.querySelector(".workbench")?.hasAttribute("inert")).toBe(
        false,
      );
      visit(root);
      const shown = textNodes(root).map((node) => node.data);
      expect(shown.some((data) => data.startsWith(MARKERS[3]))).toBe(true);
      expect(hoverCells(root)).toBeGreaterThan(20);
      const search = root.querySelector(".wb-search") as HTMLInputElement;
      void act(() => {
        search.value = QUERY;
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
      void act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(
        root.querySelectorAll(".wb-table tbody tr.row").length,
      ).toBeGreaterThan(0);
      visit(root);
      const sortName = [
        ...root.querySelectorAll<HTMLElement>(".wb-table thead th button"),
      ].find((b) => text(b) === "Name");
      run(() => sortName?.click());
      expect(
        root.querySelector(".wb-table thead th[aria-sort=ascending]"),
      ).not.toBeNull();
      visit(root);
      for (const name of ["Kind", "Family", "Columns"]) {
        run(() => button(root, name).click());
        visit(root);
      }
      const keys = [
        ...(button(root, "Columns").nextElementSibling?.querySelectorAll(
          "[role=menuitemcheckbox] .nm",
        ) ?? []),
      ];
      const hostile = keys.filter((el) => text(el).startsWith(MARKERS[3]));
      expect(hostile).toHaveLength(1);
      expect([...hostile[0].childNodes].map((node) => node.nodeType)).toEqual([
        Node.TEXT_NODE,
      ]);
      run(() => button(root, "Columns").click());
      run(() =>
        root
          .querySelector<HTMLElement>(".wb-table thead th.sel .check")
          ?.click(),
      );
      expect(root.querySelector(".wb-bulk")).not.toBeNull();
      for (const el of root.querySelectorAll(".wb-bulk .btn")) {
        void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
        visit(root);
      }
      expect(frame.calls).toEqual([]);
    },
    TIME_OUT,
  );
});
