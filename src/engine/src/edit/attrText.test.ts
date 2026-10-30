import { datasets } from "@qdic-topology/fixtures";
import { describe, expect, it } from "vitest";
import {
  attributeChanges,
  attributeSet,
  MAX_TEXT,
  normalize,
  readAttributes,
  readJsonCell,
  writeAttributes,
  type Graph,
} from "../index";

const entriesOf = (text: string, kind: "node" | "edge" = "node") => {
  const read = readAttributes(text, kind);
  if ("code" in read) throw new Error(read.code);
  return read.entries;
};

const codeOf = (text: string, kind: "node" | "edge" = "node") => {
  const read = readAttributes(text, kind);
  return "code" in read ? read.code : null;
};

const SET = [
  ["a", 1],
  ["b", true],
  ["c", "2026-01-01"],
  ["d", "x"],
];

function catalog(): Graph {
  const result = normalize(structuredClone(datasets.catalog.graph), {
    now: "2026-10-14",
  });
  if (!result.ok) throw new Error("fatal");
  return result.graph;
}

describe("readAttributes forms (STORY-008-09 S18)", () => {
  it("types key=value pairs as number, true/false, date and text", () => {
    expect(entriesOf("a=1, b=true, c=2026-01-01, d=x")).toEqual(SET);
  });

  it("gives the same set from a JSON object and from simple XML", () => {
    expect(entriesOf('{"a":1,"b":true,"c":"2026-01-01","d":"x"}')).toEqual(SET);
    expect(entriesOf("<a>1</a> <b>true</b><c>2026-01-01</c><d>x</d>")).toEqual(
      SET,
    );
  });

  it("reads JSON values, quoted keys, null, = in a value and 01234 as text", () => {
    expect(
      entriesOf(
        'tags=["pii","finance"], "k,1"=n, z=null, q=a=b, n=01234, s="12"',
      ),
    ).toEqual([
      ["tags", ["pii", "finance"]],
      ["k,1", "n"],
      ["z", null],
      ["q", "a=b"],
      ["n", "01234"],
      ["s", "12"],
    ]);
    expect(entriesOf("  ")).toEqual([]);
  });

  it("decodes the five names and numeric references in XML", () => {
    expect(entriesOf("<a>&lt;b&gt; &amp;&#65;&#x42;</a>")).toEqual([
      ["a", "<b> &AB"],
    ]);
  });

  it("reads back what writeAttributes writes for every catalog row", () => {
    const graph = catalog();
    for (const record of graph.records) {
      const set = attributeSet("node", record);
      expect(entriesOf(writeAttributes(set))).toEqual(set);
    }
    for (const triple of graph.triples) {
      const set = attributeSet("edge", triple);
      expect(entriesOf(writeAttributes(set), "edge")).toEqual(set);
    }
    const odd: [string, unknown][] = [
      ["a b=", " x"],
      ["{k", "a, b"],
      ["e", ""],
      ["t", "true"],
    ];
    expect(entriesOf(writeAttributes(odd))).toEqual(odd);
  });
});

describe("readAttributes bad input (STORY-008-09 S19)", () => {
  it.each([
    ["=1", "empty-key"],
    ["{bad", "bad-json"],
    ["<a><b></a>", "bad-xml"],
    ["a", "bad-syntax"],
    ["a=1,", "bad-syntax"],
    ['a="x" y', "bad-syntax"],
    ["a=1, a=2", "duplicate-key"],
    ["<a x='1'>1</a>", "bad-xml"],
    ["<a/>", "bad-xml"],
    ["<a>1</b>", "bad-xml"],
    ["<a>1</a>x", "bad-xml"],
    ["service_name=x", "reserved-key"],
    ["_hidden=x", "reserved-key"],
  ])("%s gives %s", (text, code) => {
    expect(codeOf(text)).toBe(code);
  });

  it("keeps the edge facts in their kinds", () => {
    expect(codeOf("valid_from=soon", "edge")).toBe("not-a-date");
    expect(codeOf("isActive=1", "edge")).toBe("not-a-boolean");
    expect(codeOf("valid_from=2026-01-01, isActive=false", "edge")).toBeNull();
  });
});

describe("readAttributes hostile input (STORY-008-09 S21)", () => {
  it("keeps prototype names as plain keys and values in all three forms", () => {
    const names = ["__proto__", "constructor", "prototype", "toString"];
    for (const name of names) {
      const forms = [
        `${name}=${name}`,
        `{"${name}":"${name}"}`,
        `<${name}>${name}</${name}>`,
      ];
      for (const text of forms)
        expect(entriesOf(text, "edge")).toEqual([[name, name]]);
    }
    expect(entriesOf('{"constructor":{"prototype":{"p":1}}}')).toHaveLength(1);
    expect(({} as Record<string, unknown>).p).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it.each([
    '<!DOCTYPE a [<!ENTITY e "x">]><a>&e;</a>',
    '<!ENTITY e "x">',
    "<a><![CDATA[x]]></a>",
    '<?xml version="1.0"?><a>1</a>',
    "<a>&e;</a>",
    "<a>&#0;</a>",
    "<a>&#x110000;</a>",
    "<!-- c --><a>1</a>",
    "<img src=x onerror=alert(1)>=<script>1</script>",
  ])("blocks %s", (text) => {
    expect(codeOf(text)).toBe("bad-xml");
  });

  it("keeps markup as text in a key=value pair", () => {
    expect(entriesOf("x=<script>1</script>")).toEqual([
      ["x", "<script>1</script>"],
    ]);
  });

  it("stops a text above the cap and a value above the depth cap", () => {
    expect(codeOf("a".repeat(MAX_TEXT + 1))).toBe("too-large");
    const deep = `${"[".repeat(70)}${"]".repeat(70)}`;
    expect(codeOf(`a=${deep}`)).toBe("too-large");
    expect(readJsonCell(deep)).toEqual({ code: "too-large" });
  });

  it("reads a 1,000,000-unit text in linear time", () => {
    const text = Array.from({ length: 90_000 }, (_, i) => `k${i}=v`)
      .join(", ")
      .slice(0, MAX_TEXT);
    const start = performance.now();
    readAttributes(text, "node");
    readAttributes(`<a>${"x".repeat(MAX_TEXT - 8)}</a>`, "node");
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe("readJsonCell (STORY-008-09 S20)", () => {
  it("takes a JSON list or object only", () => {
    expect(readJsonCell('["x","y"]')).toEqual({ value: ["x", "y"] });
    expect(readJsonCell("[x")).toEqual({ code: "bad-json" });
    expect(readJsonCell('"x"')).toEqual({ code: "bad-json" });
    expect(readJsonCell('{"a":1}')).toEqual({ value: { a: 1 } });
  });
});

describe("attributeChanges (STORY-008-09 S18 replace)", () => {
  it("adds, changes and removes keys; an equal key gives no change", () => {
    const graph = catalog();
    const record = graph.records.find(
      (r) => attributeSet("node", r).length >= 2,
    );
    if (record === undefined) throw new Error("no record");
    const [first, second] = attributeSet("node", record);
    const row = { record: record.id };
    const changes = attributeChanges(graph, row, [first, ["new", 1]]);
    expect(changes[0]).toMatchObject({ column: { attr: "new" }, after: 1 });
    expect(changes).toContainEqual({
      row,
      column: { attr: second[0] },
      before: second[1],
      after: undefined,
    });
    expect(attributeChanges(graph, row, attributeSet("node", record))).toEqual(
      [],
    );
  });
});
