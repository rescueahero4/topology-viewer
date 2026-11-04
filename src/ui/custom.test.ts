// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { BEHAVIOUR_PARTS, CLASS_PARTS } from "./partNames";
import {
  custom,
  dispatch,
  keyIs,
  optionOf,
  partConfig,
  setCustom,
  type Custom,
  type PartEvent,
} from "./custom";
import { fieldRows, type FactRow } from "./factRows";

const key = (key: string, more: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent("keydown", { key, ...more });

const withCustom = (next: Partial<Custom>, run: () => void) => {
  const before = custom.peek();
  setCustom({ parts: {}, ...next });
  try {
    run();
  } finally {
    setCustom(before);
  }
};

describe("keyIs", () => {
  it("has the keys that the viewer always had", () => {
    expect(keyIs("search", key("/"))).toBe(true);
    expect(keyIs("toggleTable", key(".", { ctrlKey: true }))).toBe(true);
    expect(keyIs("toggleTable", key(".", { metaKey: true }))).toBe(true);
    expect(keyIs("toggleTable", key("."))).toBe(false);
    expect(keyIs("undo", key("z", { ctrlKey: true }))).toBe(true);
    expect(keyIs("undo", key("z", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(keyIs("redo", key("Z", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(keyIs("tableLarger", key("]"))).toBe(true);
    expect(keyIs("tableLarger", key("]", { ctrlKey: true }))).toBe(false);
    expect(keyIs("escape", key("Escape"))).toBe(true);
  });

  it("takes a character that needs Shift on some keyboards", () => {
    expect(keyIs("search", key("/", { shiftKey: true }))).toBe(true);
  });

  it("changes or switches off one key, or all", () => {
    withCustom({ keyboard: { search: "mod+k", redo: false } }, () => {
      expect(keyIs("search", key("/"))).toBe(false);
      expect(keyIs("search", key("k", { ctrlKey: true }))).toBe(true);
      expect(keyIs("redo", key("z", { ctrlKey: true, shiftKey: true }))).toBe(false);
      expect(keyIs("undo", key("z", { ctrlKey: true }))).toBe(true);
    });
    withCustom({ keyboard: false }, () => {
      expect(keyIs("search", key("/"))).toBe(false);
      expect(keyIs("escape", key("Escape"))).toBe(false);
    });
  });
});

describe("dispatch", () => {
  it("answers true at once with no customization", () => {
    expect(dispatch("focus", ["a"])).toBe(true);
  });

  it("runs the innermost part first, then onAction, and stops at preventDefault", () => {
    const seen: string[] = [];
    const on = (name: string, stop = false) => ({
      focus(event: PartEvent) {
        seen.push(`${name}:${event.part}`);
        if (stop) event.preventDefault();
      },
    });
    withCustom(
      {
        parts: { inner: { on: on("inner") }, outer: { on: on("outer") } },
        onAction: (event) => seen.push(`action:${event.part}`),
      },
      () => {
        expect(dispatch("focus", ["a"], {}, ["inner", "outer"])).toBe(true);
        expect(seen).toEqual(["inner:inner", "outer:outer", "action:inner"]);
      },
    );
    const action = vi.fn();
    withCustom(
      { parts: { inner: { on: on("inner", true) }, outer: { on: on("outer") } }, onAction: action },
      () => {
        seen.length = 0;
        expect(dispatch("focus", ["a"], {}, ["inner", "outer"])).toBe(false);
        expect(seen).toEqual(["inner:inner"]);
        expect(action).not.toHaveBeenCalled();
      },
    );
  });

  it("stops by onAction too, and ignores a part with no handler for the action", () => {
    withCustom(
      {
        parts: { a: { on: { other: () => { throw new Error("no"); } } } },
        onAction: (event) => event.preventDefault(),
      },
      () => expect(dispatch("focus", [], {}, ["a"])).toBe(false),
    );
  });
});

describe("the options of a part", () => {
  it("reads own keys only", () => {
    withCustom({ parts: { a: { options: { limit: 2, gone: undefined } } } }, () => {
      expect(optionOf("a", "limit", 9)).toBe(2);
      expect(optionOf("a", "gone", 9)).toBe(9);
      expect(optionOf("a", "toString", 9)).toBe(9);
      expect(optionOf("nope", "limit", 9)).toBe(9);
      expect(partConfig("toString")).toBeUndefined();
    });
  });
});

describe("the part names", () => {
  it("has no repeated stable name", () => {
    expect(new Set(BEHAVIOUR_PARTS).size).toBe(BEHAVIOUR_PARTS.length);
  });

  it("uses a valid CSS name for each part, with no dot", () => {
    for (const name of [...BEHAVIOUR_PARTS, ...Object.values(CLASS_PARTS)])
      expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe("fieldRows", () => {
  const rows: FactRow[] = [
    { kind: "attribute", key: "a", label: "A", value: 1 },
    { kind: "attribute", key: "b", label: "B", value: 2 },
    { kind: "records", ids: ["r"] },
  ];
  const node = { id: "n" };

  it("changes a row, hides a row, and adds a row with a value", () => {
    const out = fieldRows(
      rows,
      [
        { key: "a", label: "First", format: (value) => `<${String(value)}>` },
        { key: "b", hidden: true },
        { label: "New", value: () => "made" },
      ],
      false,
      node,
      { a: 1, b: 2 },
    );
    expect(out).toEqual([
      { kind: "attribute", key: "a", label: "First", value: "<1>" },
      { kind: "records", ids: ["r"] },
      { kind: "attribute", key: "", label: "New", value: "made" },
    ]);
  });

  it("keeps only the listed fields with `only`, in their order, and can read a skipped key", () => {
    const out = fieldRows(
      rows,
      [{ key: "skipped" }, { key: "a" }, { key: "nope" }],
      true,
      node,
      { a: 1, skipped: "s" },
    );
    expect(out.map((row) => (row.kind === "attribute" ? [row.key, row.value] : row.kind))).toEqual([
      ["skipped", "s"],
      ["a", 1],
    ]);
  });

  it("gives the node to a value function", () => {
    const value = vi.fn(() => 1);
    fieldRows(rows, [{ label: "X", value }], false, node, {});
    expect(value).toHaveBeenCalledWith(node);
  });
});
