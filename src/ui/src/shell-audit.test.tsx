// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AppInput } from "./App";
import type { Canvas } from "./canvas/index";

// why: STORY-004-04 S16 — the real canvas, kept so the test can select each hostile node
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
const { hostilePayload, shellAudit, MARKERS, EN_ONLY, enTexts } =
  await import("./shellAudit");
const { fixtures } = await import("@qdic-topology/fixtures");
const { TypeGlyph } = await import("./TypeGlyph");
const state = await import("./state");
const { en } = await import("./strings/en");
const { isKey } = await import("./strings/index");

// why: EPIC-003 success metric 1 — the 38 fixtures less the four with no first view to draw
const NOT_DRAWN = ["s-invalid", "s-not-graph", "s-noid-all", "s-stress"];
const DRAWING = Object.keys(fixtures)
  .filter((key) => !NOT_DRAWN.includes(key))
  .sort();

// why: STORY-004-03 DoD — the audits run with each menu and picker open in turn, and with the tip
// of each tab, pill, picker item and info icon shown
const TIP_ANCHORS = ".fam-tab, .pill, .pick-item, .info";
function everyPanel(root: Element, visit: () => void): void {
  visit();
  for (const button of root.querySelectorAll("[aria-haspopup]")) {
    void act(() => (button as HTMLElement).click());
    visit();
    const menu = button.nextElementSibling;
    const anchors = [
      ...root.querySelectorAll(`.catbar :is(${TIP_ANCHORS})`),
      ...(menu?.querySelectorAll(TIP_ANCHORS) ?? []),
    ];
    for (const anchor of anchors) {
      void act(() => void anchor.dispatchEvent(new MouseEvent("mouseenter")));
      visit();
      void act(() => void anchor.dispatchEvent(new MouseEvent("mouseleave")));
    }
    void act(() => (button as HTMLElement).click());
  }
}

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

describe("S14 the ja text audit", () => {
  it("covers the 34 drawing fixtures", () => {
    expect(DRAWING).toHaveLength(34);
    expect(EN_ONLY.length).toBeGreaterThan(50);
  });

  it.each(DRAWING)("%s shows no en table text in ja", async (key) => {
    const input = fixtureModel(key);
    const model = modelTexts(input);
    const frame = await mountApp(input, { lang: "ja" });
    const found = new Set<string>();
    everyPanel(frame.root, () => {
      for (const item of enTexts(frame.root, model)) found.add(item);
    });
    expect([...found]).toEqual([]);
  });

  // why: ISSUE-012 C5 (STORY-004-03 QA memo item 4) — no fixture has more than ten families, so
  // this payload with eleven makes the Families picker for the audit
  it("shows no en table text in ja with the Families picker", async () => {
    const edges = Array.from({ length: 11 }, (_, i) => ({
      subject: "a",
      predicate: `p${i}`,
      object: "b",
    }));
    const predicates = Object.fromEntries(
      edges.map((edge, i) => [edge.predicate, { category: `c${i}` }]),
    );
    const nodes = [{ id: "a" }, { id: "b" }];
    const input = appInput({ nodes, edges, predicates });
    const frame = await mountApp(input, { lang: "ja" });
    expect(frame.root.querySelector(".fam-tabs .pick-btn")).not.toBeNull();
    const found = new Set<string>();
    everyPanel(frame.root, () => {
      for (const item of enTexts(frame.root, modelTexts(input)))
        found.add(item);
    });
    expect([...found]).toEqual([]);
  });

  // why: QA plants x17 and x18 — an `en` word of the tables in the Types button or the Layout
  // heading, or in a `code` element outside a notice, is found
  it("finds an en table word outside the code of a notice", async () => {
    const input = fixtureModel("s-access");
    const frame = await mountApp(input, { lang: "ja" });
    const model = modelTexts(input);
    const audit = () => enTexts(frame.root, model);
    expect(audit()).toEqual([]);
    const [, types, layout] = frame.root.querySelectorAll(".controls .ctl-btn");
    const label = [...types.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE,
    ) as Text;
    const jaLabel = label.data;
    label.data = en["types.button"];
    expect(audit()).toContain('Types in "Types"');
    label.data = jaLabel;
    void act(() => (layout as HTMLElement).click());
    const heading = layout.nextElementSibling?.querySelector(".menu-label");
    const jaHeading = heading?.textContent ?? "";
    if (heading) heading.textContent = en["layout.heading"];
    expect(audit()).toContain('Layout in "Layout"');
    if (heading) heading.textContent = jaHeading;
    const code = frame.root.ownerDocument.createElement("code");
    code.textContent = en["types.button"];
    frame.root.querySelector(".controls")?.appendChild(code);
    expect(audit()).toContain('Types in "Types"');
    code.remove();
    expect(audit()).toEqual([]);
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
    everyPanel(frame.root, () => {
      expect(shellAudit(frame.root)).toEqual([]);
      const texts = textsOf(frame.root).join("\n");
      expect(texts.includes(MARKERS[2])).toBe(true);
      expect(texts).not.toContain("function");
      expect(texts).not.toContain("[object Object]");
    });
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

// why: STORY-004-03 S16 — the hostile payload with 11 more hostile predicates, each in its own
// hostile category, so both rows of the category bar are pickers
const MORE = ["qxm031", "qxm032", "qxm033"];
function manyHostile(): unknown {
  const payload = hostilePayload() as {
    nodes: { id: string }[];
    edges: unknown[];
    predicates: Record<string, unknown>;
  };
  const [from, to] = [payload.nodes[0].id, payload.nodes[1].id];
  for (let i = 0; i < 11; i++) {
    const predicate = `${MORE[0]}"<>&javascript:${i}`;
    payload.edges.push({ subject: from, predicate, object: to });
    payload.predicates[predicate] = { category: `${MORE[1]}"<>&${i}` };
  }
  return payload;
}

function typeQuery(menu: Element, query: string): void {
  const search = menu.querySelector("input") as HTMLInputElement;
  void act(() => {
    search.value = query;
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("S16 the controls on the hostile payload (STORY-004-03)", () => {
  it("shows the prototype names as their own texts and no marker in an attribute", async () => {
    const frame = await mountApp(appInput(hostilePayload()));
    const types = frame.root.querySelectorAll(".controls .ctl-btn")[1];
    void act(() => (types as HTMLElement).click());
    const names = [
      ...(types.nextElementSibling?.querySelectorAll(".type-list .name") ?? []),
    ].map((el) => el.textContent);
    expect(names).toContain("Constructor");
    const pills = [...frame.root.querySelectorAll(".pill")];
    expect(pills.map((pill) => pill.childNodes[1]?.textContent)).toContain(
      "prototype",
    );
    const tab = [...frame.root.querySelectorAll(".fam-tab")].find(
      (el) => el.textContent === "constructor",
    );
    expect(tab?.className).toBe("fam-tab qt-fam-5");
    expect(shellAudit(frame.root)).toEqual([]);
    const texts = textsOf(frame.root).join("\n");
    expect(texts).not.toContain("function");
    expect(texts).not.toContain("[object Object]");
  });

  // why: LEARNINGS 24, 62 — 4,698 ms under full-suite load (STORY-005-02 T5); limit ≥ 2 × that
  it("keeps the pickers, the items and a hostile query out of every attribute", async () => {
    const frame = await mountApp(appInput(manyHostile()));
    const markers = [...MARKERS, ...MORE];
    const pickers = [...frame.root.querySelectorAll(".catbar .pick-btn")];
    expect(pickers).toHaveLength(2);
    everyPanel(frame.root, () => {
      expect(shellAudit(frame.root, markers)).toEqual([]);
      const texts = textsOf(frame.root).join("\n");
      expect(texts).not.toContain("function");
      expect(texts).not.toContain("[object Object]");
    });
    const query = `${MORE[2]}"<>&javascript:`;
    for (const [index, picker] of pickers.entries()) {
      void act(() => (picker as HTMLElement).click());
      const menu = picker.nextElementSibling as HTMLElement;
      const constructor = [
        ...menu.querySelectorAll(".fam-head, .pick-item"),
      ].find((el) => el.textContent?.startsWith("constructor"));
      expect(constructor?.className).toContain("qt-fam-5");
      typeQuery(menu, query);
      const empty = menu.querySelector(".pick-empty");
      expect(empty?.childNodes).toHaveLength(1);
      expect(empty?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(empty?.textContent).toContain(query);
      expect(shellAudit(frame.root, markers)).toEqual([]);
      typeQuery(menu, "prot");
      const found = [...menu.querySelectorAll(".pick-item .nm")].map(
        (el) => el.textContent,
      );
      expect(found).toEqual(index === 0 ? [] : ["prototype"]);
      void act(() => (picker as HTMLElement).click());
    }
  }, 10_000);
});

// why: STORY-004-04 S16 — every hostile entity in the card, with the tip of every AI mark (hover,
// focus and touch) and of every value and label anchor
function inspectAll(root: Element, visit: () => void): number {
  const card = root.querySelector(".inspector") as Element;
  const marks = [...card.querySelectorAll(".ai-mark")] as HTMLElement[];
  const touch = () =>
    new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true });
  for (const mark of marks) {
    void act(() => void mark.dispatchEvent(new MouseEvent("mouseenter")));
    visit();
    void act(() => void mark.dispatchEvent(new MouseEvent("mouseleave")));
    void act(() => mark.focus());
    visit();
    void act(() => mark.blur());
    void act(() => void mark.dispatchEvent(touch()));
    visit();
    void act(() => void mark.dispatchEvent(touch()));
  }
  for (const anchor of card.querySelectorAll('[tabindex="0"]:not(.ai-mark)')) {
    void act(() => void anchor.dispatchEvent(new MouseEvent("mouseenter")));
    visit();
    void act(() => void anchor.dispatchEvent(new MouseEvent("mouseleave")));
  }
  return marks.length;
}

describe("S16 the inspector on the hostile payload (STORY-004-04)", () => {
  it("shows every hostile node and AI mark with no marker in an attribute", async () => {
    const raw = hostilePayload() as {
      nodes: { id?: string; globalId?: string }[];
    };
    const ids = raw.nodes.map((n) => n.id ?? n.globalId ?? "");
    const frame = await mountApp(appInput(hostilePayload()));
    const canvas = spy.canvases[spy.canvases.length - 1];
    let marks = 0;
    for (const id of ids) {
      void act(() => canvas.focus(id));
      for (let i = 0; i < 120; i++)
        void act(() => {
          vi.advanceTimersByTime(16);
        });
      const card = frame.root.querySelector(".inspector") as HTMLElement;
      expect([id, card.dataset.state]).toEqual([id, "expanded"]);
      void act(() => card.querySelector<HTMLElement>(".facts-more")?.click());
      marks += inspectAll(frame.root, () => {
        expect(shellAudit(frame.root)).toEqual([]);
        const texts = textsOf(frame.root).join("\n");
        expect(texts).not.toContain("function");
        expect(texts).not.toContain("[object Object]");
      });
      expect(card.querySelectorAll(".link-btn")).toHaveLength(0);
    }
    expect(marks).toBeGreaterThanOrEqual(4);
    expect(frame.calls).toEqual([]);
  });
});
