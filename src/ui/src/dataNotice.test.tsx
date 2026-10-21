// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Info, Lang } from "@qdic-topology/engine";
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
const { dataNoticeLines, noticeText } = await import("@qdic-topology/engine");
const { loadFixture } = await import("@qdic-topology/fixtures");
const { mountApp } = await import("./testFrame");
const { appInput, fixtureModel } = await import("./fixtureModel");
const { t } = await import("./strings/index");

const LANGS: Lang[] = ["en", "ja"];
const TYPES = { t0: { label: "T0", rank: 0 } };
const NODES = [
  { id: "n0", type: "t0" },
  { id: "n1", type: "t0" },
];
// why: the Givens table — the `codes.test.ts` case inputs (`graphCase`) of the 10 other codes
const graph = (extra: Record<string, unknown>) =>
  appInput({ types: TYPES, nodes: NODES, ...extra });
const CASES: Record<string, () => AppInput> = {
  "glyph-rejected": () =>
    graph({ types: { t0: { ...TYPES.t0, glyph: "M0 0 <x>" } } }),
  "color-rejected": () =>
    graph({ types: { t0: { ...TYPES.t0, color: "c".repeat(65) } } }),
  "rank-rejected": () => graph({ types: { t0: { ...TYPES.t0, rank: 7 } } }),
  "layout-rejected": () => graph({ view: { layout: "radial" } }),
  "budget-rejected": () => graph({ view: { budget: 30 } }),
  "schema-version-unknown": () => graph({ schemaVersion: "2" }),
  "inferred-rejected": () =>
    graph({ nodes: [{ ...NODES[0], _inferred: "yes" }, NODES[1]] }),
  "unknown-key": () => graph({ title: "t" }),
  "reveal-not-found": () => graph({ view: { root: "n0", reveal: ["n9"] } }),
  "field-rejected": () =>
    graph({ nodes: [{ ...NODES[0], label: 5 }, NODES[1]] }),
};
const ROWS = { nodes: [{ from: "a", to: "b" }] };
// why: the Givens table — the 17 warning codes with their sources and counts
const GIVENS: [string, () => AppInput, Record<string, number>][] = [
  [
    "s-access",
    () => fixtureModel("s-access"),
    { "dangling-edge": 9, "constraint-violation": 2 },
  ],
  ["s-noid-some", () => fixtureModel("s-noid-some"), { "no-id": 2 }],
  [
    "s-dirty",
    () => fixtureModel("s-dirty"),
    { "duplicate-id": 1, "unknown-type": 1 },
  ],
  ["s-badroot", () => fixtureModel("s-badroot"), { "root-not-found": 1 }],
  ["rows", () => appInput(ROWS), { "shaped-from": 1 }],
  ...Object.entries(CASES).map(
    ([code, given]): [string, () => AppInput, Record<string, number>] => [
      code,
      given,
      { [code]: 1 },
    ],
  ),
];

const text = (el: Element | null | undefined) => el?.textContent ?? "";
const plain = (s: string) => s.replace(/`([^`]+)`/g, "$1");
const chip = (root: Element) =>
  root.querySelector(".status-stack .data-notice");
const click = (el: Element | null | undefined) =>
  void act(() => (el as HTMLElement).click());
const expand = (root: Element) =>
  click(chip(root)?.querySelector(".dn-toggle"));
const lines = (root: Element) =>
  [...(chip(root)?.querySelectorAll(".dn-body li") ?? [])].map(text);
const aiTexts = (root: Element) =>
  [...(chip(root)?.querySelectorAll(".notice-ai p:not(.notice-h)") ?? [])].map(
    text,
  );
const header = (root: Element) => text(chip(root)?.querySelector(".dn-toggle"));
const scopeMenu = (root: Element) => {
  const button = root.querySelector(".controls .ctl-btn") as HTMLElement;
  if ((button.nextElementSibling as HTMLElement).hidden) click(button);
  return button.nextElementSibling as HTMLElement;
};
const reopenItem = (menu: Element) =>
  [...menu.querySelectorAll('[role="menuitem"]')].find(
    (item) => text(item) === t("en", "chip.reopen"),
  );

describe("S1 the 17 warning codes in the chip", () => {
  it.each(
    LANGS.flatMap((lang) =>
      GIVENS.map(([key, given, codes]) => [key, lang, given, codes] as const),
    ),
  )("%s in %s", async (_key, lang, given, codes) => {
    const input = given();
    const frame = await mountApp(input, { lang });
    expect(chip(frame.root)?.getAttribute("data-state")).toBe("collapsed");
    expand(frame.root);
    expect(chip(frame.root)?.getAttribute("data-state")).toBe("expanded");
    for (const [code, count] of Object.entries(codes)) {
      const entry = input.ok && input.warnings.find((w) => w.code === code);
      expect(entry && entry.count).toBe(count);
      const info: Info =
        code === "shaped-from" ? { count, kind: "rows" } : { count };
      const notice = noticeText(code, info, lang);
      expect(lines(frame.root)).toContain(plain(notice.body));
      if (notice.ai !== "")
        expect(aiTexts(frame.root)).toContain(plain(notice.ai));
      expect(notice.actions).toEqual(["copy"]);
    }
    const copy = chip(frame.root)?.querySelector(".dn-body .btn");
    expect(text(copy)).toBe(t(lang, "action.copy"));
    if ("shaped-from" in codes && lang === "en")
      expect(lines(frame.root).join("\n")).toContain("a list of flat rows");
  });
});

describe("S8, S9 and S26 the chip header and lines", () => {
  it("S8 s-noid-some", async () => {
    const input = fixtureModel("s-noid-some");
    const frame = await mountApp(input);
    expect(header(frame.root)).toBe("3 records left out of this chart");
    expand(frame.root);
    const engine = dataNoticeLines(input.ok ? input.warnings : [], "en");
    expect(engine).toHaveLength(2);
    expect(lines(frame.root)).toEqual(engine.map(plain));
    expect(aiTexts(frame.root)).toHaveLength(1);
    expect(text(chip(frame.root)?.querySelector(".dn-body > p"))).toBe(
      t("en", "chip.intro"),
    );
  });

  it("S9 (a) s-access", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    expect(header(frame.root)).toBe("9 records left out of this chart");
    expand(frame.root);
    expect(lines(frame.root)).toEqual([
      plain(noticeText("dangling-edge", { count: 9 }, "en").body),
      plain(noticeText("constraint-violation", { count: 2 }, "en").body),
    ]);
    expect(new Set(aiTexts(frame.root)).size).toBe(2);
  });

  it("S9 (b) s-many-preds", async () => {
    const frame = await mountApp(fixtureModel("s-many-preds"));
    expect(header(frame.root)).toBe("9 warnings in this result");
    expand(frame.root);
    expect(lines(frame.root)).toEqual([
      plain(noticeText("unknown-type", { count: 3 }, "en").body),
      plain(noticeText("constraint-violation", { count: 6 }, "en").body),
    ]);
    expect(new Set(aiTexts(frame.root)).size).toBe(2);
    expect(chip(frame.root)?.querySelector(".dn-body > p")).toBeNull();
  });

  it("S26 one warning and no skip code", async () => {
    const input = appInput({
      nodes: [{ id: "a", type: "zz_custom", label: "A" }],
      edges: [],
    });
    expect(input.ok && input.warnings).toEqual([
      { code: "unknown-type", count: 1, ids: expect.any(Array) as unknown },
    ]);
    const frame = await mountApp(input);
    expect(header(frame.root)).toBe("1 warning in this result");
    const ja = await mountApp(input, { lang: "ja" });
    expect(header(ja.root)).toBe(t("ja", "chip.warnings", { count: 1 }));
  });
});

describe("S10 the chip copy and dismiss", () => {
  it("copies catalog text only and shows again for a new input", async () => {
    const frame = await mountApp(fixtureModel("s-noid-some"));
    expand(frame.root);
    click(chip(frame.root)?.querySelector(".dn-body .btn"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(frame.calls).toHaveLength(1);
    const copied = frame.calls[0].arg.split("\n");
    expect(copied[0]).toBe(t("en", "chip.copyHead"));
    expect(copied.slice(1, 3)).toEqual([
      `- ${noticeText("no-id", { count: 2 }, "en").body}`,
      `- ${noticeText("dangling-edge", { count: 1 }, "en").body}`,
    ]);
    expect(copied[3]).toBe(
      `How to fix it: ${noticeText("no-id", { count: 2 }, "en").ai}`,
    );
    expect(copied).toHaveLength(4);
    const raw = JSON.stringify(loadFixture("s-noid-some").input);
    const values = [...raw.matchAll(/"(?:id|label)":"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(frame.calls[0].arg).not.toContain(value);
    click(chip(frame.root)?.querySelector(".dn-head .icon-btn"));
    expect(chip(frame.root)).toBeNull();
    await frame.update({ input: fixtureModel("s-dirty") });
    expect(chip(frame.root)?.getAttribute("data-state")).toBe("collapsed");
    expand(frame.root);
    const dirty = {
      "no-id": 1,
      "duplicate-id": 1,
      "dangling-edge": 3,
      "unknown-type": 1,
    };
    expect(lines(frame.root)).toEqual(
      Object.entries(dirty).map(([code, count]) =>
        plain(noticeText(code, { count }, "en").body),
      ),
    );
  });
});

describe("S20 the Scope-menu reopen item", () => {
  it("shows only while the chip is dismissed and has an entry", async () => {
    const frame = await mountApp(fixtureModel("s-noid-some"));
    expect(reopenItem(scopeMenu(frame.root))).toBeUndefined();
    click(scopeMenu(frame.root).previousElementSibling);
    click(chip(frame.root)?.querySelector(".dn-head .icon-btn"));
    expect(chip(frame.root)).toBeNull();
    const menu = scopeMenu(frame.root);
    const item = reopenItem(menu);
    expect(item?.className).toBe("menu-item");
    expect(menu.lastElementChild).toBe(item);
    click(item);
    expect(menu.hidden).toBe(true);
    expect(chip(frame.root)?.getAttribute("data-state")).toBe("collapsed");
    expect(reopenItem(scopeMenu(frame.root))).toBeUndefined();
    await frame.update({ input: fixtureModel("s-empty") });
    expect(chip(frame.root)).toBeNull();
    expect(reopenItem(scopeMenu(frame.root))).toBeUndefined();
    expect(frame.calls).toEqual([]);
  });
});

describe("S25 a backtick span", () => {
  it("is a code element made from a text node", async () => {
    const frame = await mountApp(fixtureModel("s-noid-some"));
    expand(frame.root);
    const line = chip(frame.root)?.querySelector(".dn-body li");
    const code = line?.querySelector("code");
    expect(text(code)).toBe("id");
    expect([...(code?.childNodes ?? [])].map((n) => n.nodeType)).toEqual([
      Node.TEXT_NODE,
    ]);
    expect(text(frame.root)).not.toContain("`");
  });
});
