// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AppInput } from "./App";

// why: STORY-003-04 fake clock, rule 15 — the clock comes before `d3-timer` loads
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
const { hostilePayload, shellAudit, MARKERS } = await import("./shellAudit");
const { fixtures } = await import("@qdic-topology/fixtures");
const { TypeGlyph } = await import("./TypeGlyph");
const state = await import("./state");
const { en } = await import("./strings/en");
const { ja } = await import("./strings/ja");
const { isKey } = await import("./strings/index");

// why: EPIC-003 success metric 1 — the 32 fixtures less the four with no first view to draw
const NOT_DRAWN = ["s-invalid", "s-not-graph", "s-noid-all", "s-stress"];
const DRAWING = Object.keys(fixtures)
  .filter((key) => !NOT_DRAWN.includes(key))
  .sort();

function textsOf(root: Element): string[] {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const texts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    texts.push(node.textContent ?? "");
  return texts;
}

// why: S14 — the literal parts of every `en` text of 4 or more characters that no `ja` text has
const jaText = Object.values(ja).join("\n");
const EN_ONLY = [
  ...new Set(
    Object.values(en)
      .flatMap((text) =>
        typeof text === "string" ? [text] : [text.one, text.other],
      )
      .flatMap((text) => text.split(/\{\w+\}/).map((part) => part.trim()))
      .filter((part) => part.length >= 4 && !jaText.includes(part)),
  ),
];

// why: S14 reads the shell texts; a model text (a label, a predicate, an attribute value, the label
// of a type that has no table name) or its middle cut (14 + "…" + 7) is data, not a shell text
function modelTexts(input: AppInput): Set<string> {
  if (!input.ok) return new Set();
  const { graph, vocab } = input.model;
  const values = graph.records.flatMap((r) => [
    r.label,
    ...Object.values(r.attrs).filter((v) => typeof v === "string"),
  ]);
  return new Set(
    [
      ...graph.entities.map((e) => e.label),
      ...values,
      ...[...vocab.predicates.values()].map((p) => p.label),
      ...[...vocab.types.values()]
        .filter((type) => !isKey(`type.${type.name}`))
        .map((type) => type.label),
    ].map((text) => text.toLowerCase()),
  );
}

function shellPart(part: string, model: Set<string>): boolean {
  const text = part.trim().toLowerCase();
  if (text === "" || model.has(text)) return false;
  const [head, tail, ...rest] = text.split("…");
  if (tail === undefined || rest.length > 0) return true;
  return ![...model].some((m) => m.startsWith(head) && m.endsWith(tail));
}

describe("S14 the ja text audit", () => {
  it("covers the 28 drawing fixtures", () => {
    expect(DRAWING).toHaveLength(28);
    expect(EN_ONLY.length).toBeGreaterThan(50);
  });

  it.each(DRAWING)("%s shows no en table text in ja", async (key) => {
    const input = fixtureModel(key);
    const model = modelTexts(input);
    const frame = await mountApp(input, { lang: "ja" });
    const found = textsOf(frame.root).flatMap((text) => {
      const shell = text
        .split(" · ")
        .filter((part) => shellPart(part, model))
        .join(" · ");
      return EN_ONLY.filter((part) => shell.includes(part)).map(
        (part) => `${part} in "${text}"`,
      );
    });
    expect(found).toEqual([]);
  });
});

describe("S15 and S29 the hostile payload", () => {
  it("gives no marker in any attribute and no prototype text", async () => {
    const input = appInput(hostilePayload());
    expect(input.ok).toBe(true);
    const frame = await mountApp(input);
    expect(
      frame.root.querySelectorAll(".qt-root .qt-node").length,
    ).toBeGreaterThan(3);
    expect(shellAudit(frame.root)).toEqual([]);
    const texts = textsOf(frame.root).join("\n");
    expect(texts.includes(MARKERS[2])).toBe(true);
    expect(texts).not.toContain("function");
    expect(texts).not.toContain("[object Object]");
  });
});

describe("S13 the type marks in the hostile payload", () => {
  it("puts no marker into an attribute", () => {
    const input = appInput(hostilePayload());
    if (!input.ok) throw new Error("fatal");
    const { vocab } = input.model;
    const root = document.createElement("div");
    document.body.appendChild(root);
    const marks = [...vocab.types.values()].map((type) => (
      <TypeGlyph
        key={type.name}
        visual={type.visual}
        size={16}
        untyped={null}
      />
    ));
    void act(() =>
      render(
        <>
          {marks}
          <TypeGlyph visual={null} size={16} untyped={vocab.untyped} />
        </>,
        root,
      ),
    );
    expect(root.querySelectorAll("svg")).toHaveLength(vocab.types.size + 1);
    expect(shellAudit(root)).toEqual([]);
    void act(() => render(null, root));
    root.remove();
  });
});

describe("S17 deep issue paths (ISSUE-005)", () => {
  const KEY = `qxmkey${"k".repeat(99_994)}`;
  function tree(depth: number): Record<string, unknown> {
    const node: Record<string, unknown> = {
      name: `n${depth}`,
      _inferred: "bad",
    };
    if (depth > 1) node[KEY] = [tree(depth - 1)];
    return node;
  }

  it("gives the App bounded warnings and no issue path", async () => {
    const input = appInput({
      ...tree(64),
      shape: { kind: "tree", children: KEY, label: "name" },
    });
    if (!input.ok) throw new Error(`fatal ${input.fatal.code}`);
    expect(Object.hasOwn(input, "issues")).toBe(false);
    const frame = await mountApp(input);
    expect(state.warnings.value.length).toBeGreaterThan(0);
    for (const entry of state.warnings.value) {
      expect(entry.ids.length).toBeLessThanOrEqual(5);
      for (const id of entry.ids) expect(id.length).toBeLessThanOrEqual(64);
    }
    expect(textsOf(frame.root).join("\n")).not.toContain("qxmkey");
    expect(shellAudit(frame.root, ["qxmkey"])).toEqual([]);
  });
});
