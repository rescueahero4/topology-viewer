// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Info, Lang } from "#engine";
import { act } from "preact/test-utils";
import { describe, expect, it, vi, type MockInstance } from "vitest";
import type { AppInput } from "./App";
import type { Canvas, CanvasOptions } from "./canvas/index";

// why: S4 to S6 — the real canvas with a spy on the methods of the actions, a factory that throws
// (rule 1 (b)), or a stub canvas that sends the `notice` events of the test
const spy = vi.hoisted(() => ({
  throws: false,
  stub: false,
  canvases: [] as Canvas[],
  calls: [] as Record<"setFilters" | "resetView", MockInstance>[],
  options: [] as unknown[],
  handlers: new Map<string, (event: unknown) => void>(),
}));
vi.mock("./canvas/index", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./canvas/index")>();
  return {
    ...mod,
    createCanvas: (...args: Parameters<typeof mod.createCanvas>) => {
      if (spy.throws) throw new Error("planted factory error");
      spy.options.push(args[1]);
      if (spy.stub)
        return {
          on: (name: string, handler: (event: unknown) => void) => {
            spy.handlers.set(name, handler);
            return () => spy.handlers.delete(name);
          },
        } as unknown as Canvas;
      const made = mod.createCanvas(...args);
      spy.calls.push({
        setFilters: vi.spyOn(made, "setFilters"),
        resetView: vi.spyOn(made, "resetView"),
      });
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
const { copyMessage, noticeText, stats } =
  await import("#engine");
const { mountApp } = await import("./testFrame");
const { appInput, fixtureModel } = await import("./fixtureModel");
const state = await import("./state");
const { t } = await import("./strings/index");

const LANGS: Lang[] = ["en", "ja"];
const TYPES = { t0: { label: "T0", rank: 0 } };
const NODES = [
  { id: "n0", type: "t0" },
  { id: "n1", type: "t0" },
];
// why: the Givens table — the `codes.test.ts` inputs of `edges-not-array` and `not-a-graph`
const RAW: Record<string, unknown> = {
  "edges-not-array": { types: TYPES, nodes: NODES, edges: {} },
  "not-a-graph": { items: [{ name: "a" }], shape: { kind: "graph" } },
};
const FATAL_GIVENS: [string, () => AppInput][] = [
  ["not-object", () => fixtureModel("s-not-graph")],
  ["nodes-not-array", () => fixtureModel("s-invalid")],
  ["edges-not-array", () => appInput(RAW["edges-not-array"])],
  ["no-valid-nodes", () => fixtureModel("s-noid-all")],
  ["too-large", () => fixtureModel("s-stress")],
  ["not-a-graph", () => appInput(RAW["not-a-graph"])],
];

const text = (el: Element | null | undefined) => el?.textContent ?? "";
const plain = (s: string) => s.replace(/`([^`]+)`/g, "$1");
const overlay = (root: Element) => root.querySelector(".overlay");
const canvas = () => spy.canvases[spy.canvases.length - 1];
const calls = () => spy.calls[spy.calls.length - 1];
const buttons = (root: Element) => [
  ...(overlay(root)?.querySelectorAll<HTMLElement>(".notice-actions button") ??
    []),
];
const click = (el: Element | undefined) =>
  void act(() => (el as HTMLElement).click());
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

function step(work: () => void): void {
  const before = state.camera.value;
  void act(work);
  for (let i = 0; i < 1000 && state.camera.value === before; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

// why: rule 2 — the one layout: title, body, "What you can do", "For the data provider" only for a
// text, the code in "Technical details", the catalog actions
function expectNotice(root: Element, code: string, info: Info, lang: Lang) {
  const entry = noticeText(code, info, lang);
  const o = overlay(root);
  expect(o?.getAttribute("role")).toBe(
    entry.severity === "empty" ? "status" : "alert",
  );
  expect(o?.getAttribute("aria-live")).toBe("polite");
  expect(text(o?.querySelector(".overlay-title"))).toBe(plain(entry.title));
  expect(text(o?.querySelector(".notice-body"))).toBe(plain(entry.body));
  const user = [
    ...(o?.querySelectorAll(".notice-sect:not(.notice-ai) li") ?? []),
  ];
  expect(user.map(text)).toEqual(entry.user.map(plain));
  const ai = o?.querySelector(".notice-ai p:not(.notice-h)");
  expect(ai === null ? "" : text(ai)).toBe(plain(entry.ai));
  expect(text(o?.querySelector(".notice-details code"))).toBe(entry.code);
  return entry;
}

const labels = (names: readonly string[], lang: Lang) =>
  names.map((name) => t(lang, `action.${name}` as Parameters<typeof t>[1]));

async function pressCopy(root: Element) {
  click(buttons(root).find((b) => b.querySelector("svg") !== null));
  await flush();
}

const fatalInfo = (input: AppInput): Info => {
  if (input.ok) throw new Error("not fatal");
  return "info" in input.fatal ? input.fatal.info : {};
};

describe("S1 and S22 the six fatal notices", () => {
  it.each(
    LANGS.flatMap((lang) =>
      FATAL_GIVENS.map(([code, given]) => [code, lang, given] as const),
    ),
  )("%s in %s", async (code, lang, given) => {
    const input = given();
    expect(input.ok ? null : input.fatal.code).toBe(code);
    const info = fatalInfo(input);
    const frame = await mountApp(input, { lang });
    const entry = expectNotice(frame.root, code, info, lang);
    expect(buttons(frame.root).map(text)).toEqual(labels(entry.actions, lang));
    expect(frame.calls).toEqual([]);
    await pressCopy(frame.root);
    expect(frame.calls).toEqual([
      { name: "copyForAi", arg: copyMessage(code, info, lang, code) },
    ]);
  });

  it("fills the counts and tokens of the Givens", async () => {
    const got = (input: AppInput) => fatalInfo(input).got;
    expect(got(fixtureModel("s-not-graph"))).toBe("array");
    expect(got(fixtureModel("s-invalid"))).toBe("string");
    expect(fatalInfo(fixtureModel("s-noid-all")).rawNodes).toBe(2);
    const frame = await mountApp(fixtureModel("s-noid-all"));
    expect(text(overlay(frame.root)?.querySelector(".notice-body"))).toContain(
      "All 2 node(s)",
    );
  });
});

// why: the Givens table — the type rows of the state on the canvas, turned off one by one with
// motion on; each toggle gives exactly one `settle` (the shell feed of rule 1 (c))
async function typesOff(lang: Lang, off: (type: string | null) => boolean) {
  const frame = await mountApp(fixtureModel("s-access"), { lang });
  const now = state.model.value;
  const at = state.canvasState.value;
  if (now === null || at === null) throw new Error("no canvas");
  let settles = 0;
  canvas().on("settle", () => (settles += 1));
  let toggles = 0;
  for (const row of stats(now.vocab, at).types)
    if (off(row.type)) {
      toggles += 1;
      step(() =>
        canvas().setFilters({ kind: "toggleType", type: row.type, on: false }),
      );
      for (let i = 0; i < 60; i++)
        void act(() => {
          vi.advanceTimersByTime(16);
        });
      expect(settles).toBe(toggles);
    }
  expect(state.frontier.value?.nodes).toHaveLength(0);
  return frame;
}
const EMPTY_OFF = ["table", "user_group", "user"];

describe("S1, S4 and S22 the four empty notices", () => {
  it.each(LANGS)("no-data and edges-only in %s", async (lang) => {
    const empty = await mountApp(fixtureModel("s-empty"), { lang });
    expectNotice(empty.root, "no-data", {}, lang);
    expect(buttons(empty.root)).toHaveLength(0);
    const only = await mountApp(fixtureModel("s-edges-only"), { lang });
    const entry = expectNotice(only.root, "edges-only", { rawEdges: 2 }, lang);
    expect(text(overlay(only.root)?.querySelector(".notice-body"))).toContain(
      "2",
    );
    expect(buttons(only.root).map(text)).toEqual(labels(entry.actions, lang));
    await pressCopy(only.root);
    expect(only.calls).toEqual([
      {
        name: "copyForAi",
        arg: copyMessage("edges-only", { rawEdges: 2 }, lang, "edges-only"),
      },
    ]);
  });

  it.each(LANGS)("types-off in %s and its action", async (lang) => {
    const frame = await typesOff(lang, () => true);
    const entry = expectNotice(
      frame.root,
      "types-off",
      { typeCount: 12 },
      lang,
    );
    expect(buttons(frame.root).map(text)).toEqual(labels(entry.actions, lang));
    expect(buttons(frame.root)[0].className).toBe("btn primary");
    const { setFilters } = calls();
    setFilters.mockClear();
    step(() => buttons(frame.root)[0].click());
    expect(setFilters.mock.calls).toEqual([[{ kind: "showAllTypes" }]]);
    expect(overlay(frame.root)).toBeNull();
  });

  it.each(LANGS)("empty-fallback in %s and its actions", async (lang) => {
    const frame = await typesOff(lang, (type) =>
      EMPTY_OFF.includes(type ?? ""),
    );
    const entry = expectNotice(
      frame.root,
      "empty-fallback",
      { rawNodes: 525 },
      lang,
    );
    expect(text(overlay(frame.root)?.querySelector(".notice-body"))).toContain(
      "525",
    );
    expect(buttons(frame.root).map(text)).toEqual(labels(entry.actions, lang));
    expect(
      frame.root.querySelector(".split")?.getAttribute("data-layout"),
    ).toBe("canvas-only");
    click(buttons(frame.root)[1]);
    expect(
      frame.root.querySelector(".split")?.getAttribute("data-layout"),
    ).toBe("split");
    const { resetView } = calls();
    step(() => buttons(frame.root)[0].click());
    expect(resetView).toHaveBeenCalledTimes(1);
    expect(text(frame.root.querySelector(".status-stack .undo-toast"))).toBe(
      t(lang, "undo.text") + t(lang, "undo.action"),
    );
    expect(frame.calls).toEqual([]);
  });
});

describe("S1, S5, S6 and S22 the error-fallback notice", () => {
  it.each(LANGS)(
    "a zero-size first render in %s gives Try again",
    async (lang) => {
      const input = fixtureModel("s-access");
      const frame = await mountApp(input, {
        lang,
        size: { width: 0, height: 0 },
      });
      expect(state.lastNotice.value).toBe("zero-size");
      const entry = expectNotice(frame.root, "error-fallback", {}, lang);
      expect(buttons(frame.root).map(text)).toEqual(
        labels(entry.actions, lang),
      );
      expect(entry.actions).toEqual(["retry", "table", "copy"]);
      await pressCopy(frame.root);
      expect(frame.calls).toEqual([
        {
          name: "copyForAi",
          arg: copyMessage("error-fallback", {}, lang, "error-fallback"),
        },
      ]);
      frame.resize({ width: 800, height: 600 });
      const made = spy.options.length;
      click(buttons(frame.root)[0]);
      await flush();
      expect(spy.options).toHaveLength(made + 1);
      const options = spy.options[made] as CanvasOptions;
      expect(options.model.graph).toBe(input.ok && input.model.graph);
      expect(options.state).toBeUndefined();
      expect(overlay(frame.root)).toBeNull();
      expect(state.lastNotice.value).toBeNull();
    },
  );

  it("S5 a factory throw gives the fallback without Try again", async () => {
    spy.throws = true;
    try {
      const frame = await mountApp(fixtureModel("s-access"));
      expectNotice(frame.root, "error-fallback", {}, "en");
      expect(overlay(frame.root)?.getAttribute("role")).toBe("alert");
      expect(buttons(frame.root).map(text)).toEqual(
        labels(["table", "copy"], "en"),
      );
      const details = overlay(frame.root)?.querySelector(".notice-details");
      expect(text(details)).toBe("Technical detailserror-fallback");
      expect(text(overlay(frame.root))).not.toContain("planted");
    } finally {
      spy.throws = false;
    }
  });

  it("S6 a canvas error shows no Try again; last-drawn shows no notice", async () => {
    spy.stub = true;
    try {
      const error = await mountApp(fixtureModel("s-access"));
      void act(() => spy.handlers.get("notice")?.({ kind: "error" }));
      expectNotice(error.root, "error-fallback", {}, "en");
      expect(buttons(error.root).map(text)).toEqual(
        labels(["table", "copy"], "en"),
      );
      const last = await mountApp(fixtureModel("s-access"));
      void act(() => spy.handlers.get("notice")?.({ kind: "last-drawn" }));
      expect(state.lastNotice.value).toBe("last-drawn");
      expect(overlay(last.root)).toBeNull();
    } finally {
      spy.stub = false;
    }
  });
});
