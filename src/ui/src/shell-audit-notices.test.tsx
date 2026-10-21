// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { act } from "preact/test-utils";
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
const { mountApp } = await import("./testFrame");
const { appInput } = await import("./fixtureModel");
const { hostilePayload, shellAudit, MARKERS } = await import("./shellAudit");

const click = (el: Element | null | undefined) =>
  void act(() => (el as HTMLElement).click());

// why: S15 — the hostile payload of STORY-004-02 rule 14 with one record of each skip code, each
// made of marker values
function skippedPayload(): unknown {
  const raw = hostilePayload() as { nodes: unknown[]; edges: unknown[] };
  raw.nodes.push({ label: `${MARKERS[3]}"<>`, type: MARKERS[1] });
  raw.nodes.push({ id: "__proto__", label: `${MARKERS[9]}"<>` });
  raw.edges.push({
    subject: MARKERS[0],
    predicate: MARKERS[15],
    object: `${MARKERS[7]}<missing>`,
  });
  return raw;
}

describe("S15 (STORY-004-08) the chip on the hostile payload", () => {
  it("puts no marker into an attribute or into the copy text", async () => {
    const input = appInput(skippedPayload());
    const codes = input.ok ? input.warnings.map((w) => w.code) : [];
    expect(codes).toEqual(
      expect.arrayContaining(["no-id", "duplicate-id", "dangling-edge"]),
    );
    const frame = await mountApp(input);
    const chip = () => frame.root.querySelector(".data-notice");
    expect(shellAudit(frame.root)).toEqual([]);
    click(chip()?.querySelector(".dn-toggle"));
    expect(chip()?.querySelectorAll(".dn-body li").length).toBe(codes.length);
    expect(shellAudit(frame.root)).toEqual([]);
    const shown = chip()?.textContent?.toLowerCase() ?? "";
    for (const marker of MARKERS) expect(shown).not.toContain(marker);
    click(chip()?.querySelector(".dn-body .btn"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(frame.calls).toHaveLength(1);
    const copied = frame.calls[0].arg.toLowerCase();
    expect(copied.length).toBeGreaterThan(100);
    for (const marker of MARKERS) expect(copied).not.toContain(marker);
    expect(shellAudit(frame.root)).toEqual([]);
  });
});
