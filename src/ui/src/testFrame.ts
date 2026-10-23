import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, vi } from "vitest";
import { App, type AppInput, type AppProps } from "./App";
import type { ShellHost } from "./host";
import { camera } from "./state";

export { enTexts } from "./shellAudit";

// why: rule 15, `canvas.test.ts` lines 55-72 — the caller turns on the fake clock and calls
// `vi.resetModules()` before it imports this module with `await import`, so `d3-timer` loads
// under the fake clock

type Size = { width: number; height: number };
type Call = { name: keyof ShellHost; arg: string };
type Options = Partial<Omit<AppProps, "input" | "host">> & {
  size?: Size;
  reducedMotion?: boolean;
  storage?: Storage;
};

// why: STORY-004-07 test plan — every `<App>` test has its own `localStorage`, empty unless the
// test gives one, so a stored split ratio never goes from one test to the next
export function memoryStorage(start: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(start));
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
}

// why: STORY-005-11 rule 3 — above the 900 px of rule 4, so a test starts with the open inspector
const DEFAULT_FRAME: Size = { width: 1000, height: 600 };

let frame: Size = DEFAULT_FRAME;
let sized = new WeakMap<Element, Size>();
const observers = new Set<Observer>();
const mounted: HTMLElement[] = [];

// why: jsdom 30.1.2 has no ResizeObserver; `resize` sends each observed element its new size
class Observer {
  readonly targets = new Set<Element>();
  runs = 0;
  constructor(readonly callback: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
}

const sizeOfElement = (el: Element) => sized.get(el) ?? frame;
const rect = ({ width, height }: Size) =>
  ({
    ...{ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height },
    ...{ width, height, toJSON: () => ({}) },
  }) as DOMRect;

// why: jsdom gives each element 0 × 0, and the renderer measures its own root (camera.ts lines
// 169-180, 250), so the size goes on every HTMLElement except one that `sizeOf` sets
function install(reduced: boolean, scrolls: Element[]): void {
  vi.stubGlobal("ResizeObserver", Observer);
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: reduced && media.includes("reduce"),
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  const proto = HTMLElement.prototype;
  vi.spyOn(proto, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return rect(sizeOfElement(this));
  });
  vi.spyOn(proto, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return sizeOfElement(this).width;
  });
  vi.spyOn(proto, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return sizeOfElement(this).height;
  });
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolls.push(this);
  };
}

function stubHost(calls: Call[]): ShellHost {
  return {
    copyForAi: (arg) => {
      calls.push({ name: "copyForAi", arg });
      return Promise.resolve("sent");
    },
    openLink: (arg) => {
      calls.push({ name: "openLink", arg });
      return Promise.resolve();
    },
    requestDisplayMode: (arg) => {
      calls.push({ name: "requestDisplayMode", arg });
      return Promise.resolve();
    },
  };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

type FrameOptions = Pick<Options, "size" | "reducedMotion" | "storage">;

// why: STORY-005-03 rule 11 — the frame part of `mountApp`, for a test that renders `<App>` itself
// (the `startWidget` tests of `apps/widget`)
export function mountFrame(options: FrameOptions = {}) {
  frame = options.size ?? DEFAULT_FRAME;
  const scrolls: Element[] = [];
  install(options.reducedMotion === true, scrolls);
  vi.stubGlobal("localStorage", options.storage ?? memoryStorage());
  const root = document.createElement("div");
  document.body.appendChild(root);
  mounted.push(root);
  return {
    root,
    scrolls,
    resize(size: Size) {
      frame = size;
      void act(() => {
        for (const observer of [...observers]) {
          const entries = [...observer.targets]
            .filter((target) => !sized.has(target))
            .map((target) => ({ target, contentRect: rect(size) }));
          observer.runs += 1;
          observer.callback(entries as ResizeObserverEntry[], observer);
        }
      });
    },
    observerRuns: () => [...observers].map((observer) => observer.runs),
    // why: STORY-005-11 rule 3 (ii), S5b — the targets of each stub observer, read only
    observed: () => [...observers].map((observer) => [...observer.targets]),
    sizeOf(el: Element, size: Size) {
      sized.set(el, size);
    },
    // why: STORY-003-04 fake clock — advance by frames until the next `settle` sets the camera
    settle() {
      const before = camera.value;
      for (let i = 0; i < 1000 && camera.value === before; i++)
        void act(() => {
          vi.advanceTimersByTime(16);
        });
      if (camera.value === before) throw new Error("testFrame: no settle");
    },
  };
}

// why: rule 15 — every `<App>` test of STORY-004-02 to 09 mounts through this frame
export async function mountApp(input: AppInput, options: Options = {}) {
  const shell = mountFrame(options);
  const calls: Call[] = [];
  let props: AppProps = {
    input,
    lang: options.lang ?? "en",
    locale: options.locale ?? "en-US",
    theme: options.theme ?? "light",
    host: stubHost(calls),
  };
  const draw = async (next: Partial<AppProps>) => {
    props = { ...props, ...next };
    void act(() => render(h(App, props), shell.root));
    await flush();
  };
  await draw({});
  return {
    ...shell,
    host: props.host,
    calls,
    update: draw,
    unmount: () => void act(() => render(null, shell.root)),
  };
}

afterEach(() => {
  for (const root of mounted.splice(0)) {
    void act(() => render(null, root));
    root.remove();
  }
  observers.clear();
  sized = new WeakMap();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});
