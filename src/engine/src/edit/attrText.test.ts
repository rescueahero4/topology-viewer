import { describe, expect, it } from "vitest";
import {
  attributesSource,
  MAX_TEXT,
  parseAttributes,
  parseJsonCell,
} from "../index";

const valueOf = (text: string) => {
  const parsed = parseAttributes(text);
  if ("code" in parsed) throw new Error(parsed.code);
  return { ...parsed.value };
};

const codeOf = (text: string) => {
  const parsed = parseAttributes(text);
  return "code" in parsed ? parsed.code : null;
};

const SET = { a: 1, b: true, c: "2026-01-01", d: "x" };

describe("parseAttributes (STORY-008-09 S18)", () => {
  it("types key=value pairs as number, true/false, date and text", () => {
    expect(valueOf("a=1, b=true, c=2026-01-01, d=x")).toEqual(SET);
  });

  it("gives the same set from a JSON object and from simple XML", () => {
    expect(valueOf('{"a":1,"b":true,"c":"2026-01-01","d":"x"}')).toEqual(SET);
    expect(valueOf("<a>1</a><b>true</b><c>2026-01-01</c><d>x</d>")).toEqual(
      SET,
    );
    expect(
      valueOf("<set><a>1</a><b>true</b><c>2026-01-01</c><d>x</d></set>"),
    ).toEqual(SET);
  });

  it("keeps a list or object value as JSON and splits only outside brackets", () => {
    expect(valueOf('tags=["pii","finance"], o={"k":1}, n=null')).toEqual({
      tags: ["pii", "finance"],
      o: { k: 1 },
      n: null,
    });
  });

  it("gives an empty set for an empty text and a null-prototype set", () => {
    const parsed = parseAttributes("  ");
    expect("value" in parsed && Object.keys(parsed.value)).toEqual([]);
    const one = parseAttributes("a=1");
    expect("value" in one && Object.getPrototypeOf(one.value)).toBeNull();
  });

  it("reads back the text that attributesSource writes", () => {
    const set = {
      a: 1,
      s: "12",
      t: "a, b",
      flag: false,
      list: ["x"],
      date: "2026-01-01",
      empty: "",
    };
    expect(valueOf(attributesSource(set))).toEqual(set);
    expect(valueOf(attributesSource({ "a b=": 1 }))).toEqual({ "a b=": 1 });
  });
});

describe("parseAttributes bad input (STORY-008-09 S19)", () => {
  it.each([
    "a=",
    "=1",
    "{bad",
    "<a><b></a>",
    "a",
    "a=1, a=2",
    "<a x='1'>1</a>",
  ])("blocks %s", (text) => {
    expect(codeOf(text)).toBe("bad-attributes");
  });
});

describe("parseAttributes hostile input (STORY-008-09 S21)", () => {
  it("blocks the prototype keys in every form", () => {
    expect(codeOf("__proto__=1")).toBe("blocked-key");
    expect(codeOf('{"constructor":{"prototype":{"p":1}}}')).toBe("blocked-key");
    expect(codeOf('{"__proto__":{"p":1}}')).toBe("blocked-key");
    expect(codeOf('a={"x":{"__proto__":{"p":1}}}')).toBe("blocked-key");
    expect(codeOf("<prototype>1</prototype>")).toBe("blocked-key");
    expect(({} as Record<string, unknown>).p).toBeUndefined();
  });

  it("blocks a DOCTYPE, an entity declaration and an unknown entity", () => {
    expect(codeOf('<!DOCTYPE a [<!ENTITY e "x">]><a>&e;</a>')).toBe(
      "bad-attributes",
    );
    expect(codeOf("<a>&e;</a>")).toBe("bad-attributes");
    expect(codeOf("<!-- c --><a>1</a>")).toBe("bad-attributes");
    expect(valueOf("<a>&lt;b&gt; &amp;</a>")).toEqual({ a: "<b> &" });
  });

  it("keeps markup as text in a key=value pair", () => {
    expect(valueOf("x=<script>1</script>")).toEqual({
      x: "<script>1</script>",
    });
    expect(codeOf("<img src=x onerror=alert(1)>=<script>1</script>")).toBe(
      "bad-attributes",
    );
  });

  it("ends a 1 MB text and a deep value at once", () => {
    const start = performance.now();
    expect(codeOf("a=".padEnd(1_000_000, "x"))).toBe("too-long");
    expect(codeOf(`a=${"[".repeat(5000)}${"]".repeat(5000)}`)).toBe(
      "bad-attributes",
    );
    expect(codeOf("x".repeat(MAX_TEXT))).toBe("bad-attributes");
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe("parseJsonCell (STORY-008-09 S20)", () => {
  it("takes valid JSON of the cell kind only", () => {
    expect(parseJsonCell('["x","y"]', "list")).toEqual({ value: ["x", "y"] });
    expect(parseJsonCell("[x", "list")).toEqual({ code: "not-json" });
    expect(parseJsonCell('{"a":1}', "list")).toEqual({ code: "not-json" });
    expect(parseJsonCell('{"a":1}', "object")).toEqual({ value: { a: 1 } });
    expect(parseJsonCell('{"__proto__":1}', "object")).toEqual({
      code: "blocked-key",
    });
  });
});
