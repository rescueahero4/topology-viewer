import type { EditEffect, Graph, OnCanvas, Vocab } from "#engine";
import { datasets } from "#fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actions } from "./actions";
import type { EditEnds } from "./canvas/index";
import { checkCell, saveEdit, trySave } from "./edits";
import { appInput } from "./fixtureModel";
import {
  editedGraph,
  editedModel,
  editHistory,
  takeInput,
  takeLanguage,
} from "./state";
import { rowsOf, type Row } from "./workbenchRows";

type Applied = { graph: Graph; vocab: Vocab; ends: EditEnds };

const EFFECT: EditEffect = { drew: ["e:x"], undrew: [] };

// why: rule 6 — the save path reaches the canvas only through `Actions`; this fake records it
function fakeActions(states: Record<string, OnCanvas> = {}) {
  const applied: Applied[] = [];
  const actions = {
    onCanvas: (id: string) => states[id] ?? "drawn",
    applyEdit: (graph: Graph, vocab: Vocab, ends: EditEnds) => {
      applied.push({ graph, vocab, ends });
      return EFFECT;
    },
  } as unknown as Actions;
  return { actions, applied };
}

const rows = () => {
  const now = editedModel.value;
  if (now === null) throw new Error("no model");
  return rowsOf(now.graph, now.vocab);
};
const nodeRow = (id: string) =>
  rows().find((r) => r.rtype === "node" && r.id === id) as Row;
const edgeRow = (subject: string, predicate: string, object: string) =>
  rows().find(
    (r) =>
      r.rtype === "edge" &&
      r.subject === subject &&
      r.predicate === predicate &&
      r.object === object,
  ) as Row;
const active = () => editHistory.value.history.active();
// why: STORY-008-07 — these saves name values of one row, so no save asks
const SHOWN = new Set<number>();

beforeEach(() => {
  takeLanguage("ja", "ja-JP");
  takeInput(appInput(datasets.catalog.graph), "same");
});

describe("rule 6 saveEdit", () => {
  it("pushes one edit, applies the edited graph with the localised vocabulary and keeps the effect", () => {
    const { actions, applied } = fakeActions();
    const code = trySave(
      actions,
      nodeRow("db_RAW"),
      { core: "name" },
      { after: "RAW_EU" },
      SHOWN,
    );
    expect(code).toBeNull();
    expect(active()).toHaveLength(1);
    expect(applied).toHaveLength(1);
    expect(applied[0].graph).toBe(editedGraph.value);
    expect(applied[0].ends).toEqual({ draw: [], undraw: [] });
    expect(applied[0].vocab.types.get("table")?.label).toBe("テーブル");
    expect(active()[0].effect).toBe(EFFECT);
    expect(active()[0].changes).toEqual([
      {
        row: { record: "db_RAW" },
        column: "name",
        before: "RAW",
        after: "RAW_EU",
      },
    ]);
  });

  it("names the base key of an edge row and draws a not-drawn new end", () => {
    const { actions, applied } = fakeActions({
      t_STRIPE_CUSTOMERS: "not-drawn",
    });
    const row = edgeRow("t_FCT_PIPELINE", "derivedFrom", "t_DIM_CUSTOMER");
    if (row.rtype !== "edge") throw new Error("no edge");
    saveEdit(actions, [
      {
        row: { triple: row.triple.key },
        column: "object",
        before: "t_DIM_CUSTOMER",
        after: "t_STRIPE_CUSTOMERS",
      },
    ]);
    expect(applied[0].ends.draw).toEqual(["t_STRIPE_CUSTOMERS"]);
    const moved = edgeRow(
      "t_FCT_PIPELINE",
      "derivedFrom",
      "t_STRIPE_CUSTOMERS",
    );
    expect(
      trySave(
        actions,
        moved,
        { core: "object" },
        { after: "t_FCT_PIPELINE" },
        SHOWN,
      ),
    ).toBe("self-edge");
    expect(active()).toHaveLength(1);
  });
});

describe("rule 4 the check before the save", () => {
  it("gives the code and saves nothing for a bad value", () => {
    const { actions, applied } = fakeActions();
    expect(
      trySave(
        actions,
        nodeRow("db_RAW"),
        { core: "name" },
        { after: undefined },
        SHOWN,
      ),
    ).toBe("empty");
    expect(
      trySave(
        actions,
        nodeRow("db_RAW"),
        { core: "name" },
        { code: "not-a-number" },
        SHOWN,
      ),
    ).toBe("not-a-number");
    expect(checkCell(nodeRow("db_RAW"), { core: "name" }, { after: " " })).toBe(
      "empty",
    );
    expect(active()).toHaveLength(0);
    expect(applied).toHaveLength(0);
  });

  it("saves nothing for an unchanged value or an empty cell that stays empty", () => {
    const { actions, applied } = fakeActions();
    expect(
      trySave(
        actions,
        nodeRow("db_RAW"),
        { core: "name" },
        { after: "RAW" },
        SHOWN,
      ),
    ).toBeNull();
    expect(
      trySave(
        actions,
        nodeRow("db_RAW"),
        { attr: "row_count" },
        { after: undefined },
        SHOWN,
      ),
    ).toBeNull();
    expect(active()).toHaveLength(0);
    expect(applied).toHaveLength(0);
  });
});
