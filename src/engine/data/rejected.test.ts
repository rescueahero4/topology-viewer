import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { copyMessage, noticeText, warningEntries } from "./notices";

const COLOR = `#${"a".repeat(64)}`;
const REJECTED = ["<script>", "radial", COLOR, "SECRET-TITLE"];

describe("S20 a rejected string never reaches the output", () => {
  it("is absent from graph, issues, warnings, payload and every notice text", () => {
    const result = normalize(
      {
        nodes: [{ id: "n0", type: "x" }],
        types: { x: { label: "X", glyph: "M0 0 <script>", color: COLOR } },
        view: { layout: "radial" },
        title: "SECRET-TITLE",
      },
      { now: "2026-10-14" },
    );
    expect(COLOR).toHaveLength(65);
    if (!result.ok) throw new Error("expected ok");
    const { graph, issues, warnings, payload } = result;
    expect(warningEntries(issues)).toEqual(warnings);
    expect(warnings.map((w) => w.code)).toEqual([
      "glyph-rejected",
      "color-rejected",
      "layout-rejected",
      "unknown-key",
    ]);
    const texts = warnings.flatMap(({ code, count }) =>
      (["en", "ja"] as const).flatMap((lang) => {
        const entry = noticeText(code, { count }, lang);
        return [
          entry.title,
          entry.body,
          entry.ai,
          ...entry.user,
          copyMessage(code, { count }, lang, code),
        ];
      }),
    );
    const output = JSON.stringify({ graph, issues, warnings, payload, texts });
    for (const value of REJECTED) expect(output).not.toContain(value);
  });
});
