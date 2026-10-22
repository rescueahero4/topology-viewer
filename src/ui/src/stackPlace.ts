import { computed } from "@preact/signals";
import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { canvasState, frontier, model } from "./state";

// why: STORY-005-11 rules 1, 5 — the gap of a floating part (mockup styles.css line 304)
const GAP_PX = 6;
// why: the head height of a collapsed card (`translateY(calc(100% - 32px))`, shell-panels.css)
const PEEK_PX = 32;
// why: STORY-005-11 rule 5; STORY-005-07 (ISSUE-025) — the collapsed Hidden card meets the control
// bar below 760 px as the inspector head does, so it moves up the same way
const CARDS = [
  { card: ".inspector", head: ".insp-head", lift: "--insp-lift" },
  { card: ".hidden-panel", head: ".hid-head", lift: "--hid-lift" },
];

// why: ControlBar.tsx renders `.controls` only with a model, a state and a frontier, so the bar
// comes after the first `settle` of each canvas, and a new input makes a new bar
const barShown = computed(
  () =>
    model.value !== null &&
    canvasState.value !== null &&
    frontier.value !== null,
);

type Parts = {
  shell: HTMLElement;
  canvas: HTMLElement;
  controls: Element;
  stack: Element;
  tools: Element | null;
};

const apart = (a: DOMRect, b: DOMRect) =>
  a.right <= b.left || b.right <= a.left;

// why: STORY-005-11 rule 1 — the left edge of the stack at its centred place, from its width and
// not its `left`, so a raised stack gives the same gap
function placeStack({ canvas, controls, stack }: Parts): void {
  const box = canvas.getBoundingClientRect();
  const left =
    box.left + box.width / 2 - stack.getBoundingClientRect().width / 2;
  if (left - controls.getBoundingClientRect().right < GAP_PX)
    canvas.setAttribute("data-stack", "raised");
  else canvas.removeAttribute("data-stack");
}

// why: STORY-005-11 rule 5, build note N6 — the head box at its unlifted place, from the canvas
// box, the card inset and `--insp-peek`, because the head itself moves during the slide
function liftOf(parts: Parts, card: HTMLElement, head: Element): number {
  const canvas = parts.canvas.getBoundingClientRect();
  const peek =
    parseFloat(card.style.getPropertyValue("--insp-peek")) || PEEK_PX;
  const inset = parseFloat(getComputedStyle(card).bottom);
  const top = canvas.bottom - inset - peek + card.clientTop;
  const bottom = top + head.getBoundingClientRect().height;
  const span = card.getBoundingClientRect();
  const narrow = parts.shell.hasAttribute("data-narrow");
  const below = [parts.controls, parts.stack, narrow ? parts.tools : null]
    .flatMap((el) => (el === null ? [] : [el.getBoundingClientRect()]))
    .filter((box) => box.width > 0 && !apart(span, box));
  if (!below.some((box) => box.top < bottom && top < box.bottom)) return 0;
  const lift = bottom - (Math.min(...below.map((box) => box.top)) - GAP_PX);
  return Number.isFinite(lift) ? lift : 0;
}

function liftHead(parts: Parts, part: (typeof CARDS)[number]): void {
  const card = parts.canvas.querySelector<HTMLElement>(`:scope > ${part.card}`);
  const head = card?.querySelector(`:scope > ${part.head}`);
  if (!card || !head) return;
  const lift =
    card.dataset.state === "collapsed" ? liftOf(parts, card, head) : 0;
  card.toggleAttribute("data-lift", lift > 0);
  if (lift > 0) card.style.setProperty(part.lift, `${lift}px`);
  else card.style.removeProperty(part.lift);
}

function partsOf(
  root: RefObject<HTMLElement>,
  frame: RefObject<HTMLElement>,
): Parts | null {
  const shell = root.current;
  const canvas = frame.current;
  const controls = canvas?.querySelector(":scope > .controls");
  const stack = canvas?.querySelector(":scope > .status-stack");
  if (!shell || !canvas || !controls || !stack) return null;
  const tools = canvas.querySelector(":scope > .tools");
  return { shell, canvas, controls, stack, tools };
}

function measure(parts: Parts): void {
  placeStack(parts);
  for (const part of CARDS) liftHead(parts, part);
}

type Watch = { observer: ResizeObserver; parts: Parts | null; on: Element[] };

// why: STORY-005-11 rules 1, 2, 5 — the status stack and the collapsed inspector head move up
// above the bottom controls when they would meet them. One observer for the life of the App
// watches the App root, the control bar, the stack, the search card and the inspector head; a new
// set of floating controls, a new control bar or a new card state changes its targets and
// measures again
export function useStackPlace(
  root: RefObject<HTMLElement>,
  frame: RefObject<HTMLElement>,
  actions: object | null,
  card: string,
): void {
  const shown = barShown.value;
  const watch = useRef<Watch | null>(null);
  useLayoutEffect(() => {
    const now: Watch = {
      parts: null,
      on: [],
      observer: new ResizeObserver(() => {
        if (now.parts !== null) measure(now.parts);
      }),
    };
    watch.current = now;
    return () => now.observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const now = watch.current;
    if (now === null) return;
    const parts = actions !== null && shown ? partsOf(root, frame) : null;
    const heads = CARDS.map((part) =>
      frame.current?.querySelector(`:scope > ${part.card} > ${part.head}`),
    );
    const on =
      parts === null
        ? []
        : [parts.shell, parts.controls, parts.stack, parts.tools, ...heads];
    const next = on.filter((el): el is Element => el != null);
    for (const el of now.on) if (!next.includes(el)) now.observer.unobserve(el);
    for (const el of next) if (!now.on.includes(el)) now.observer.observe(el);
    now.on = next;
    now.parts = parts;
    if (parts !== null) measure(parts);
    else frame.current?.removeAttribute("data-stack");
  }, [actions, shown, card]);
}
