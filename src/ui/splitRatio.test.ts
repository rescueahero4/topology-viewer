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
const { memoryStorage, mountApp } = await import("./testFrame");
const { fixtureModel } = await import("./fixtureModel");

const KEY = "qt.splitRatio";

function key(target: EventTarget, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  void act(() => void target.dispatchEvent(event));
  return event;
}

const press = (root: Element, name: string) => {
  const button = [...root.querySelectorAll<HTMLElement>("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  );
  void act(() => button?.click());
};
const handle = (root: Element) =>
  root.querySelector(".wb-handle") as HTMLElement;
const share = (root: Element) => handle(root).getAttribute("aria-valuenow");
// why: STORY-004-09 rule 1 — split.ts sets the canvas height (split 600 px × the canvas share)
const canvasHeight = (root: Element) =>
  (root.querySelector("main.canvas") as HTMLElement).style.height;

async function opened(storage: Storage) {
  const frame = await mountApp(fixtureModel("s-access"), { storage });
  press(frame.root, "Dataset");
  return frame;
}

describe("S18 the handle keys and the stored canvas share", () => {
  it("steps by 5 %, stores the canvas share and reads it at the next mount", async () => {
    const storage = memoryStorage();
    const frame = await opened(storage);
    const { root } = frame;
    expect(handle(root).getAttribute("role")).toBe("separator");
    expect([
      handle(root).getAttribute("aria-valuemin"),
      handle(root).getAttribute("aria-valuemax"),
    ]).toEqual(["20", "80"]);
    expect(share(root)).toBe("40");
    expect(canvasHeight(root)).toBe("360px");
    for (let i = 0; i < 3; i++) key(handle(root), "ArrowUp");
    expect(share(root)).toBe("55");
    expect(canvasHeight(root)).toBe("270px");
    expect(storage.getItem(KEY)).toBe("0.45");
    key(handle(root), "ArrowDown");
    expect(share(root)).toBe("50");
    key(handle(root), "ArrowUp");
    frame.unmount();
    const again = await opened(storage);
    expect(share(again.root)).toBe("55");
    expect(
      [...Array(storage.length).keys()].map((i) => storage.key(i)),
    ).toEqual([KEY]);
  });

  it.each(["0.9", "NaN", "1e400", "0.1", ""])(
    "ignores the stored value %j",
    async (value) => {
      const { root } = await opened(memoryStorage({ [KEY]: value }));
      expect(share(root)).toBe("40");
    },
  );

  it("changes nothing and throws nothing when the storage throws", async () => {
    const refuse = () => {
      throw new Error("SecurityError");
    };
    const storage = { ...memoryStorage(), getItem: refuse, setItem: refuse };
    const { root } = await opened(storage);
    expect(share(root)).toBe("40");
    expect(() => key(handle(root), "ArrowUp")).not.toThrow();
    expect(share(root)).toBe("45");
  });
});

describe("S20 the [ and ] keys", () => {
  it("step the table share only while the Workbench is open and no text field has the focus", async () => {
    const storage = memoryStorage();
    const { root } = await opened(storage);
    const cell = root.querySelector(".wb-table tbody td") as HTMLElement;
    expect(share(root)).toBe("40");
    const shares = [1, 2, 3].map(() => {
      key(cell, "]");
      return share(root);
    });
    expect(shares).toEqual(["45", "50", "55"]);
    key(cell, "[");
    expect(share(root)).toBe("50");
    expect(storage.getItem(KEY)).toBe("0.5");
    const search = root.querySelector(".wb-search") as HTMLElement;
    expect(key(search, "]").defaultPrevented).toBe(false);
    expect(share(root)).toBe("50");
    press(root, "Close table");
    key(document.body, "]");
    expect(share(root)).toBe("50");
    press(root, "Dataset");
    for (let i = 0; i < 6; i++) key(handle(root), "ArrowUp");
    expect(share(root)).toBe("80");
    key(document.body, "]");
    expect(share(root)).toBe("80");
    expect(storage.getItem(KEY)).toBe("0.2");
  });
});
