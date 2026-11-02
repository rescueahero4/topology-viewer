import type {
  Action,
  CanvasState,
  Frontier,
  Selection,
} from "#engine";
import type { Camera } from "#renderer";

export type NoticeKind = "zero-size" | "error" | "last-drawn";

// why: SA §4.5 events; Security A4 (criterion 3) — no event carries the model, the payload, the
// graph or the vocab, and a notice carries its kind only (no error object, message or stack)
export type CanvasEvent = {
  select: { selection: Selection; state: CanvasState };
  explore: { action: Action; state: CanvasState };
  "drag-end": { state: CanvasState };
  settle: { state: CanvasState; frontier: Frontier; camera: Camera };
  notice: { kind: NoticeKind };
};

export type EventName = keyof CanvasEvent;
type Handler<K extends EventName> = (event: CanvasEvent[K]) => void;
type Handlers = { [K in EventName]: Set<Handler<K>> };

export type Events = {
  on<K extends EventName>(name: K, handler: Handler<K>): () => void;
  emit<K extends EventName>(name: K, event: CanvasEvent[K]): void;
};

const NAMES: readonly EventName[] = [
  "select",
  "explore",
  "drag-end",
  "settle",
  "notice",
];

// why: Security A5 — each handler runs in its own `try`/`catch`; a throw does not stop the other
// handlers, the routing or the motion, and it goes nowhere, so a throw in a `notice` handler gives
// no further notice. After the end of the canvas no event fires (owner decision H8)
export function createEvents(live: () => boolean): Events {
  const handlers: Handlers = {
    select: new Set(),
    explore: new Set(),
    "drag-end": new Set(),
    settle: new Set(),
    notice: new Set(),
  };
  return {
    on(name, handler) {
      if (!NAMES.includes(name) || typeof handler !== "function")
        return () => {};
      const set = handlers[name] as Set<Handler<typeof name>>;
      const own: Handler<typeof name> = (event) => handler(event);
      set.add(own);
      return () => {
        set.delete(own);
      };
    },
    emit(name, event) {
      if (!live()) return;
      for (const handler of [...handlers[name]])
        try {
          handler(event);
        } catch {
          // why: Security A5 — the error of a handler goes nowhere
        }
    },
  };
}
