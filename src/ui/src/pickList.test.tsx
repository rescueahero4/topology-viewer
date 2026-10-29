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
const { profile } = await import("@qdic-topology/contract");
const { kindItems, predicateItems } = await import("./pickItems");
const state = await import("./state");

const catalog = () => f.opened(mountApp, appInput(datasets.catalog.graph));
const active = () => state.editHistory.value.history.active();
const options = (root: Element) => [
  ...root.querySelectorAll<HTMLElement>(".cell-edit [role=option]"),
];
const names = (root: Element) =>
  options(root).map((el) => f.text(el.querySelector(".nm")));
const combo = (root: Element) =>
  root.querySelector<HTMLInputElement>(".cell-edit input[role=combobox]");
// why: the cell text without the `.prov` tag of the Kind and the Predicate cells
const plain = (el: Element | null | undefined) =>
  f.text(el).replace(/\[[^\]]*\]$/, "");
const INVERSES = ["partOf", "narrower", "follows", "producedBy"];

// why: an edge row of the `contains` predicate of `t_FCT_REVENUE`, found by the Workbench search
async function edgeCell(column: string) {
  const frame = await catalog();
  f.search(frame.root, "t_FCT_REVENUE");
  const edge = f.rows(frame.root).find((tr) => f.text(tr).includes("contains"));
  const cell = edge?.children[f.heads(frame.root).indexOf(column)];
  if (cell === undefined) throw new Error("no edge cell");
  return { ...frame, cell, edge: edge as HTMLElement };
}

describe("S1 the items of the Kind and the Predicate list", () => {
  const input = appInput(datasets.catalog.graph);
  if (!input.ok) throw new Error("fatal");
  const { graph } = input.model;

  it("lists the 26 system types first, then the data types not in the profile", () => {
    const kinds = kindItems(profile, graph);
    const system = Object.keys(profile.nodeTypes);
    expect(system).toHaveLength(26);
    expect(kinds.slice(0, 26)).toEqual(system);
    const data = [
      ...new Set(
        graph.records.flatMap((r) => (r.type === undefined ? [] : [r.type])),
      ),
    ].filter((type) => !system.includes(type));
    expect(kinds.slice(26)).toEqual(data);
  });

  it("lists the 22 canonical predicates first, then the data predicates; no inverse name", () => {
    const predicates = predicateItems(profile, graph);
    const system = Object.keys(profile.predicates);
    expect(system).toHaveLength(22);
    expect(predicates.slice(0, 22)).toEqual(system);
    const data = [...new Set(graph.triples.map((t) => t.predicate))].filter(
      (p) => !system.includes(p) && !INVERSES.includes(p),
    );
    expect(predicates.slice(22)).toEqual(data);
    for (const inverse of INVERSES) expect(predicates).not.toContain(inverse);
  });
});

describe("S2 S3 S4 the Kind list", () => {
  it("opens with the old kind and the items; ArrowDown and Enter save the active item", async () => {
    const { root } = await catalog();
    f.search(root, "t_FCT_REVENUE");
    f.dblclick(f.cellOf(root, "t_FCT_REVENUE", "Kind"));
    expect(combo(root)?.value).toBe("table");
    expect(
      root
        .querySelector(".cell-edit [role=listbox]")
        ?.getAttribute("aria-label"),
    ).toBe("Kinds");
    expect(options(root)).toHaveLength(
      kindItems(profile, state.editedGraph.value!).length,
    );
    f.type(combo(root), "vie");
    f.key(combo(root), "ArrowDown");
    const id = combo(root)?.getAttribute("aria-activedescendant");
    expect(root.ownerDocument.getElementById(id ?? "")?.textContent).toBe(
      "View",
    );
    f.key(combo(root), "Enter");
    expect(plain(f.cellOf(root, "t_FCT_REVENUE", "Kind"))).toBe("View");
    expect(active()).toHaveLength(1);
  });

  it("saves free text as a new custom type", async () => {
    const { root } = await catalog();
    f.search(root, "t_FCT_REVENUE");
    f.dblclick(f.cellOf(root, "t_FCT_REVENUE", "Kind"));
    f.type(combo(root), "data_contract");
    f.key(combo(root), "Enter");
    const kind = f.cellOf(root, "t_FCT_REVENUE", "Kind");
    expect(f.text(kind.querySelector(".prov"))).toBe("[custom]");
    expect(plain(kind)).toBe("DCData contract");
  });
});

describe("S6 S6b the checks of the free text", () => {
  it("blocks an inverse name and has no inverse item", async () => {
    const { root, cell } = await edgeCell("Predicate");
    f.dblclick(cell);
    for (const inverse of INVERSES) expect(names(root)).not.toContain(inverse);
    f.type(combo(root), "partOf");
    f.key(combo(root), "Enter");
    expect(f.message(root)).toBe(
      "This is an inverse name. Use the canonical predicate.",
    );
    expect(active()).toHaveLength(0);
  });

  it("gives empty for an empty Kind and an empty Predicate", async () => {
    const { root, cell } = await edgeCell("Predicate");
    f.dblclick(cell);
    f.type(combo(root), "");
    f.key(combo(root), "Enter");
    expect(f.message(root)).toBe("Type a value. This cell cannot be empty.");
    f.key(combo(root), "Escape");
    expect(plain(cell)).toBe("contains");
    f.dblclick(f.cellOf(root, "t_FCT_REVENUE", "Kind"));
    f.type(combo(root), "  ");
    f.key(combo(root), "Enter");
    expect(f.message(root)).toBe("Type a value. This cell cannot be empty.");
    expect(active()).toHaveLength(0);
  });
});

describe("S7 S5 a Predicate edit", () => {
  it("saves a picked item and a free-text predicate in the Custom family", async () => {
    const { root, edge } = await edgeCell("Name");
    const at = (name: string) => edge.children[f.heads(root).indexOf(name)];
    f.dblclick(at("Name"));
    f.type(combo(root), "derivedFrom");
    f.key(combo(root), "ArrowDown");
    f.key(combo(root), "Enter");
    expect([plain(at("Name")), plain(at("Predicate"))]).toEqual([
      "derivedFrom",
      "derivedFrom",
    ]);
    f.dblclick(at("Predicate"));
    f.type(combo(root), "reviewedBy");
    f.key(combo(root), "Enter");
    expect(f.text(at("Family"))).toBe("Custom");
    f.dblclick(at("Predicate"));
    expect(names(root)).toContain("reviewedBy");
  });
});

describe("S12 the list keys and a press on an item", () => {
  it("moves aria-activedescendant and saves the pressed item", async () => {
    const { root } = await catalog();
    f.search(root, "t_FCT_REVENUE");
    f.dblclick(f.cellOf(root, "t_FCT_REVENUE", "Kind"));
    for (let i = 0; i < 3; i++) f.key(combo(root), "ArrowDown");
    f.key(combo(root), "ArrowUp");
    expect(combo(root)?.getAttribute("aria-activedescendant")).toBe(
      options(root)[1].id,
    );
    expect(options(root)[1].getAttribute("aria-selected")).toBe("true");
    const picked = f.text(options(root)[4].querySelector(".nm"));
    f.click(options(root)[4]);
    expect(plain(f.cellOf(root, "t_FCT_REVENUE", "Kind"))).toBe(picked);
  });
});
