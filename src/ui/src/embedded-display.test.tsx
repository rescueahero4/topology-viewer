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
const { fixtureModel } = await import("./fixtureModel");

// why: STORY-007-04 S9 — the jsdom part of the full-screen button; the boxes, the accessibility
// names and the host messages are in `apps/widget/test/host/embed-display.spec.ts`

const FULL = ["inline", "fullscreen"];

type Options = NonNullable<Parameters<typeof mountApp>[1]> & {
  width?: number;
};

const mount = ({ width = 760, ...options }: Options) =>
  mountApp(fixtureModel("s-access"), {
    embedded: true,
    displayMode: "inline",
    size: { width, height: 540 },
    ...options,
  });

const toggle = (root: Element) =>
  root.querySelector<HTMLButtonElement>(".tools > button");
const layout = (root: Element) =>
  root.querySelector(".split")?.getAttribute("data-layout");

function run(work: () => void): void {
  void act(work);
  for (let i = 0; i < 120; i++)
    void act(() => {
      vi.advanceTimersByTime(16);
    });
}

describe("S9 the button exists only when the host lists fullscreen", () => {
  it.each([
    ["no list", { availableDisplayModes: undefined }],
    ["inline only", { availableDisplayModes: ["inline"] }],
    ["not embedded", { embedded: false, availableDisplayModes: FULL }],
  ])("%s gives no button", async (_name, options) => {
    const { root } = await mount(options);
    expect(root.querySelector(".tools .search")).not.toBeNull();
    expect(toggle(root)).toBeNull();
  });

  it("puts one button after the search when fullscreen is listed", async () => {
    const { root } = await mount({ availableDisplayModes: FULL });
    const button = toggle(root);
    expect(root.querySelectorAll(".tools > button")).toHaveLength(1);
    expect(button?.previousElementSibling?.classList.contains("search")).toBe(
      true,
    );
    expect(button?.className).toBe("icon-btn float-card display-btn");
    expect(button?.getAttribute("aria-label")).toBe("Full screen");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(button?.hasAttribute("title")).toBe(false);
  });

  it("comes and goes with the listed modes", async () => {
    const frame = await mount({ availableDisplayModes: ["inline"] });
    expect(toggle(frame.root)).toBeNull();
    await frame.update({ availableDisplayModes: FULL });
    expect(toggle(frame.root)).not.toBeNull();
    await frame.update({ availableDisplayModes: ["inline"] });
    expect(toggle(frame.root)).toBeNull();
  });
});

describe("S9 a press asks for the other mode and the state follows displayMode", () => {
  it("asks once per press and changes only on a new displayMode", async () => {
    const frame = await mount({ availableDisplayModes: FULL });
    const { root, calls } = frame;
    run(() => toggle(root)?.click());
    expect(calls).toEqual([{ name: "requestDisplayMode", arg: "fullscreen" }]);
    expect(toggle(root)?.getAttribute("aria-pressed")).toBe("false");
    expect(toggle(root)?.getAttribute("aria-label")).toBe("Full screen");
    await frame.update({ displayMode: "fullscreen" });
    expect(toggle(root)?.getAttribute("aria-pressed")).toBe("true");
    expect(toggle(root)?.getAttribute("aria-label")).toBe("Exit full screen");
    run(() => toggle(root)?.click());
    expect(calls.map((call) => call.arg)).toEqual(["fullscreen", "inline"]);
    expect(toggle(root)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("names the button in ja", async () => {
    const frame = await mount({ availableDisplayModes: FULL, lang: "ja" });
    expect(toggle(frame.root)?.getAttribute("aria-label")).toBe("全画面表示");
    await frame.update({ displayMode: "fullscreen" });
    expect(toggle(frame.root)?.getAttribute("aria-label")).toBe(
      "全画面表示を終了",
    );
  });
});

// why: QA memo 2026-10-25-qa-story-03-mode-change-close — "Expand table" asks for full screen; the
// host can report the mode before or after it makes the frame wider, and in both orders the table
// stays full
describe("a mode change alone keeps the Workbench of Expand table", () => {
  async function expanded() {
    const frame = await mount({ availableDisplayModes: FULL, width: 700 });
    const { root } = frame;
    run(() =>
      root.querySelectorAll<HTMLElement>(".controls .ctl-btn")[4].click(),
    );
    const expand = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand table"]',
    );
    run(() => expand?.click());
    expect(layout(root)).toBe("table-full");
    expect(frame.calls).toEqual([
      { name: "requestDisplayMode", arg: "fullscreen" },
    ]);
    return frame;
  }

  it("mode first, then a wider frame", async () => {
    const frame = await expanded();
    await frame.update({ displayMode: "fullscreen" });
    expect(layout(frame.root)).toBe("table-full");
    run(() => frame.resize({ width: 1440, height: 900 }));
    expect(layout(frame.root)).toBe("table-full");
  });

  it("a wider frame, then the mode", async () => {
    const frame = await expanded();
    run(() => frame.resize({ width: 1440, height: 900 }));
    await frame.update({ displayMode: "fullscreen" });
    expect(layout(frame.root)).toBe("table-full");
  });

  it("a later crossing below 760 px in full screen still closes it", async () => {
    const frame = await expanded();
    await frame.update({ displayMode: "fullscreen" });
    run(() => frame.resize({ width: 1440, height: 900 }));
    run(() => frame.resize({ width: 700, height: 900 }));
    expect(layout(frame.root)).toBe("canvas-only");
  });
});
