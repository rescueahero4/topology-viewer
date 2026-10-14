import { describe, expect, it } from "vitest";
import { parseRenderInput } from "../src/index";

function parsed(raw: unknown) {
  const result = parseRenderInput(raw);
  if (!result.ok) throw new Error(`fatal ${result.fatal.code}`);
  return result;
}

describe("view", () => {
  it("S6 accepts the five view keys", () => {
    const view = {
      approach: "active",
      root: "x",
      reveal: ["y"],
      layout: "force",
      budget: 20,
    };
    const { data, issues } = parsed({ nodes: [{ id: "x" }], view });
    expect(issues).toEqual([]);
    expect(data.view).toEqual(view);
  });

  it("S7 drops a bad layout, a bad budget and an unknown key, each with its code", () => {
    const layout = parsed({ nodes: [], view: { layout: "radial" } });
    expect(layout.data.view).toEqual({});
    expect(layout.issues).toEqual([
      { code: "layout-rejected", path: ["view", "layout"] },
    ]);
    expect(JSON.stringify(layout.data)).not.toContain("radial");

    const budget = parsed({ nodes: [], view: { budget: 30 } });
    expect(budget.data.view).toEqual({});
    expect(budget.issues).toEqual([
      { code: "budget-rejected", path: ["view", "budget"] },
    ]);

    const hidden = parsed({ nodes: [], view: { hiddenTypes: [] } });
    expect(hidden.data.view).toEqual({});
    expect(hidden.issues).toEqual([
      { code: "unknown-key", path: ["view", "hiddenTypes"] },
    ]);
    expect(JSON.stringify(hidden.data)).not.toContain("hiddenTypes");
  });
});
