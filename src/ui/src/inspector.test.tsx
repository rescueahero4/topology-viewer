// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Canvas } from "./canvas/index";

// why: test plan — the time zone is UTC and the locale `en-US` (testFrame default)
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
const { typeMark } = await import("@qdic-topology/renderer");
const state = await import("./state");

const canvas = () => spy.canvases[spy.canvases.length - 1];
const text = (el: Element | null | undefined) => el?.textContent ?? "";

// why: a canvas method, then the frames of its motion
function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

const card = (root: Element) => root.querySelector(".inspector") as HTMLElement;
const label = (dt: Element) => dt.firstChild?.textContent ?? "";

// why: the label text of each row (its first text node, before an AI mark) and its value cell
function rows(scope: Element): [string, HTMLElement][] {
  return [...scope.querySelectorAll("dt")].map((dt) => [
    label(dt),
    dt.nextElementSibling as HTMLElement,
  ]);
}
function cell(scope: Element, name: string): HTMLElement {
  const found = rows(scope).find(([n]) => n === name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return found[1];
}
const values = (dd: Element) =>
  [...dd.querySelectorAll(".val, .tag-chip")].map(text);
const mainList = (root: Element) =>
  card(root).querySelector(".facts > dl") as HTMLElement;

describe("S1 and S2 the card at first paint", () => {
  it("S1 opens expanded on the Active root with the table mark and the badge", async () => {
    const input = fixtureModel("s-access");
    const { root } = await mountApp(input);
    expect(card(root).dataset.state).toBe("expanded");
    expect(root.querySelector(".canvas")?.getAttribute("data-inspector")).toBe(
      "expanded",
    );
    expect(text(card(root).querySelector(".insp-title strong"))).toBe(
      "FCT_REVENUE",
    );
    expect(text(card(root).querySelector(".sys-badge"))).toBe("Snowflake");
    if (!input.ok) throw new Error("fatal");
    const { vocab } = input.model;
    const mark = typeMark(vocab.types.get("table")?.visual ?? null, 16, null);
    expect(card(root).querySelector(".insp-title .glyph svg")?.outerHTML).toBe(
      mark.outerHTML,
    );
    expect(text(card(root).querySelector(".root-pill"))).toBe("ROOT");
    expect(rows(card(root)).map(([n]) => n)).not.toContain("Write access");
  });

  it("S2 shows the empty line on a Passive first view", async () => {
    const { root } = await mountApp(fixtureModel("q-full-vocabulary"));
    expect(card(root).dataset.state).toBe("empty");
    expect(text(card(root))).toBe("Click a node to inspect it");
    expect(card(root).querySelector(".insp-body")).toBeNull();
  });
});

describe("S3 the catalog metadata of s-access", () => {
  it("lists the 13 slots in profile order with their values", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const list = mainList(root);
    expect(card(root).querySelector(".facts")?.getAttribute("data-state")).toBe(
      "catalog",
    );
    expect(rows(list).map(([n]) => n)).toEqual([
      "Type",
      "Physical name",
      "Logical name",
      "Description",
      "Owners",
      "Tags",
      "Path",
      "Data source",
      "Parent owners",
      "Data type",
      "DDL comment",
      "Asset groups",
      "Updated",
      "Link",
    ]);
    expect(text(cell(list, "Type"))).toBe("Table");
    expect(values(cell(list, "Physical name"))).toEqual(["FCT_REVENUE"]);
    expect(values(cell(list, "Logical name"))).toEqual(["Revenue fact"]);
    expect(text(cell(list, "Owners"))).toBe(
      "Aiko Tanaka, Hana Costa, Mateo Novak",
    );
    const tags = cell(list, "Tags").querySelectorAll(".tag-chip");
    expect([...tags].map(text)).toEqual([
      "Confidential",
      "Finance / Revenue",
      "Sales",
      "Revenue",
      "SOX",
    ]);
    expect(text(cell(list, "Path"))).toBe(
      "Snowflake · ACME prod › ANALYTICS › ANALYTICS.MARTS › FCT_REVENUE",
    );
    expect(text(cell(list, "Data source"))).toBe(
      "Snowflake · ACME prod, snowflake",
    );
    expect(text(cell(list, "Parent owners"))).toBe("—");
    expect(text(cell(list, "Data type"))).toBe("—");
    expect(cell(list, "Data type").className).toBe("empty");
    expect(text(cell(list, "DDL comment"))).toBe(
      "fact table – revenue lines (USD)",
    );
    expect(text(cell(list, "Asset groups"))).toBe(
      "Finance domain, Regulated data, Executive reporting",
    );
    expect(text(cell(list, "Updated"))).toBe("Sep 27, 2026");
    const link = cell(list, "Link");
    expect(values(link)).toEqual([
      "https://snowflake.example/ap-northeast-1/acme/#/data/databases/ANALYTICS/schemas/MARTS/table/FCT_REVENUE",
    ]);
    expect(card(root).querySelectorAll(".link-btn")).toHaveLength(1);
    expect(text(link.querySelector(".link-btn"))).toBe("Open in source ↗");
  });

  it("shows the keys that no slot reads under Other attributes", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    expect(text(card(root).querySelector(".facts-sub"))).toBe(
      "Other attributes",
    );
    const other = card(root).querySelectorAll(".facts > dl")[1];
    expect(rows(other).map(([n]) => n)).toEqual([
      "Refresh cadence",
      "Row count",
      "Clustering key",
    ]);
    expect(text(cell(other, "Row count"))).toBe("1284003");
  });
});

describe("S4 and S5 the AI marks and the link of s-vocab-meta", () => {
  const tipOf = (root: Element, mark: Element) => {
    void act(() => (mark as HTMLElement).focus());
    const tip = text(root.querySelector('[role="tooltip"]'));
    void act(() => (mark as HTMLElement).blur());
    return tip;
  };

  it("S4 shows the marks, the source-system text, the date and the link", async () => {
    const { root } = await mountApp(fixtureModel("s-vocab-meta"));
    const list = mainList(root);
    expect(values(cell(list, "Physical name"))).toEqual(["invoices"]);
    const logical = cell(list, "Logical name");
    expect(values(logical)).toEqual(["Customer invoices"]);
    const marks = logical.querySelectorAll(".ai-mark");
    expect(marks).toHaveLength(1);
    expect(tipOf(root, marks[0])).toBe(
      "Inferred by the AI client: Named from the table and its schema",
    );
    const owners = cell(list, "Owners");
    expect(values(owners)).toEqual(["Aiko Tanaka", "mika.sato@acme.example"]);
    const mapped = owners.querySelectorAll(".ai-mark");
    expect(mapped).toHaveLength(1);
    expect(mapped[0].previousElementSibling?.textContent).toBe(
      "mika.sato@acme.example",
    );
    expect(tipOf(root, mapped[0])).toBe(
      "Field matched by the AI client: An e-mail of the person responsible reads as the steward",
    );
    const ddl = cell(list, "DDL comment");
    expect(text(ddl.querySelector(".src"))).toBe("from the source system");
    expect(text(cell(list, "Updated"))).toBe("Sep 27, 2025");
    expect(values(cell(list, "Link"))).toEqual([
      "https://console.cloud.google.com/bigquery",
    ]);
    expect(cell(list, "Link").querySelectorAll(".link-btn")).toHaveLength(1);
  });

  it("S5 opens the link only through the host port, once per press", async () => {
    const { root, calls } = await mountApp(fixtureModel("s-vocab-meta"));
    expect(calls).toEqual([]);
    expect(card(root).querySelectorAll("[href]")).toHaveLength(0);
    const button = card(root).querySelector<HTMLButtonElement>(".link-btn");
    void act(() => button?.click());
    expect(calls).toEqual([
      { name: "openLink", arg: "https://console.cloud.google.com/bigquery" },
    ]);
    void act(() => button?.click());
    expect(calls).toHaveLength(2);
    expect(card(root).querySelectorAll("[href]")).toHaveLength(0);
  });
});

describe("S8 records and the lost line", () => {
  it("lists the 4 record ids of the merged u_0", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    run(() => canvas().select("e:u_0"));
    expect(text(card(root).querySelector(".insp-title strong"))).toBe(
      "Aiko Tanaka",
    );
    expect(text(cell(mainList(root), "Records"))).toBe(
      "4 in the dataset · u_0, u_20, u_40, u_60",
    );
    expect(card(root).querySelector(".lost")).toBeNull();
  });

  it("names a lost entity", async () => {
    const raw = {
      nodes: [
        { id: "a", type: "table", label: "A", attrs: { is_lost: true } },
        { id: "b", type: "table", label: "B" },
      ],
      edges: [{ subject: "a", predicate: "contains", object: "b" }],
      view: { approach: "active", root: "a" },
    };
    const { root } = await mountApp(appInput(raw));
    expect(text(card(root).querySelector(".lost"))).toBe(
      "No longer seen by the scanner",
    );
    run(() => canvas().focus("b"));
    expect(card(root).querySelector(".lost")).toBeNull();
  });
});

describe("rule 1 a selected edge", () => {
  it("shows the anchor node of the edge", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const edge = state.frontier.value?.edges.find(
      (e) => e.subject === "e:u_0" || e.object === "e:u_0",
    );
    run(() => canvas().select("e:u_0"));
    run(() => canvas().select(edge?.key ?? ""));
    expect(state.selection.value).toEqual({ edge: edge?.key, anchor: "e:u_0" });
    expect(text(card(root).querySelector(".insp-title strong"))).toBe(
      "Aiko Tanaka",
    );
  });
});

describe("S15 the collapsed card stays collapsed", () => {
  it("keeps the user's choice across selections", async () => {
    const { root } = await mountApp(fixtureModel("s-access"));
    const toggle = () =>
      card(root).querySelector<HTMLButtonElement>(".insp-bar .icon-btn");
    expect(toggle()?.getAttribute("aria-label")).toBe("Collapse inspector");
    void act(() => toggle()?.click());
    expect(card(root).dataset.state).toBe("collapsed");
    expect(card(root).querySelector(".insp-body")).toBeNull();
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    run(() => canvas().select("e:u_0"));
    expect(text(card(root).querySelector(".insp-title strong"))).toBe(
      "Aiko Tanaka",
    );
    expect(card(root).dataset.state).toBe("collapsed");
    run(() => canvas().select("e:t_FCT_REVENUE"));
    expect(card(root).dataset.state).toBe("collapsed");
    expect(card(root).querySelector(".insp-body")).toBeNull();
    expect(toggle()?.getAttribute("aria-label")).toBe("Expand inspector");
    void act(() => toggle()?.click());
    expect(card(root).dataset.state).toBe("expanded");
    expect(card(root).querySelector(".insp-body .facts")).not.toBeNull();
  });
});
