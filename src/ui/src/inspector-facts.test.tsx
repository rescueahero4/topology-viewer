// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "./canvas/index";

// why: STORY-004-04 S6, S7, S10-S12, S14 (the story file names one test file; the SA §5 limit of
// 400 lines puts these rows here)
process.env.TZ = "UTC";

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

const canvas = () => spy.canvases[spy.canvases.length - 1];
const text = (el: Element | null | undefined) => el?.textContent ?? "";

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const card = (root: Element) => root.querySelector(".inspector") as HTMLElement;
const lists = (root: Element) => [
  ...card(root).querySelectorAll(".facts > dl"),
];
const names = (dl: Element) =>
  [...dl.querySelectorAll("dt")].map((dt) => dt.firstChild?.textContent ?? "");
function cell(dl: Element, name: string): HTMLElement {
  const dt = [...dl.querySelectorAll("dt")].find(
    (el) => el.firstChild?.textContent === name,
  );
  if (dt === undefined) throw new Error(`no row ${name}`);
  return dt.nextElementSibling as HTMLElement;
}
const values = (dd: Element) => [...dd.querySelectorAll(".val")].map(text);
const more = (root: Element) =>
  card(root).querySelector<HTMLButtonElement>(".facts-more");
function tipOf(root: Element, anchor: Element): string {
  void act(() => void anchor.dispatchEvent(new MouseEvent("mouseenter")));
  const tip = text(root.querySelector('[role="tooltip"]'));
  void act(() => void anchor.dispatchEvent(new MouseEvent("mouseleave")));
  return tip;
}
const node = (id: string, attrs: Record<string, unknown>, type = "table") => ({
  id,
  type,
  label: id.toUpperCase(),
  attrs,
});

describe("S6 the Physical name slot from each source (SA §6 row 14)", () => {
  it("fills the slot from physical_name, physicalName, table_name and a fields mapping", async () => {
    const raw = {
      nodes: [
        node("p1", { physical_name: "ONE", logical_name: "x" }),
        node("p2", { physicalName: "TWO", logical_name: "x" }),
        node("p3", { table_name: "THREE", logical_name: "x" }),
        node("p4", { col_header: "FOUR", logical_name: "x" }),
      ],
      edges: [],
      fields: { col_header: { slot: "physical_name", why: "header" } },
      view: { approach: "active", root: "p1" },
    };
    const { root } = await mountApp(appInput(raw));
    const read = (id: string) => {
      run(() => canvas().focus(id));
      return cell(lists(root)[0], "Physical name");
    };
    expect(values(read("p1"))).toEqual(["ONE"]);
    expect(values(read("p2"))).toEqual(["TWO"]);
    expect(values(read("p3"))).toEqual(["THREE"]);
    const mapped = read("p4");
    expect(values(mapped)).toEqual(["FOUR"]);
    const mark = mapped.querySelector(".ai-mark");
    expect(mark).not.toBeNull();
    expect(tipOf(root, mark as Element)).toBe(
      "Field matched by the AI client: header",
    );
    expect(read("p1").querySelector(".ai-mark")).toBeNull();
  });
});

describe("S7 Other attributes", () => {
  const raw = {
    nodes: [
      node("t7", {
        definition: "d",
        steward: "s",
        stewards: ["s1", "s2"],
        ext_name: "e",
        stats_count: 5,
        _private: "p",
        asset_type: "table",
        is_lost: false,
        logical_name: "x",
        u1: "1",
        u2: "2",
        u3: "3",
        u4: "4",
        constructor: "c",
        toString: "t",
      }),
      node("t8", {}),
    ],
    edges: [{ subject: "t7", predicate: "contains", object: "t8" }],
    fields: { u1: { label: "U one", why: "column header" } },
    view: { approach: "active", root: "t7" },
  };
  const ALL = [
    "Definition",
    "Steward",
    "Stewards",
    "Ext name",
    "Stats count",
    "U one",
    "U2",
    "U3",
    "U4",
    "Constructor",
    "To string",
  ];

  it("lists 11 keys, caps them at 6 and closes on a new selection", async () => {
    const { root } = await mountApp(appInput(raw));
    expect(card(root).querySelector(".facts")?.getAttribute("data-state")).toBe(
      "catalog",
    );
    const other = () => lists(root)[1];
    expect(names(other())).toEqual(ALL.slice(0, 6));
    expect(text(more(root))).toBe("Show 5 more");
    expect(more(root)?.getAttribute("aria-expanded")).toBe("false");
    void act(() => more(root)?.click());
    expect(names(other())).toEqual(ALL);
    expect(text(more(root))).toBe("Show less");
    expect(values(cell(other(), "Constructor"))).toEqual(["c"]);
    expect(values(cell(other(), "To string"))).toEqual(["t"]);
    expect(cell(other(), "Stewards").textContent).toBe("s1, s2");
    const dts = [...other().querySelectorAll("dt")];
    const marked = dts.filter((dt) => dt.querySelector(".ai-mark") !== null);
    expect(marked.map((dt) => dt.firstChild?.textContent)).toEqual(["U one"]);
    expect(tipOf(root, marked[0].querySelector(".ai-mark") as Element)).toBe(
      "Label from the AI client: column header",
    );
    expect(text(card(root))).not.toContain("function");
    // why: rule 1 — the card shows a focused node at once, before the motion that draws it ends
    void act(() => canvas().focus("t8"));
    expect(text(card(root).querySelector(".insp-title strong"))).toBe("T8");
    run(() => {});
    expect(card(root).querySelector(".facts-more")).toBeNull();
    run(() => canvas().focus("t7"));
    expect(names(other())).toEqual(ALL.slice(0, 6));
    expect(text(more(root))).toBe("Show 5 more");
  });
});

describe("S10 and S11 type description, built-in, retired and writability", () => {
  it("S10 shows the description of a custom type", async () => {
    const { root } = await mountApp(fixtureModel("q-spec-scenarios"));
    run(() => canvas().focus("node-2c9b"));
    expect(text(card(root).querySelector(".insp-title strong"))).toBe(
      "Jane Doe",
    );
    expect(text(card(root).querySelector(".type-desc"))).toBe(
      "A person designated as accountable for a data asset.",
    );
  });

  it("S10 gives built-in in the tip of a built-in type", async () => {
    const { root } = await mountApp(fixtureModel("q-full-vocabulary"));
    run(() => canvas().focus("node-class-pii"));
    const type = cell(lists(root)[0], "Type");
    expect(type.firstChild?.textContent).toBe("Classification");
    expect(tipOf(root, type.firstElementChild as Element)).toBe("built-in");
    expect(type.querySelector(".status")).toBeNull();
  });

  it("S10 marks a retired type", async () => {
    const raw = {
      nodes: [node("o", {}, "old_type")],
      edges: [],
      vocabulary: { nodeTypes: [{ name: "old_type", is_active: false }] },
      view: { approach: "active", root: "o" },
    };
    const { root } = await mountApp(appInput(raw));
    const type = cell(lists(root)[0], "Type");
    expect(text(type.querySelector(".status"))).toBe("retired");
    expect(type.querySelector("[tabindex]")).toBeNull();
  });

  it("S11 reads the write access of tbl-orders and node-class-pii", async () => {
    const { root } = await mountApp(fixtureModel("q-full-vocabulary"));
    run(() => canvas().focus("tbl-orders"));
    expect(text(card(root).querySelector(".insp-title strong"))).toBe("ORDERS");
    expect(names(lists(root)[0]).slice(0, 2)).toEqual(["Type", "Write access"]);
    expect(text(cell(lists(root)[0], "Write access"))).toBe(
      "read-only in QDIC",
    );
    run(() => canvas().focus("node-class-pii"));
    expect(text(cell(lists(root)[0], "Write access"))).toBe("writable");
  });
});

describe("S12 generic mode", () => {
  const raw = {
    nodes: [
      {
        id: "sup",
        type: "supplier",
        label: "SUP",
        attrs: {
          ...{ a: "1", b: "2", c: "3", d: "4", e: "5", f: "6", g: "7" },
          description: "A supplier",
          _inferred: { description: "summarised" },
          ...{ service_name: "erp", name: "n", _x: "x", is_lost: false },
        },
      },
      node("tm", { mail: "x@acme.example" }),
    ],
    edges: [{ subject: "sup", predicate: "relatedTo", object: "tm" }],
    fields: {
      a: { label: "Cost centre", why: "column header" },
      mail: { slot: "owners" },
    },
    view: { approach: "active", root: "sup" },
  };

  it("caps the Type row and the key/value rows at 6 and shows the description", async () => {
    const { root } = await mountApp(appInput(raw));
    expect(card(root).querySelector(".facts")?.getAttribute("data-state")).toBe(
      "generic",
    );
    const list = () => lists(root)[0];
    expect(names(list())).toEqual(["Type", "Cost centre", "B", "C", "D", "E"]);
    expect(text(more(root))).toBe("Show 2 more");
    void act(() => more(root)?.click());
    expect(names(list())).toEqual([
      ...["Type", "Cost centre", "B", "C", "D", "E", "F", "G"],
    ]);
    const label = list().querySelectorAll("dt")[1].querySelector(".ai-mark");
    expect(tipOf(root, label as Element)).toBe(
      "Label from the AI client: column header",
    );
    expect(lists(root)).toHaveLength(1);
    const blurb = card(root).querySelector(".blurb");
    expect(blurb?.lastChild?.textContent).toBe("A supplier");
    const mark = blurb?.querySelector(".ai-mark");
    expect(tipOf(root, mark as Element)).toBe(
      "Inferred by the AI client: summarised",
    );
  });

  it("gives a mapping with no why the fallback text", async () => {
    const { root } = await mountApp(appInput(raw));
    run(() => canvas().focus("tm"));
    const owners = cell(lists(root)[0], "Owners");
    expect(values(owners)).toEqual(["x@acme.example"]);
    expect(tipOf(root, owners.querySelector(".ai-mark") as Element)).toBe(
      "Field matched by the AI client: Mapped to this field by the AI client",
    );
  });
});

describe("S14 link values and object values", () => {
  const long = `https://a.example/${"p".repeat(2982)}`;
  const spaced = `https://a.example/${" x".repeat(700)}y`;
  function nested(level: number): Record<string, unknown> {
    return level === 0 ? { end: true } : { a: nested(level - 1) };
  }
  const big = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`k${i}`, "v".repeat(100)]),
  );
  const raw = {
    nodes: [
      node("l", {
        logical_name: "x",
        ext_url: [
          "javascript:alert(1)",
          "data:text/html,x",
          "HTTPS://example.com/a",
          "//example.com",
          "https://a.example@b.example/",
          long,
          spaced,
        ],
        deep: nested(10),
        big,
      }),
    ],
    edges: [],
    view: { approach: "active", root: "l" },
  };

  it("gives a button only for the safe http(s) value and opens its href", async () => {
    expect(long).toHaveLength(3000);
    expect(spaced).toHaveLength(1419);
    expect(new URL(spaced).href.length).toBe(2819);
    const { root, calls } = await mountApp(appInput(raw));
    const link = cell(lists(root)[0], "Link");
    expect(values(link)).toEqual([
      "javascript:alert(1)",
      "data:text/html,x",
      "https://example.com/a",
      "//example.com",
      "https://a.example@b.example/",
      long,
      spaced,
    ]);
    const buttons = card(root).querySelectorAll<HTMLButtonElement>(".link-btn");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].previousElementSibling?.textContent).toBe(
      "https://example.com/a",
    );
    for (const button of buttons) void act(() => button.click());
    expect(calls).toEqual([{ name: "openLink", arg: "https://example.com/a" }]);
  });

  it("shows an object as bounded JSON text to depth 4", async () => {
    const { root } = await mountApp(appInput(raw));
    const other = lists(root)[1];
    expect(text(cell(other, "Deep"))).toBe('{"a":{"a":{"a":{"a":…}}}}');
    const cut = text(cell(other, "Big"));
    expect(cut).toHaveLength(1000);
    expect(cut.startsWith(`{"k0":"${"v".repeat(100)}","k1"`)).toBe(true);
    expect(cut.endsWith("…")).toBe(true);
  });
});
