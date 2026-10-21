// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import {
  copyMessage,
  noticeText,
  type Fatal,
  type Info,
} from "@qdic-topology/engine";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AppInput } from "./App";

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
const { appInput, fixtureModel } = await import("./fixtureModel");
const { t } = await import("./strings/index");

// why: the Givens table — the `codes.test.ts` input of `not-a-graph`
const RAW: Record<string, unknown> = {
  "not-a-graph": { items: [{ name: "a" }], shape: { kind: "graph" } },
};

const text = (el: Element | null | undefined) => el?.textContent ?? "";
const plain = (s: string) => s.replace(/`([^`]+)`/g, "$1");
const overlay = (root: Element) => root.querySelector(".overlay");
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
const labels = (names: readonly string[]) =>
  names.map((name) => t("en", `action.${name}` as Parameters<typeof t>[1]));

async function pressCopy(root: Element) {
  click(buttons(root).find((b) => b.querySelector("svg") !== null));
  await flush();
}

const fatalInfo = (input: AppInput): Info => {
  if (input.ok) throw new Error("not fatal");
  return "info" in input.fatal ? input.fatal.info : {};
};

function expectNotice(root: Element, code: string, info: Info) {
  const entry = noticeText(code, info, "en");
  const o = overlay(root);
  expect(o?.getAttribute("role")).toBe("alert");
  expect(text(o?.querySelector(".overlay-title"))).toBe(plain(entry.title));
  expect(text(o?.querySelector(".notice-body"))).toBe(plain(entry.body));
  expect(text(o?.querySelector(".notice-details code"))).toBe(entry.code);
}

describe("S2 an unknown code", () => {
  it("gives the error-fallback notice", async () => {
    const fatal = { code: "made-up", path: [] } as unknown as Fatal;
    const frame = await mountApp({ ok: false, fatal });
    expectNotice(frame.root, "error-fallback", {});
    expect(text(frame.root)).not.toContain("made-up");
    expect(buttons(frame.root).map(text)).toEqual(labels(["copy"]));
  });
});

describe("S3 a fatal input after a chart", () => {
  it("shows the nodes-not-array notice and nothing of the chart", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    expect(frame.root.querySelector(".qt-root")).not.toBeNull();
    await frame.update({ input: fixtureModel("s-invalid") });
    expect(overlay(frame.root)?.getAttribute("role")).toBe("alert");
    expect(text(overlay(frame.root)?.querySelector(".notice-body"))).toContain(
      "but it is text",
    );
    expect(document.querySelector(".qt-root")).toBeNull();
    expect(document.querySelector(".graph-canvas")).toBeNull();
    expect(
      document.querySelector(".controls, .catbar, .status-stack"),
    ).toBeNull();
  });
});

describe("S7 the copy feedback", () => {
  it("calls the host once a press and shows each result for 2.2 s", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const input = fixtureModel("s-invalid");
    await frame.update({ input });
    const results = ["copied", "failed", "sent"] as const;
    const calls: string[] = [];
    let next = 0;
    await frame.update({
      host: {
        ...frame.host,
        copyForAi: (arg) => {
          calls.push(arg);
          return Promise.resolve(results[next++]);
        },
      },
    });
    const info = fatalInfo(input);
    const message = copyMessage(
      "nodes-not-array",
      info,
      "en",
      "nodes-not-array",
    );
    const copy = () => buttons(frame.root)[0];
    const label = t("en", "action.copy");
    for (const [index, result] of results.entries()) {
      expect(text(copy())).toBe(label);
      await pressCopy(frame.root);
      expect(calls).toEqual(Array.from({ length: index + 1 }, () => message));
      expect(text(copy())).toBe(t("en", `copy.${result}`));
      void act(() => {
        vi.advanceTimersByTime(2199);
      });
      expect(text(copy())).toBe(t("en", `copy.${result}`));
      void act(() => {
        vi.advanceTimersByTime(1);
      });
    }
    expect(text(copy())).toBe(label);
    expect(t("en", "copy.sent")).toBe("Sent to the AI client");
    expect(frame.calls).toEqual([]);
  });
});

describe("S18 the not-a-graph and too-large notices", () => {
  const structure = (root: Element) =>
    [...(overlay(root)?.querySelector(".notice")?.children ?? [])].map(
      (el) => el.className,
    );

  it("have the layout of the nodes-not-array notice", async () => {
    const base = await mountApp(fixtureModel("s-invalid"));
    const expected = structure(base.root);
    expect(expected).toEqual([
      "notice-ic ic",
      "overlay-title",
      "notice-body",
      "notice-sect",
      "notice-sect notice-ai",
      "notice-details",
      "notice-actions",
    ]);
    for (const [code, input] of [
      ["not-a-graph", appInput(RAW["not-a-graph"])],
      ["too-large", fixtureModel("s-stress")],
    ] as const) {
      const frame = await mountApp(input);
      expect(structure(frame.root)).toEqual(expected);
      expect(overlay(frame.root)?.getAttribute("role")).toBe("alert");
      expect(
        text(overlay(frame.root)?.querySelector(".notice-details code")),
      ).toBe(code);
      expect(
        overlay(frame.root)?.querySelector(".notice-ic svg"),
      ).not.toBeNull();
    }
  });
});
