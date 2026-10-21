// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";

// why: LEARNINGS 64 — the clock comes before `d3-timer` loads
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
const { appInput, fixtureModel } = await import("./fixtureModel");
const { datasets } = await import("@qdic-topology/fixtures");

// why: STORY-005-08 S1 — the prefix is a literal here, so a planted prefix or an id made from input
// data fails; `-label` and `-name` are the derived ids of `Search.tsx` and `AiMark.tsx`
const MADE = /^ui-\d+(-label|-name)?$/;
const RENDERER = /^qt\d+-/;
const PAGE_IDS = ["app", "dialogs", "appbar"];
const REFS = ["aria-controls", "aria-labelledby", "aria-describedby", "for"];

type Frame = Awaited<ReturnType<typeof mountApp>>;

const describeEl = (el: Element) =>
  `${el.tagName.toLowerCase()}.${el.classList[0] ?? ""}`;

function targets(root: Element, el: Element | undefined) {
  const id = el?.getAttribute("aria-controls");
  if (id === null || id === undefined) return [];
  return [...root.querySelectorAll(`[id="${id}"]`)].map(describeEl);
}

function audit(root: Element) {
  const ids = [...root.querySelectorAll("[id]")].map((el) => el.id);
  const refs = [...root.querySelectorAll(REFS.map((r) => `[${r}]`).join())]
    .flatMap((el) => REFS.map((r) => el.getAttribute(r) ?? ""))
    .flatMap((value) => value.split(" "))
    .filter((value) => value !== "");
  const count = (id: string) => ids.filter((other) => other === id).length;
  const dataset = [...root.querySelectorAll("button.ctl-btn")].find(
    (el) => el.textContent === "Dataset",
  );
  const own = [...ids, ...refs].filter((id) => !RENDERER.test(id));
  return {
    unique: {
      duplicates: [...new Set(ids.filter((id) => count(id) > 1))].sort(),
      unresolved: [...new Set(refs.filter((id) => count(id) !== 1))].sort(),
      dataset: targets(root, dataset),
      handle: targets(root, root.querySelector(".wb-handle") ?? undefined),
    },
    form: {
      notMade: [...new Set(own.filter((id) => !MADE.test(id)))].sort(),
      pageIds: [...document.querySelectorAll("[id]")]
        .map((el) => el.id)
        .filter((id) => PAGE_IDS.includes(id)),
    },
  };
}

type Audit = ReturnType<typeof audit>;

const unique = (shown: boolean) => ({
  duplicates: [],
  unresolved: [],
  dataset: shown ? ["section.workbench"] : [],
  handle: shown ? ["section.workbench"] : [],
});

// why: the uniqueness trace comes first, so the red run on `useId` shows the ISSUE-014 values
function expectClean(trace: Record<string, Audit>, shown: string[]) {
  const part = <K extends keyof Audit>(key: K) =>
    Object.fromEntries(Object.entries(trace).map(([k, a]) => [k, a[key]]));
  const keys = Object.keys(trace);
  expect(part("unique")).toEqual(
    Object.fromEntries(keys.map((k) => [k, unique(shown.includes(k))])),
  );
  expect(part("form")).toEqual(
    Object.fromEntries(keys.map((k) => [k, { notMade: [], pageIds: [] }])),
  );
}

const paint = () =>
  void act(() => {
    vi.advanceTimersByTime(1000);
  });

async function step(frame: Frame, input: Parameters<Frame["update"]>[0]) {
  await frame.update(input);
  paint();
  return audit(frame.root);
}

// why: S1 Given — the Workbench open by the control-bar "Dataset" button
async function startS1() {
  const frame = await mountApp(appInput(datasets.access.graph));
  paint();
  const button = [...frame.root.querySelectorAll("button.ctl-btn")].find(
    (el) => el.textContent === "Dataset",
  ) as HTMLElement;
  if (button.getAttribute("aria-expanded") !== "true")
    void act(() => button.click());
  const trace: Record<string, Audit> = {
    access: audit(frame.root),
  };
  for (const key of ["catalog", "governance", "access"])
    trace[`${Object.keys(trace).length} ${key}`] = await step(frame, {
      input: appInput(datasets[key].graph),
    });
  return { frame, trace };
}

describe("S1 each id is unique after a new tool call or a pick", () => {
  it("access, catalog, governance, access with the Workbench open", async () => {
    const { frame, trace } = await startS1();
    expectClean(trace, Object.keys(trace));
    expect(frame.root.querySelector("section.workbench")?.id).toMatch(MADE);
  });

  // why: LEARNINGS 42, S4 (b) — the tip, the Hidden row and the AI mark render no id in the S1
  // inputs, so this case mounts them after the third input
  it("the tip, a Hidden row and an AI mark after the third input", async () => {
    const frame = await mountApp(appInput(datasets.access.graph));
    await step(frame, { input: appInput(datasets.catalog.graph) });
    await step(frame, { input: fixtureModel("s-access") });
    const { root } = frame;
    const hover = (el: Element) =>
      void act(() => void el.dispatchEvent(new MouseEvent("mouseenter")));
    const tipOf = (el: Element) => {
      const tip = root.querySelector('[role="tooltip"]');
      expect(el.getAttribute("aria-describedby")).toBe(tip?.id);
      return tip;
    };
    const hide = [
      ...root.querySelectorAll<HTMLElement>(".inspector .insp-bar .icon-btn"),
    ].find((el) => el.getAttribute("aria-label") === "Hide from canvas");
    void act(() => hide?.click());
    paint();
    void act(() =>
      root.querySelector<HTMLElement>(".hidden-panel .hid-toggle")?.click(),
    );
    const row = root.querySelector(".hid-row") as HTMLElement;
    hover(row);
    expect(tipOf(row)).not.toBeNull();
    const trace = { "s-access": audit(root) };
    await step(frame, { input: fixtureModel("s-vocab-meta") });
    const mark = root.querySelector(".ai-mark") as HTMLElement;
    hover(mark);
    expect(tipOf(mark)).not.toBeNull();
    expectClean({ ...trace, "s-vocab-meta": audit(root) }, [
      "s-access",
      "s-vocab-meta",
    ]);
  });
});

describe("S6 each id is unique after a paste and a fatal input", () => {
  it("paste catalog, fatal s-invalid, then governance after S1", async () => {
    const { frame } = await startS1();
    const trace = {
      paste: await step(frame, {
        input: { ...appInput(datasets.catalog.graph), source: "paste" },
      }),
      fatal: await step(frame, { input: fixtureModel("s-invalid") }),
      governance: await step(frame, {
        input: appInput(datasets.governance.graph),
      }),
    };
    expectClean(trace, ["paste", "governance"]);
  });
});
