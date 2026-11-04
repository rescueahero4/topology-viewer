import type { TopologyOptions } from "../../types/index";

// The custom content of the parts lives outside the Shadow DOM, as children of the host element, and
// shows through native `<slot>` elements in the shell. So the CSS of the page reaches it, and the
// tokens of the viewer inherit into it.

export type SlotEntry = {
  name: string;
  part: string;
  place: string;
  ctx: Readonly<Record<string, unknown>>;
};

type Internals = { __renderSlots?: (entries: readonly SlotEntry[]) => void };

type PartLike = {
  before?: unknown;
  after?: unknown;
  render?: unknown;
  items?: readonly (string | { id: string; render: unknown })[];
};

/** The function or content that a developer gave for one place of a part. */
export function contentOf(
  parts: TopologyOptions["parts"],
  part: string,
  place: string,
): unknown {
  if (parts === undefined || !Object.hasOwn(parts, part)) return undefined;
  const config = (parts as Record<string, PartLike>)[part];
  if (place === "before") return config.before;
  if (place === "after") return config.after;
  if (place === "render") return config.render;
  const id = place.slice("item:".length);
  for (const item of config.items ?? [])
    if (typeof item !== "string" && item.id === id) return item.render;
  return undefined;
}

// The functions in a context are new at each render, so they do not count as a change. This also
// ends the loop of a framework that renders the viewer again after each new context.
function keyOf(ctx: unknown): string {
  try {
    return JSON.stringify(ctx, (_, value: unknown) =>
      typeof value === "function" ? undefined : value,
    );
  } catch {
    return String(Math.random());
  }
}

type DomRender = (
  ctx: Readonly<Record<string, unknown>>,
  element: HTMLElement,
) => void | (() => void);

export function createSlots(
  host: HTMLElement,
  options: () => TopologyOptions & Internals,
) {
  const entries = new Map<string, { entry: SlotEntry; key: string }>();
  const shown = new Map<string, { el: HTMLElement; stop?: (() => void) | void }>();
  let queued = false;

  // With no framework: one child of the host for each slot, and the function of the developer gets it.
  const flushDom = () => {
    const { parts } = options();
    for (const [name, one] of shown)
      if (!entries.has(name)) {
        if (typeof one.stop === "function") one.stop();
        one.el.remove();
        shown.delete(name);
      }
    for (const [name, { entry }] of entries) {
      let one = shown.get(name);
      if (one === undefined) {
        const el = host.ownerDocument.createElement("div");
        el.slot = name;
        el.style.display = "contents";
        host.appendChild(el);
        one = { el };
        shown.set(name, one);
      }
      if (typeof one.stop === "function") one.stop();
      const content = contentOf(parts, entry.part, entry.place);
      if (typeof content === "function")
        one.stop = (content as DomRender)(entry.ctx, one.el);
      else if (content instanceof Node) one.el.replaceChildren(content);
      else one.el.textContent = content === undefined ? "" : String(content);
    }
  };

  const flush = () => {
    queued = false;
    const render = options().__renderSlots;
    if (render !== undefined)
      render([...entries.values()].map((one) => one.entry));
    else flushDom();
  };
  const later = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(flush);
  };

  return {
    publish(entry: SlotEntry) {
      const key = keyOf([entry.part, entry.place, entry.ctx]);
      if (entries.get(entry.name)?.key === key) {
        (entries.get(entry.name) as { entry: SlotEntry }).entry = entry;
        return;
      }
      entries.set(entry.name, { entry, key });
      later();
    },
    remove(name: string) {
      if (entries.delete(name)) later();
    },
    destroy() {
      entries.clear();
      flush();
    },
  };
}
