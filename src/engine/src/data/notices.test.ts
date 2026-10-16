import { notices, parseRenderInput } from "@qdic-topology/contract";
import { describe, expect, it } from "vitest";
import {
  canvasNotice,
  copyMessage,
  dataNoticeLines,
  fill,
  noticeText,
  warningEntries,
  type Lang,
} from "./notices";

const LANGS: Lang[] = ["en", "ja"];
const FATAL = [
  "not-object",
  "nodes-not-array",
  "edges-not-array",
  "no-valid-nodes",
  "too-large",
  "not-a-graph",
];
const STATS = [
  { rawNodes: 0, rawEdges: 0, drawn: 0, typesTotal: 0, typesOff: 0 },
  { rawNodes: 0, rawEdges: 2, drawn: 0, typesTotal: 0, typesOff: 0 },
  { rawNodes: 5, rawEdges: 0, drawn: 0, typesTotal: 3, typesOff: 3 },
  { rawNodes: 5, rawEdges: 0, drawn: 0, typesTotal: 3, typesOff: 1 },
];

const put = (text: string, name: string, value: string) =>
  text.split(`{${name}}`).join(value);

function sample(name: string): unknown {
  if (name === "got") return "array";
  if (name === "limit") return { unit: "nodes", count: 2000 };
  if (name === "kind") return "rows";
  return 3;
}

describe("S19 warning entries from contract issues", () => {
  it("counts each code in catalog order", () => {
    const parsed = parseRenderInput({
      nodes: [],
      types: { x: { glyph: "M0 0 <x>" } },
      view: { layout: "radial", hiddenTypes: [] },
      title: "t",
    });
    expect(parsed.ok).toBe(true);
    const entries = warningEntries(parsed.ok ? parsed.issues : []);
    expect(entries).toEqual([
      { code: "glyph-rejected", count: 1, ids: ["glyph"] },
      { code: "layout-rejected", count: 1, ids: ["layout"] },
      { code: "unknown-key", count: 2, ids: ["title", "hiddenTypes"] },
    ]);
  });
});

describe("S22 every placeholder of every code is replaced", () => {
  const cases = notices.codes.flatMap((code) =>
    LANGS.map((lang) => [code, lang] as const),
  );

  it.each(cases)("%s (%s)", (code, lang) => {
    const { placeholders } = notices[lang][code];
    const filled = placeholders.slice(0, Math.ceil(placeholders.length / 2));
    const info = Object.fromEntries(filled.map((name) => [name, sample(name)]));
    const entry = noticeText(code, info, lang);
    const texts = [entry.title, entry.body, entry.ai, ...entry.user];
    for (const text of texts) expect(text).not.toMatch(/\{\w+\}/);
    const template = notices[lang][code];
    for (const name of placeholders.slice(filled.length))
      if (template.body.includes(`{${name}}`))
        expect(entry.body).toContain("—");
    expect(entry.code).toBe(code);
  });

  it("gives the error-fallback entry for an unknown code", () => {
    const entry = noticeText("no-such-code", {}, "en");
    expect(entry.code).toBe("error-fallback");
    expect(entry.title).toBe(notices.en["error-fallback"].title);
  });
});

describe("S23 the one substitution function", () => {
  const html = "<img src=x onerror=alert(1)>";

  it("inserts a value literally", () => {
    expect(fill("{rawNodes}", { rawNodes: html }, "en")).toBe(html);
    const body = noticeText("no-valid-nodes", { rawNodes: html }, "en").body;
    expect(body).toContain(html);
    expect(
      noticeText("no-valid-nodes", { rawNodes: "X" }, "en").body,
    ).not.toContain("<");
    expect(copyMessage("no-valid-nodes", { rawNodes: html }, "en")).toContain(
      html,
    );
    expect(
      copyMessage("no-valid-nodes", { rawNodes: "X" }, "en"),
    ).not.toContain("<");
  });

  it("does not expand a second time", () => {
    const value = "{rawNodes}$&";
    expect(fill("a {rawEdges} b", { rawEdges: value, rawNodes: 1 }, "en")).toBe(
      "a {rawNodes}$& b",
    );
    expect(noticeText("edges-only", { rawEdges: value }, "en").body).toContain(
      value,
    );
    expect(copyMessage("edges-only", { rawEdges: value }, "en")).toContain(
      value,
    );
  });

  it("cuts a value to 200 characters", () => {
    expect(fill("{rawNodes}", { rawNodes: "x".repeat(5000) }, "en")).toBe(
      "x".repeat(200),
    );
  });
});

describe("S24 the copy message", () => {
  it.each(LANGS)("has the 4 template lines with the got text (%s)", (lang) => {
    const notice = notices[lang]["not-object"];
    const body = put(notice.body, "got", notices.got[lang].array);
    let expected = notices.copyMessage[lang];
    expected = put(expected, "title", notice.title);
    expected = put(expected, "body", body);
    expected = put(expected, "ai", notice.ai);
    expected = put(expected, "detail", "not-object");
    const message = copyMessage(
      "not-object",
      { got: "array" },
      lang,
      "not-object",
    );
    expect(message).toBe(expected);
    expect(message.split("\n")).toHaveLength(4);
    if (lang === "ja") expect(message).not.toContain("array");
  });

  it.each(LANGS)(
    "leaves out the fix and detail lines when empty (%s)",
    (lang) => {
      const notice = notices[lang]["empty-fallback"];
      const [head, body] = notices.copyMessage[lang].split("\n");
      const message = copyMessage("empty-fallback", { rawNodes: 5 }, lang);
      expect(message).toBe(
        [
          put(head, "title", notice.title),
          put(notice.body, "rawNodes", "5"),
        ].join("\n"),
      );
      expect(body).toBe("{body}");
    },
  );
});

describe("S25 the DataNotice lines", () => {
  const warnings = [
    { code: "no-id" as const, count: 2, ids: [] },
    { code: "duplicate-id" as const, count: 1, ids: [] },
    { code: "dangling-edge" as const, count: 3, ids: [] },
    { code: "unknown-type" as const, count: 4, ids: [] },
  ];

  it.each(LANGS)("gives one line per code in catalog order (%s)", (lang) => {
    expect(dataNoticeLines(warnings, lang)).toEqual(
      warnings.map(({ code, count }) =>
        put(notices[lang][code].body, "count", String(count)),
      ),
    );
  });
});

describe("S26 the empty notices", () => {
  it("chooses each empty code from the stats", () => {
    expect(STATS.map(canvasNotice)).toEqual([
      { code: "no-data", info: {} },
      { code: "edges-only", info: { rawEdges: 2 } },
      { code: "types-off", info: { typeCount: 3 } },
      { code: "empty-fallback", info: { rawNodes: 5 } },
    ]);
  });
});

describe("S39 the 11 canvas notices", () => {
  it.each(LANGS)(
    "gives a copy action for each fatal code and error-fallback (%s)",
    (lang) => {
      for (const code of [...FATAL, "error-fallback"]) {
        const entry = noticeText(code, {}, lang);
        expect(entry.code).toBe(code);
        expect(entry.actions).toContain("copy");
      }
    },
  );

  it("gives only the 4 empty codes from canvasNotice", () => {
    const empty = STATS.map((stats) => canvasNotice(stats)?.code);
    expect(new Set(empty)).toEqual(
      new Set(["no-data", "edges-only", "types-off", "empty-fallback"]),
    );
    expect(canvasNotice({ ...STATS[3], drawn: 1 })).toBeNull();
    expect(FATAL.length + 1 + empty.length).toBe(11);
  });

  it("writes the too-large measure in both languages", () => {
    const info = {
      got: { unit: "nodes", count: 5462 },
      limit: { unit: "nodes", count: 2000 },
    };
    expect(noticeText("too-large", info, "en").body).toBe(
      "This result has 5,462 nodes, more than the limit of 2,000 nodes, so nothing is drawn.",
    );
    const ja = noticeText("too-large", info, "ja").body;
    expect(ja).toContain(put(notices.measure.ja.nodes, "count", "5,462"));
  });
});
