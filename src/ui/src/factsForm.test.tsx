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
const { act } = await import("preact/test-utils");
const f = await import("./cellEditFrame");
const { mountApp } = await import("./testFrame");
const { appInput, fixtureModel } = await import("./fixtureModel");
const { hostilePayload, shellAudit, MARKERS } = await import("./shellAudit");
const state = await import("./state");

const TAIL = `"<>&javascript:`;
const done = () => state.editHistory.value.history.done;
const tripleOf = (s: string, p: string, o: string) =>
  state.editedGraph.value?.triples.find(
    (t) => t.subject === s && t.predicate === p && t.object === o,
  );

// why: S1, S13 — a triple with two attributes and the three named facts; S2 — an edge with none
const FACTS = {
  nodes: [
    { id: "a", type: "table", label: "A" },
    { id: "b", type: "table", label: "B" },
    { id: "c", type: "table", label: "C" },
  ],
  edges: [
    {
      subject: "a",
      predicate: "contains",
      object: "b",
      attrs: { note: "first", weight: 3 },
      valid_from: "2026-01-01",
      valid_to: "2026-05-02T10:00:00Z",
      isActive: true,
    },
    { subject: "a", predicate: "contains", object: "c" },
  ],
};

const form = (root: Element) => root.querySelector(".facts-form");
const keysIn = (root: Element) =>
  [...(form(root)?.querySelectorAll("dt") ?? [])].map((dt) => f.text(dt));
const lineOf = (root: Element, key: string) => {
  const at = keysIn(root).indexOf(key);
  const dd = form(root)?.querySelectorAll("dd")[at];
  if (at < 0 || dd === undefined) throw new Error(`no line ${key}`);
  return dd;
};
const control = (root: Element, key: string) =>
  lineOf(root, key).querySelector<HTMLElement>(
    "input, .seg [tabindex='0']",
  ) as HTMLElement;
const focus = (el: HTMLElement) => void act(() => el.focus());
const active = (root: Element) => root.ownerDocument.activeElement;

async function openFacts(id: string, query: string, input = appInput(FACTS)) {
  const frame = await f.opened(mountApp, input);
  f.search(frame.root, query);
  f.dblclick(f.cellOf(frame.root, id, "Attributes"));
  return frame;
}

const AB = "a · contains · b";

describe("S1 S16 the lines of the form", () => {
  it("shows five lines in the attributesText order with the input of each kind", async () => {
    const { root } = await openFacts(AB, "a · contains · b");
    expect(form(root)?.getAttribute("role")).toBe("group");
    expect(form(root)?.getAttribute("aria-label")).toBe("Edit attributes");
    expect(keysIn(root)).toEqual([
      "note",
      "weight",
      "valid_from",
      "valid_to",
      "isActive",
    ]);
    const cell = f.text(root.querySelector(".facts-edit .cell-text"));
    expect(cell.split(", ").map((pair) => pair.split(": ")[0])).toEqual(
      keysIn(root),
    );
    const kinds = keysIn(root).map((key) => {
      const dd = lineOf(root, key);
      const seg = dd.querySelector(".seg[role=radiogroup]");
      return seg === null ? dd.querySelector("input")?.type : "seg";
    });
    expect(kinds).toEqual(["text", "number", "date", "text", "seg"]);
    expect(active(root)).toBe(control(root, "note"));
  });

  it("S16 shows a list and an object fact as read-only text with no input", async () => {
    const vocab = fixtureModel("q-full-vocabulary");
    const one = await openFacts(
      "ugrp-analysts · permissionedTo · tbl-orders",
      "permissionedTo",
      vocab,
    );
    const permissions = lineOf(one.root, "permissions");
    expect(permissions.querySelector("input, button")).toBeNull();
    expect(f.text(permissions)).toContain("view");
    expect(f.text(permissions)).toContain("edit");
    f.key(control(one.root, "valid_from"), "Escape");
    const two = await openFacts(
      "tbl-orders · enrichedWith · pset-retention",
      "enrichedWith",
      vocab,
    );
    const values = lineOf(two.root, "values");
    expect(values.querySelector("input, button")).toBeNull();
    expect(f.text(values)).toContain("retention_days");
  });
});

describe("S2 an edge with no fact", () => {
  it("opens no form; the double-click presses the row only", async () => {
    const { root } = await openFacts("a · contains · c", "a · contains · c");
    expect(form(root)).toBeNull();
    expect(f.editors(root)).toHaveLength(0);
    expect(state.selection.value).toEqual({ node: "e:a" });
    expect(done()).toHaveLength(0);
  });
});

describe("S7 Escape", () => {
  it("gives the old values back and pushes no edit", async () => {
    const { root } = await openFacts(AB, "a · contains · b");
    f.type(control(root, "note"), "changed");
    f.key(control(root, "note"), "Escape");
    expect(form(root)).toBeNull();
    expect(done()).toHaveLength(0);
    expect(f.text(f.cellOf(root, AB, "Attributes"))).toContain("note: first");
    expect(tripleOf("a", "contains", "b")?.attrs.note).toBe("first");
  });
});

describe("S13 S15 each line saves on its own", () => {
  it("S13 two changed lines with Enter give two edits; the focus goes to the next line", async () => {
    const { root } = await openFacts(AB, "a · contains · b");
    f.type(control(root, "note"), "second");
    f.key(control(root, "note"), "Enter");
    expect(active(root)).toBe(control(root, "weight"));
    focus(control(root, "isActive"));
    f.click(lineOf(root, "isActive").querySelectorAll("button")[1]);
    f.key(control(root, "isActive"), "Enter");
    const key = state.model.value?.graph.triples[0].key;
    expect(done().map((edit) => edit.changes)).toEqual([
      [
        {
          row: { triple: key },
          column: { fact: "note" },
          before: "first",
          after: "second",
        },
      ],
      [
        {
          row: { triple: key },
          column: { fact: "isActive" },
          before: true,
          after: false,
        },
      ],
    ]);
    expect(form(root)).not.toBeNull();
    expect(active(root)).toBe(control(root, "note"));
  });

  it("S15 a line with no change saves nothing with Enter, Tab or a press", async () => {
    const { root } = await openFacts(AB, "a · contains · b");
    f.key(control(root, "note"), "Enter");
    f.key(control(root, "weight"), "Tab");
    f.click(control(root, "valid_to"));
    focus(control(root, "valid_to"));
    f.click(control(root, "note"));
    expect(done()).toHaveLength(0);
    expect(form(root)).not.toBeNull();
  });
});

describe("S14 a press outside a line or a Tab out of it saves it", () => {
  it("saves valid_to by a press on another line and valid_from by Tab", async () => {
    const { root } = await openFacts(
      "ugrp-analysts · permissionedTo · tbl-orders",
      "permissionedTo",
      fixtureModel("q-full-vocabulary"),
    );
    f.click(control(root, "valid_to"));
    focus(control(root, "valid_to"));
    f.type(control(root, "valid_to"), "2026-11-30");
    f.click(control(root, "valid_from"));
    focus(control(root, "valid_from"));
    expect(done()).toHaveLength(1);
    f.type(control(root, "valid_from"), "2026-02-01");
    f.key(control(root, "valid_from"), "Tab");
    expect(done().map((edit) => edit.changes.map((c) => c.column))).toEqual([
      [{ fact: "valid_to" }],
      [{ fact: "valid_from" }],
    ]);
    const triple = tripleOf("ugrp-analysts", "permissionedTo", "tbl-orders");
    expect([triple?.validFrom, triple?.validTo]).toEqual([
      "2026-02-01",
      "2026-11-30",
    ]);
    expect(active(root)).toBe(control(root, "valid_to"));
  });

  it("a press outside the form saves the line and closes the form", async () => {
    const { root } = await openFacts(AB, "a · contains · b");
    f.type(control(root, "note"), "outside");
    f.click(root.querySelector(".wb-bar"));
    expect(form(root)).toBeNull();
    expect(tripleOf("a", "contains", "b")?.attrs.note).toBe("outside");
  });
});

// why: S9 (Security condition 2) — fact keys `__proto__` and `constructor` must be own keys, so the
// payload is JSON text
function hostileFacts(): unknown {
  const text = JSON.stringify(hostilePayload()).replace(
    `"attrs":{"${MARKERS[16]}`,
    `"attrs":{"__proto__":"own-p","constructor":"own-c","${MARKERS[16]}`,
  );
  return JSON.parse(text);
}

describe("S9 hostile fact keys and values", () => {
  it("keeps markers and keys out of attributes and reads own values", async () => {
    const shared = Object.getOwnPropertyNames(Object.prototype);
    const input = appInput(hostileFacts());
    if (!input.ok) throw new Error("fatal");
    const triple = input.model.graph.triples.find(
      (t) => t.predicate === `${MARKERS[15]}${TAIL}`,
    );
    if (triple === undefined) throw new Error("no triple");
    // why: the data layer drops a `__proto__` attribute key (engine `data/pollution.test.ts`), so the
    // form has no line for it (memo 2026-10-30-implementer-group-b-build)
    expect(Object.hasOwn(triple.attrs, "__proto__")).toBe(false);
    const id = [triple.subject, triple.predicate, triple.object].join(" · ");
    const { root } = await openFacts(id, MARKERS[15], input);
    expect(keysIn(root)).toEqual(["constructor", `${MARKERS[16]}${TAIL}`]);
    const values = keysIn(root).map(
      (key) => (control(root, key) as HTMLInputElement).value,
    );
    expect(values).toEqual(["own-c", `${MARKERS[17]}${TAIL}`]);
    expect(shellAudit(root)).toEqual([]);
    const ids = [...(form(root)?.querySelectorAll("[id]") ?? [])].map(
      (el) => el.id,
    );
    for (const key of ["constructor", MARKERS[16]])
      expect(ids.some((one) => one.includes(key))).toBe(false);
    f.type(control(root, "constructor"), `${MARKERS[20]}${TAIL}`);
    f.key(control(root, "constructor"), "Enter");
    f.type(control(root, `${MARKERS[16]}${TAIL}`), `${MARKERS[21]}${TAIL}`);
    f.key(control(root, `${MARKERS[16]}${TAIL}`), "Enter");
    expect(shellAudit(root)).toEqual([]);
    expect(done()).toHaveLength(2);
    const after = state.editedGraph.value?.triples.find(
      (t) => t.predicate === `${MARKERS[15]}${TAIL}`,
    );
    expect(Object.hasOwn(after?.attrs ?? {}, "constructor")).toBe(true);
    expect(after?.attrs.constructor).toBe(`${MARKERS[20]}${TAIL}`);
    expect(Object.hasOwn(after?.attrs ?? {}, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(shared);
  });
});
