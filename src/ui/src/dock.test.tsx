// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import { render } from "preact";
import { useRef } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

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
const { useDock } = await import("./HiddenPanel");
const state = await import("./state");

// why: ISSUE-012 C6 — `useDock` keeps one observer across renders, makes a new one for a new
// inspector element and ends it on unmount
const made: { live: boolean }[] = [];
class Observer {
  readonly me = { live: true };
  constructor() {
    made.push(this.me);
  }
  observe() {}
  disconnect() {
    this.me.live = false;
  }
}

function Frame({ empty, n }: { empty: boolean; n: number }) {
  const frame = useRef<HTMLElement>(null);
  useDock(frame, [empty]);
  return (
    <main ref={frame} data-n={n}>
      <aside key={empty ? "empty" : "card"} class="inspector" />
    </main>
  );
}

afterEach(() => {
  made.length = 0;
});

describe("C6 useDock", () => {
  it("keeps one observer over 10 renders, a new one for a new card, none after unmount", () => {
    vi.stubGlobal("ResizeObserver", Observer);
    const root = document.createElement("div");
    for (let n = 0; n <= 10; n++)
      void act(() => render(<Frame empty={false} n={n} />, root));
    expect(made).toHaveLength(1);
    expect(made.filter((o) => o.live)).toHaveLength(1);
    void act(() => render(<Frame empty n={11} />, root));
    expect(made).toHaveLength(2);
    expect(made.map((o) => o.live)).toEqual([false, true]);
    void act(() => render(null, root));
    expect(made.filter((o) => o.live)).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("in the App, docks to the card that is on the page after it changes", async () => {
    const frame = await mountApp(fixtureModel("s-access"));
    const canvasEl = frame.root.querySelector(".canvas") as HTMLElement;
    const dock = () => canvasEl.style.getPropertyValue("--hid-right");
    expect(dock()).toBe("12px");
    expect(state.selection.value).not.toBeNull();
    void act(() => {
      state.selection.value = null;
    });
    const card = frame.root.querySelector(".inspector") as HTMLElement;
    expect(card.getAttribute("data-state")).toBe("empty");
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.isConnected ? 300 : 100;
      },
    );
    frame.resize({ width: 800, height: 600 });
    expect(dock()).toBe("312px");
  });
});
