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
const { mountApp } = await import("./testFrame");
const { fixtureModel } = await import("./fixtureModel");

type Frame = Awaited<ReturnType<typeof mountApp>>;

const HEIGHT = 720;
const part = (frame: Frame, selector: string) =>
  frame.root.querySelector(selector) as Element;
const raised = (frame: Frame) =>
  part(frame, "main.canvas").getAttribute("data-stack");
const at = (frame: Frame, width: number) => {
  frame.resize({ width, height: HEIGHT });
  return raised(frame);
};

// why: S5 — each stub box has `left: 0`, so by the rule 1 form the gap is
// root width / 2 − stack width / 2 − control-bar width
async function mount(): Promise<Frame> {
  const frame = await mountApp(fixtureModel("s-access"), {
    size: { width: 1280, height: HEIGHT },
  });
  frame.sizeOf(part(frame, ".controls"), { width: 535, height: 31 });
  frame.sizeOf(part(frame, ".status-stack"), { width: 353, height: 32 });
  return frame;
}

describe("S5 the stack state follows the measured gap", () => {
  it("sets the state below a gap of 6 px and clears it from 6 px", async () => {
    const frame = await mount();
    expect(at(frame, 1280)).toBe("raised");
    expect(at(frame, 1600)).toBeNull();
    expect(at(frame, 1433)).toBe("raised");
    expect(at(frame, 1435)).toBeNull();
    expect(at(frame, 1437)).toBeNull();
  });

  it("measures again when the stack or the control bar changes its width", async () => {
    const frame = await mount();
    expect(at(frame, 1280)).toBe("raised");
    frame.sizeOf(part(frame, ".status-stack"), { width: 150, height: 32 });
    expect(at(frame, 1280)).toBeNull();
    frame.sizeOf(part(frame, ".status-stack"), { width: 353, height: 32 });
    expect(at(frame, 1280)).toBe("raised");
    frame.sizeOf(part(frame, ".controls"), { width: 300, height: 31 });
    expect(at(frame, 1280)).toBeNull();
  });
});

// why: S5b, rule 2 and rule 5 — the stub runs every observer on each `resize`, so the observed
// targets show which sizes start a measure
const NAMES: [string, string][] = [
  [".shell", "root"],
  [".controls", "controls"],
  [".status-stack", "stack"],
  [".tools", "tools"],
  [".insp-head", "head"],
];
function watched(frame: Frame): string[][] {
  return frame
    .observed()
    .map((targets) =>
      targets.flatMap((el) =>
        NAMES.filter(([selector]) => el.matches(selector)).map(([, n]) => n),
      ),
    )
    .filter((names) => names.includes("stack") || names.includes("controls"));
}

describe("S5b the elements that start a measure", () => {
  it("observes the root, the control bar, the stack and the head, and the search card when narrow", async () => {
    const frame = await mountApp(fixtureModel("s-access"), {
      size: { width: 1280, height: HEIGHT },
    });
    const [mounted, ...others] = watched(frame);
    expect(others).toEqual([]);
    expect(mounted).toEqual(
      expect.arrayContaining(["root", "controls", "stack", "head"]),
    );
    frame.resize({ width: 759, height: HEIGHT });
    const [narrow, ...rest] = watched(frame);
    expect(rest).toEqual([]);
    expect(narrow).toEqual(
      expect.arrayContaining(["root", "controls", "stack", "head", "tools"]),
    );
  });
});
