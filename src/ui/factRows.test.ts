import type { NodeRecord } from "#engine";
import { describe, expect, it } from "vitest";
import { genericRows } from "./factRows";
import { fixtureModel } from "./fixtureModel";

// why: ISSUE-012 C5 (STORY-004-04 QA memo item 2, plants r1 and r2) — the engine makes these
// objects with no prototype, so only a value with an inherited key shows the own-key guard
function withInherited() {
  const input = fixtureModel("s-access");
  if (!input.ok) throw new Error("fatal");
  const { model } = input;
  const entity = model.graph.entities.find((e) => e.id === "u_0");
  if (entity === undefined) throw new Error("no u_0");
  const first = entity.records[0];
  const records = model.graph.records.map((record): NodeRecord =>
    record.id !== first
      ? record
      : {
          ...record,
          attrs: { ...record.attrs, secret: "kept" },
          inferred: Object.create({ secret: "inherited reason" }) as Record<
            string,
            string
          >,
        },
  );
  const fields = Object.create({
    secret: { label: "Inherited label", why: "inherited" },
  }) as NonNullable<typeof model.payload.fields>;
  return {
    ...model,
    graph: { ...model.graph, records },
    payload: { ...model.payload, fields },
  };
}

describe("the own-key reads of the fields and _inferred maps", () => {
  it("takes no label and no inferred mark from an inherited key", () => {
    const rows = genericRows("en", withInherited(), "u_0");
    const secret = rows.find(
      (row) => row.kind === "attribute" && row.key === "secret",
    );
    expect(secret).toEqual({
      kind: "attribute",
      key: "secret",
      value: "kept",
      label: "Secret",
    });
  });
});
