import { profile } from "#contract";
import {
  canvasColor,
  firstView,
  frontier,
  LABEL_CHARS,
  normalize,
  resolveVocab,
  setLayout,
  type Hex,
} from "#engine";
import { loadFixture } from "#fixtures";
import { iconMetrics, type RendererText } from "#renderer";
import { describe, expect, it } from "vitest";
import { middleCut } from "./labels";
import { sceneOf } from "./scene";

const NOW = "2026-10-19";
const CANVAS = canvasColor("#F4F4F5") as Hex;
const TEXT = {
  groupLabel: (typeLabel: string, count: number) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  lostMark: "lost",
} as RendererText;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const clusters = (s: string) =>
  Array.from(graphemes.segment(s), (g) => g.segment);
// why: a code unit of a surrogate pair is lone when its partner is not next to it
function loneSurrogates(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const high = c >= 0xd800 && c <= 0xdbff;
    const low = c >= 0xdc00 && c <= 0xdfff;
    const next = s.charCodeAt(i + 1);
    if (high && next >= 0xdc00 && next <= 0xdfff) i++;
    else if (high || low) n++;
  }
  return n;
}

// The S7 Then for one label: not cut at ≤ 22 clusters; else 22 clusters, head + "…" + tail.
function checkCut(label: string): string {
  const all = clusters(label);
  const out = middleCut(label);
  if (all.length <= LABEL_CHARS) {
    expect(out).toBe(label);
    return out;
  }
  const parts = clusters(out);
  expect(parts).toHaveLength(LABEL_CHARS);
  expect(parts[14]).toBe("…");
  expect(parts.slice(0, 14)).toEqual(all.slice(0, 14));
  expect(parts.slice(15)).toEqual(all.slice(-7));
  expect(label.startsWith(parts.slice(0, 14).join(""))).toBe(true);
  expect(label.endsWith(parts.slice(15).join(""))).toBe(true);
  expect(loneSurrogates(out)).toBeLessThanOrEqual(loneSurrogates(label));
  return out;
}

const ZWJ = "\u{1F469}‍\u{1F4BB}";
const ACUTE = "é";
const EMOJI = "\u{1F600}";
const ARABIC = "مستودع_البيانات_الرئيسي_للمبيعات";

describe("S7 the middle cut by grapheme clusters", () => {
  it("does not cut 21, 22 or 0 clusters", () => {
    for (const label of ["a".repeat(21), "a".repeat(22), ""])
      expect(checkCut(label)).toBe(label);
  });

  it("cuts 23 clusters into the first 14, '…' and the last 7", () => {
    expect(checkCut("abcdefghijklmnopqrstuvw")).toBe("abcdefghijklmn…qrstuvw");
  });

  it("cuts 10,000 clusters to 22", { timeout: 5000 }, () => {
    expect(checkCut("z".repeat(10000))).toBe(
      `${"z".repeat(14)}…${"z".repeat(7)}`,
    );
  });

  it("keeps a '…' of the label as one cluster of the label", () => {
    const label = `${"a".repeat(10)}…${"b".repeat(20)}`;
    expect(checkCut(label)).toBe(`${"a".repeat(10)}…bbb…${"b".repeat(7)}`);
  });

  it("cuts an Arabic label by its letters", () => {
    expect(clusters(ARABIC)).toHaveLength(ARABIC.length);
    expect(checkCut(ARABIC)).toBe(`${ARABIC.slice(0, 14)}…${ARABIC.slice(-7)}`);
  });

  it("cuts 30 × U+20BB7 with no lone surrogate", () => {
    const out = checkCut("\u{20BB7}".repeat(30));
    expect(out).toBe(`${"\u{20BB7}".repeat(14)}…${"\u{20BB7}".repeat(7)}`);
    expect(loneSurrogates(out)).toBe(0);
  });

  it("keeps an emoji whole at both cut points", () => {
    const label = `${"a".repeat(13)}${EMOJI}${"x".repeat(9)}${EMOJI}bbbbbb`;
    expect(clusters(label)).toHaveLength(30);
    expect(checkCut(label)).toBe(`${"a".repeat(13)}${EMOJI}…${EMOJI}bbbbbb`);
  });

  it("keeps a ZWJ sequence and a letter with U+0301 whole at a cut point", () => {
    const zwj = `${"a".repeat(13)}${ZWJ}${"x".repeat(9)}${ZWJ}bbbbbb`;
    expect(checkCut(zwj)).toBe(`${"a".repeat(13)}${ZWJ}…${ZWJ}bbbbbb`);
    const acute = `${"a".repeat(13)}${ACUTE}${"x".repeat(9)}${ACUTE}bbbbbb`;
    expect(checkCut(acute)).toBe(`${"a".repeat(13)}${ACUTE}…${ACUTE}bbbbbb`);
  });

  it("keeps a lone surrogate from JSON as text and makes no new one", () => {
    const json = `"${"a".repeat(5)}\\uD800${"b".repeat(25)}"`;
    const label = JSON.parse(json) as string;
    expect(loneSurrogates(label)).toBe(1);
    const out = checkCut(label);
    expect(out).toBe(`aaaaa\uD800${"b".repeat(8)}…${"b".repeat(7)}`);
    expect(loneSurrogates(out)).toBe(1);
  });
});

function scene(key: string) {
  const r = normalize(loadFixture(key).input, { now: NOW });
  if (!r.ok) throw new Error(`fatal ${r.fatal.code}`);
  const { vocab } = resolveVocab(r.graph, r.payload, profile, CANVAS);
  const first = firstView(r.graph, vocab, r.payload, r.hash);
  const view = frontier(first, r.graph, vocab);
  const state = setLayout(first, view, vocab, first.layout, iconMetrics);
  return sceneOf({ state, frontier: view, vocab, canvas: CANVAS }, TEXT);
}

const EXACT: [string, string, string, number, string][] = [
  [
    "s-designed",
    "e:reg_eu_battery",
    "EU Battery Regulation 2023/1542",
    31,
    "EU Battery Reg…23/1542",
  ],
  [
    "s-dirty",
    "e:t2",
    "顧客マスタ_統合_2024年度版_最終確定（営業本部・経理部共同管理）",
    35,
    "顧客マスタ_統合_2024年…理部共同管理）",
  ],
  [
    "s-dirty",
    "e:t3",
    "very_long_table_name_that_was_generated_by_an_ingestion_tool_without_any_human_review_v2_final",
    94,
    "very_long_tabl…2_final",
  ],
  [
    "s-extend",
    "e:bk_glossary",
    "Finance glossary FY25.pdf",
    25,
    "Finance glossa…Y25.pdf",
  ],
  [
    "s-mixed-designed",
    "e:exp_212",
    "exp-212 · churn retrain",
    23,
    "exp-212 · chur…retrain",
  ],
  [
    "s-designed-glyph",
    "e:prd_bike",
    "E-bike drivetrain kit",
    21,
    "E-bike drivetrain kit",
  ],
  ["s-dirty", "e:u1", "", 0, ""],
];

describe("S7, S8 the canvas text of the named fixture labels", () => {
  it.each(EXACT)("%s %s", (key, id, full, count, text) => {
    const node = scene(key).nodes.find((n) => n.id === id);
    expect(node?.fullLabel).toBe(full);
    expect(clusters(full)).toHaveLength(count);
    expect(node?.label).toBe(text);
    expect(checkCut(full)).toBe(text);
  });
});
