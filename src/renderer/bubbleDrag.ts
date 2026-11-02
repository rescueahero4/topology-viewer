import { drag, type D3DragEvent } from "d3-drag";
import { select } from "d3-selection";
import { timer, type Timer } from "d3-timer";
import type { DrawnId, Point } from "#engine";
import type { Bubble } from "./bubbles";
import { moveTo, pressFilter, watch, type DragHost, type Watch } from "./drag";
import { clientOf, driftOf, gripOf, originOf, type Grip } from "./gesture";

// why: SA §4.5 (A23.2), FR-CANVAS-15 (Q25) — only the pill drags; the controller runs the engine
// `dragBubble` for the vector of each frame and gives back the positions of the moved members
export type BubbleHandlers = {
  start(type: string | null): boolean;
  move(type: string | null, vector: Point): [DrawnId, Point][];
  end(): void;
};

export type BubbleHost = Omit<DragHost, "instant" | "jump"> & {
  root: HTMLDivElement;
  // why: mockup lines 1840-1842 — at the drag start a release playback and a motion jump to
  // their end, and the tooltip hides
  jump(): void;
  hideTip(): void;
};

export type BubbleDrag = {
  bind(): void;
  end(): void;
  running(): boolean;
  drop(): void;
};

type Event = D3DragEvent<SVGGElement, Bubble, Bubble>;
type Press = {
  type: string | null;
  key: string | number;
  from: Point;
  at: Point;
  grip: Grip | null;
  // why: ISSUE-010 — `D(c_prev, t_prev)` of the last frame with finite numbers; (0, 0) before the
  // first frame, so the sum of the vectors since the start is `D(c, t)` (mockup `ev.dx`, line 1849)
  last: Point;
  on: "pressed" | "running" | "done";
};
type M = {
  host: BubbleHost;
  on: BubbleHandlers;
  press: Press | null;
  ticker: Timer | null;
  gen: number;
  w: Watch;
};

const stopTicker = (m: M) => {
  m.ticker?.stop();
  m.ticker = null;
};

// why: mockup lines 1844-1845, 1853-1854 (CSS lines 129, 131) — the grabbing cursor on the root and
// the stronger tint on the bubble of the type, during the drag only; the type is compared by
// value, never put in a selector
function classes(m: M, type: string | null, on: boolean): void {
  m.host.root.classList.toggle("qt-bdragging", on);
  select(m.host.layers.bubbles)
    .selectAll<SVGGElement, Bubble>("g.qt-bubble")
    .classed("qt-bdrag", (b) => on && b.type === type);
}

// why: story "Stuck pill drags and throws" — one `end()`; a throw in it is reported once, and a
// draw inside it (a `drag-end` handler that calls a method) gives its own settle
function finish(m: M, p: Press, settle: boolean): void {
  stopTicker(m);
  watch(m.w, false);
  p.on = "done";
  classes(m, p.type, false);
  const gen = m.gen;
  try {
    m.on.end();
  } catch {
    return m.host.failed();
  }
  if (settle && gen === m.gen && m.host.live()) m.host.settled();
}

// why: story "Pill drag" — once per frame the vector of the pointer rule; a frame with a pointer
// or a transform that is not finite, or with the vector (0, 0), calls no handler
function frame(m: M): void {
  const p = m.press;
  if (!m.host.live()) return;
  if (p?.on !== "running") return stopTicker(m);
  try {
    if (p.grip === null) return;
    const svg = m.host.layers.svg;
    const d = driftOf(p.grip, p.at, m.host.transform(), originOf(svg));
    if (d === null) return;
    const v = { x: d.x - p.last.x, y: d.y - p.last.y };
    if (v.x === 0 && v.y === 0) return;
    p.last = d;
    moveTo(m.host, m.on.move(p.type, v));
  } catch {
    finish(m, p, false);
    m.host.failed();
  }
}

// why: story "Pill drag", "Second press" — at the first move that is not zero; while another drag
// runs the press ends here. A throw in the jumps or in `start` reports once and starts nothing
function begin(m: M, p: Press): void {
  p.on = "done";
  if (m.host.running()) return;
  let ok = false;
  try {
    m.host.jump();
    m.host.hideTip();
    ok = m.on.start(p.type) === true;
  } catch {
    return m.host.failed();
  }
  if (!ok || !m.host.live() || m.press !== p) return;
  p.grip = gripOf(p.from, m.host.transform(), originOf(m.host.layers.svg));
  p.on = "running";
  classes(m, p.type, true);
  watch(m.w, true);
  m.ticker = timer(() => frame(m));
}

function started(m: M, event: Event, b: Bubble): void {
  if (!m.host.live()) return;
  const at = clientOf(event);
  m.press =
    at === null
      ? null
      : {
          type: b.type,
          key: event.identifier,
          from: at,
          at,
          grip: null,
          last: { x: 0, y: 0 },
          on: "pressed",
        };
}

// why: STORY-003-06a "Stuck drags" — `buttons` 0 on a `mousemove` ends the drag at once
function dragged(m: M, event: Event): void {
  const p = m.press;
  if (!m.host.live() || p === null || p.on === "done") return;
  if (p.key !== event.identifier) return;
  const src = event.sourceEvent as MouseEvent;
  if (src.type === "mousemove" && src.buttons === 0) {
    if (p.on === "running") finish(m, p, true);
    p.on = "done";
    return;
  }
  const at = clientOf(event);
  if (at === null) return;
  p.at = at;
  if (p.on === "pressed" && (at.x !== p.from.x || at.y !== p.from.y))
    begin(m, p);
}

// why: mockup line 552 — a press with no move makes no action
function ended(m: M, event: Event): void {
  const p = m.press;
  if (!m.host.live() || p === null || p.key !== event.identifier) return;
  m.press = null;
  if (p.on === "running") finish(m, p, true);
}

// why: story "Stuck pill drags and throws", owner decision H8 — the stuck ends of STORY-003-06a;
// at the end of the renderer a pill drag is dropped with no `end()` call
export function createBubbleDrag(
  host: BubbleHost,
  handlers: BubbleHandlers,
): BubbleDrag {
  const stuck = () => {
    const p = m.press;
    if (host.live() && p?.on === "running") finish(m, p, true);
  };
  const m: M = {
    host,
    on: handlers,
    press: null,
    ticker: null,
    gen: 0,
    w: {
      doc: host.doc,
      signal: host.signal,
      stuck,
      hide: () => {
        if (host.doc.hidden) stuck();
      },
    },
  };
  const behaviour = drag<SVGGElement, Bubble>()
    .filter(pressFilter(() => host.running()))
    .on("start", (event: Event, b) => started(m, event, b))
    .on("drag", (event: Event) => dragged(m, event))
    .on("end", (event: Event) => ended(m, event));
  const pills = () =>
    select(host.layers.bubbleLabels).selectAll<SVGGElement, Bubble>(
      "g.qt-blabel",
    );
  return {
    bind: () => pills().call(behaviour),
    end() {
      m.gen++;
      const p = m.press;
      if (p?.on === "running") finish(m, p, false);
    },
    running: () => m.press?.on === "running",
    drop() {
      stopTicker(m);
      if (m.press?.on === "running") watch(m.w, false);
      if (m.press !== null) m.press.on = "done";
      pills().on(".drag", null);
    },
  };
}
