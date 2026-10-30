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
const state = await import("./state");

const done = () => state.editHistory.value.history.done;
const graph = () => {
  const now = state.editedGraph.value;
  if (now === null) throw new Error("no graph");
  return now;
};
const catalog = () => f.opened(mountApp, appInput(datasets.catalog.graph));
const system = (id: string) =>
  graph().records.find((r) => r.id === id)?.attrs.service_name;
// why: LEARNINGS 90 — the shared System of the test is counted from the dataset
const SNOWFLAKE = (() => {
  const input = appInput(datasets.catalog.graph);
  if (!input.ok) throw new Error("fatal");
  return input.model.graph.records
    .filter((r) => r.attrs.service_name === "snowflake")
    .map((r) => r.id);
})();

// why: S1-S4 (jsdom twin of the browser rows) — `t_SF_ACCOUNT` is row 5 of `catalog`, so the
// first window of the table holds it with no search
async function systemEdit() {
  const frame = await catalog();
  f.dblclick(f.cellOf(frame.root, "t_SF_ACCOUNT", "System"));
  f.type(f.input(frame.root), "snowflake_eu");
  f.key(f.input(frame.root), "Enter");
  return frame;
}

describe("S1 S3 S4 the choice of a shared System", () => {
  it("S1 offers this row or all c rows, with the focus on the first item", async () => {
    const { root } = await systemEdit();
    expect(SNOWFLAKE.length).toBeGreaterThanOrEqual(2);
    const menu = root.querySelector(".cell-edit [role=menu]");
    expect(menu?.classList.contains("menu")).toBe(true);
    expect(f.choice(root).map(f.text)).toEqual([
      "Apply to this row only",
      `Apply to all ${SNOWFLAKE.length} rows`,
    ]);
    expect(root.ownerDocument.activeElement).toBe(f.choice(root)[0]);
    expect(done()).toHaveLength(0);
  });

  it("S3 all c rows is one edit with c changes in graph order", async () => {
    const { root } = await systemEdit();
    f.click(f.choice(root)[1]);
    expect(f.editors(root)).toHaveLength(0);
    expect(done()).toHaveLength(1);
    expect(done()[0].changes.map((c) => c.row)).toEqual(
      SNOWFLAKE.map((record) => ({ record })),
    );
    expect(SNOWFLAKE.map(system)).toEqual(SNOWFLAKE.map(() => "snowflake_eu"));
  });

  it("S4 this row only saves one change", async () => {
    const { root } = await systemEdit();
    f.click(f.choice(root)[0]);
    expect(done()).toHaveLength(1);
    expect(done()[0].changes).toHaveLength(1);
    expect(SNOWFLAKE.filter((id) => system(id) === "snowflake_eu")).toEqual([
      "t_SF_ACCOUNT",
    ]);
  });
});

describe("S2 the rows that the Workbench does not show", () => {
  it("counts the shared rows that the search leaves out", async () => {
    const { root } = await catalog();
    f.search(root, "t_STRIPE");
    const shown = f
      .rows(root)
      .map((tr) => f.text(tr.querySelector("td > code")))
      .filter((id) => SNOWFLAKE.includes(id));
    expect(shown.length).toBeGreaterThanOrEqual(1);
    f.dblclick(f.cellOf(root, "t_STRIPE_CHARGES", "System"));
    f.type(f.input(root), "snowflake_eu");
    f.key(f.input(root), "Enter");
    const hidden = SNOWFLAKE.length - shown.length;
    expect(f.text(f.choice(root)[1])).toBe(
      `Apply to all ${SNOWFLAKE.length} rows (${hidden} not shown)`,
    );
  });
});

describe("S5 one row or an empty old value saves at once", () => {
  it("saves a unique Name and a Description of an empty cell with no menu", async () => {
    const { root } = await catalog();
    f.dblclick(f.cellOf(root, "t_SF_ACCOUNT", "Name"));
    f.type(f.input(root), "SF_ACCOUNT_EU");
    f.key(f.input(root), "Enter");
    expect(f.choice(root)).toHaveLength(0);
    expect(f.editors(root)).toHaveLength(0);
    const empty = graph().records.filter(
      (r) => !Object.hasOwn(r.attrs, "description"),
    );
    expect(empty.length).toBeGreaterThanOrEqual(2);
    f.dblclick(f.cellOf(root, "db_RAW", "Description"));
    f.type(f.input(root), "Raw landing database");
    f.key(f.input(root), "Enter");
    expect(f.choice(root)).toHaveLength(0);
    expect(done().map((edit) => edit.changes.length)).toEqual([1, 1]);
    const described = graph().records.filter(
      (r) => r.attrs.description === "Raw landing database",
    );
    expect(described.map((r) => r.id)).toEqual(["db_RAW"]);
  });
});

describe("S6 Escape at the choice", () => {
  it("closes the choice and keeps the typed value; a second Escape cancels", async () => {
    const { root } = await systemEdit();
    f.key(f.choice(root)[0], "Escape");
    expect(f.choice(root)).toHaveLength(0);
    expect(f.input(root)?.value).toBe("snowflake_eu");
    expect(root.ownerDocument.activeElement).toBe(f.input(root));
    expect(done()).toHaveLength(0);
    f.key(f.input(root), "Escape");
    expect(f.editors(root)).toHaveLength(0);
    expect(f.text(f.cellOf(root, "t_SF_ACCOUNT", "System"))).toBe("snowflake");
    expect(done()).toHaveLength(0);
  });

  it("a press outside closes the choice only; ArrowDown and Enter pick", async () => {
    const { root } = await systemEdit();
    f.click(root.querySelector(".wb-bar"));
    expect(f.choice(root)).toHaveLength(0);
    expect(f.editors(root)).toHaveLength(1);
    expect(done()).toHaveLength(0);
    f.key(f.input(root), "Enter");
    f.key(f.choice(root)[0], "ArrowDown");
    expect(root.ownerDocument.activeElement).toBe(f.choice(root)[1]);
    f.key(f.choice(root)[1], "Enter");
    expect(done()[0].changes).toHaveLength(SNOWFLAKE.length);
  });
});

describe("S8 one bad change of all N rows", () => {
  it("gives self-edge and saves nothing", async () => {
    const { root } = await catalog();
    f.search(root, "etl_dbt_marts · dependsOn");
    const subjectOf = (object: string) =>
      f.cellOf(root, `etl_dbt_marts · dependsOn · ${object}`, "Subject");
    f.dblclick(subjectOf("t_STG_ACCOUNTS"));
    f.type(f.input(root), "dbt · staging");
    const combo = f.input(root);
    const items = [...root.querySelectorAll(".cell-edit [role=option]")];
    const at = items.findIndex(
      (li) => f.text(li.querySelector(".name")) === "dbt · staging",
    );
    for (let i = 0; i <= at; i++) f.key(combo, "ArrowDown");
    f.key(combo, "Enter");
    expect(f.choice(root).map(f.text)).toEqual([
      "Apply to this row only",
      "Apply to all 3 rows",
    ]);
    f.click(f.choice(root)[1]);
    expect(f.message(root)).toBe(
      "The subject and the object cannot be the same node.",
    );
    expect(f.editors(root)).toHaveLength(1);
    expect(done()).toHaveLength(0);
  });
});
