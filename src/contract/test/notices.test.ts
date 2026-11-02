import { describe, expect, it } from "vitest";
import { notices, type Notice } from "../index";

const SA_WARNING = [
  "no-id",
  "duplicate-id",
  "dangling-edge",
  "unknown-type",
  "constraint-violation",
  "glyph-rejected",
  "color-rejected",
  "rank-rejected",
  "layout-rejected",
  "budget-rejected",
  "schema-version-unknown",
  "inferred-rejected",
  "unknown-key",
  "root-not-found",
  "reveal-not-found",
  "shaped-from",
];
const SA_FATAL = [
  "not-object",
  "nodes-not-array",
  "edges-not-array",
  "no-valid-nodes",
  "too-large",
  "not-a-graph",
];
const CANVAS = [
  "no-data",
  "edges-only",
  "types-off",
  "empty-fallback",
  "error-fallback",
];
const S33_CODE = "layout-rejected" as const;
const PLACEHOLDER = /\{(\w+)\}/g;
const LANGUAGES = ["en", "ja"] as const;

type Table = Record<string, Notice>;

function names(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, key: string) => values[key] ?? "—");
}

function sorted(list: readonly string[]): string[] {
  return [...list].sort();
}

function parity(en: Table, ja: Table): string[] {
  const missing = (from: Table, to: Table, label: string) =>
    Object.keys(from)
      .filter((code) => !(code in to))
      .map((code) => `${code} is missing in ${label}`);
  const shared = Object.keys(en).filter((code) => code in ja);
  return [
    ...missing(en, ja, "ja"),
    ...missing(ja, en, "en"),
    ...shared
      .filter(
        (code) =>
          sorted(Object.keys(en[code])).join() !==
          sorted(Object.keys(ja[code])).join(),
      )
      .map((code) => `${code} has other field names`),
    ...shared
      .filter(
        (code) =>
          sorted(en[code].placeholders).join() !==
          sorted(ja[code].placeholders).join(),
      )
      .map((code) => `${code} has other placeholders`),
  ];
}

function partition(entries: [string, string][]) {
  const seen = new Map<string, string>();
  const errors: string[] = [];
  for (const [code, severity] of entries) {
    const before = seen.get(code);
    if (before !== undefined && before !== severity)
      errors.push(`${code} is ${before} and ${severity}`);
    seen.set(code, severity);
  }
  const count = (severity: string) =>
    [...seen.values()].filter((value) => value === severity).length;
  return { errors, count, total: seen.size };
}

describe("notice catalog", () => {
  it("S1 has the same codes, field names and placeholders in en and ja", () => {
    expect(parity(notices.en, notices.ja)).toEqual([]);
  });

  it("S9 names the code that a ja copy does not have", () => {
    const copy = Object.fromEntries(
      Object.entries(notices.ja).filter(([code]) => code !== "dangling-edge"),
    );
    expect(parity(notices.en, copy)).toEqual([
      "dangling-edge is missing in ja",
    ]);
  });

  it("S2 holds every SA §4.2 code, field-rejected and the 5 canvas notices", () => {
    const expected = [...SA_WARNING, ...SA_FATAL, "field-rejected", ...CANVAS];
    expect(sorted(notices.codes)).toEqual(sorted(expected));
    expect(notices.codes).toHaveLength(28);
  });

  it("S3 declares every placeholder of body and ai, and uses each one", () => {
    for (const language of LANGUAGES) {
      for (const [code, entry] of Object.entries(notices[language])) {
        const used = new Set([...names(entry.body), ...names(entry.ai)]);
        expect([...used].sort(), `${language} ${code}`).toEqual(
          sorted(entry.placeholders),
        );
        const extra = [entry.title, ...entry.user].flatMap(names);
        expect(extra, `${language} ${code}`).toEqual([]);
      }
    }
  });

  it("S4 has no HTML tag in any text", () => {
    const all = LANGUAGES.flatMap((language) => [
      ...Object.values(notices[language]).flatMap((entry) => [
        entry.title,
        entry.body,
        entry.ai,
        ...entry.user,
      ]),
      ...Object.values(notices.actions[language]).map((action) => action.label),
      notices.copyMessage[language],
    ]);
    expect(all.filter((text) => /<[a-zA-Z/]/.test(text))).toEqual([]);
  });

  it("S5 uses known actions and has copy on every fatal and error code", () => {
    for (const language of LANGUAGES) {
      for (const [code, entry] of Object.entries(notices[language])) {
        for (const action of entry.actions)
          expect(notices.actions[language]).toHaveProperty(action);
        if (entry.severity === "fatal" || entry.severity === "error")
          expect(entry.actions, code).toContain("copy");
      }
    }
  });

  it("S6 too-large names the caps and asks for a smaller result", () => {
    expect(notices.en["too-large"].ai).toMatch(
      /2,000 nodes.*4,000 edges.*256 KB/,
    );
    expect(notices.en["too-large"].ai).toContain("smaller result");
    expect(notices.ja["too-large"].ai).toMatch(
      /2,000 ノード.*4,000 エッジ.*256 KB/,
    );
    expect(notices.ja["too-large"].ai).toContain("より小さい結果");
  });

  it("S7 not-a-graph names nodes, edges and the two shape hints", () => {
    for (const language of LANGUAGES) {
      const ai = notices[language]["not-a-graph"].ai;
      for (const part of [
        "`nodes`",
        "`edges`",
        "`shape`",
        'kind: "rows"',
        'kind: "tree"',
      ])
        expect(ai, `${language} ${part}`).toContain(part);
    }
  });

  it("S14 puts each code in exactly one severity: 6 / 17 / 4 / 1", () => {
    const result = partition(Object.entries(notices.severity));
    expect(result.errors).toEqual([]);
    expect(result.count("fatal")).toBe(6);
    expect(result.count("warning")).toBe(17);
    expect(result.count("empty")).toBe(4);
    expect(result.count("error")).toBe(1);
    expect(result.total).toBe(28);
    expect(notices.severity["too-large"]).toBe("fatal");
    expect(notices.severity["field-rejected"]).toBe("warning");
    for (const language of LANGUAGES)
      for (const code of notices.codes)
        expect(notices[language][code].severity).toBe(notices.severity[code]);
  });

  it("S15 reports a code that is in two severities", () => {
    const entries: [string, string][] = [
      ...Object.entries(notices.severity),
      ["too-large", "warning"],
    ];
    expect(partition(entries).errors).toEqual([
      "too-large is fatal and warning",
    ]);
  });

  it("S13 has the same 5 actions with labels, primary flag and icon in en and ja", () => {
    const { en, ja } = notices.actions;
    expect(Object.keys(en).join()).toBe(
      "show-types,reset-view,retry,table,copy",
    );
    expect(Object.keys(ja)).toEqual(Object.keys(en));
    for (const [name, action] of Object.entries(en)) {
      const other = ja[name as keyof typeof ja];
      expect(action.label.length, name).toBeGreaterThan(0);
      expect(other.label.length, name).toBeGreaterThan(0);
      expect(other.primary, name).toBe(action.primary);
      expect(other.icon, name).toBe(action.icon);
    }
  });
});

describe("S16 field names in the For the data provider texts", () => {
  const all = (
    language: "en" | "ja",
    code: keyof typeof notices.en,
    parts: string[],
  ) => {
    for (const part of parts)
      expect(
        notices[language][code].ai,
        `${language} ${code} ${part}`,
      ).toContain(part);
  };
  const shapes = [
    "circle",
    "triangle",
    "square",
    "diamond",
    "pentagon",
    "hexagon",
    "heptagon",
    "octagon",
  ];

  it.each(LANGUAGES)(
    "names the fields and their allowed values (%s)",
    (language) => {
      all(language, "rank-rejected", [
        "`types[t].rank`",
        "0",
        "6",
        "`types[t].shape`",
        ...shapes,
      ]);
      all(language, "glyph-rejected", [
        "`types[t].glyph`",
        "512",
        "`types[t].abbr`",
        "2",
      ]);
      all(language, S33_CODE, [
        "`view.layout`",
        "`types[t].role`",
        "`structure`",
        "`attribute`",
        "`curation`",
        "`types[t].level`",
        "0–n",
        "`shape`",
        'kind: "rows"',
        'kind: "tree"',
        language === "en"
          ? "top-level `shape` hint"
          : "トップレベルの `shape` ヒント",
      ]);
      all(language, "field-rejected", [
        language === "en" ? "node" : "ノード",
        language === "en" ? "edge" : "エッジ",
        "`types`",
        "`predicates`",
        "`fields`",
        "`vocabulary`",
        "`defaults`",
        "`view.approach`",
        "`path`",
      ]);
    },
  );
});
