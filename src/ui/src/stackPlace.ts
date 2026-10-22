import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

// why: STORY-005-11 rules 1, 5 — the gap of a floating part (mockup styles.css line 304)
const GAP_PX = 6;

type Parts = {
  shell: HTMLElement;
  canvas: HTMLElement;
  controls: Element;
  stack: Element;
  tools: Element | null;
};

type Watch = { observer: ResizeObserver; head: Element | null; measure: () => void };

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
  const peek = parseFloat(card.style.getPropertyValue("--insp-peek"));
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

function liftHead(parts: Parts): void {
  const card = parts.canvas.querySelector<HTMLElement>(":scope > .inspector");
  const head = card?.querySelector(":scope > .insp-head");
  if (!card || !head) return;
  const lift =
    card.dataset.state === "collapsed" ? liftOf(parts, card, head) : 0;
  card.toggleAttribute("data-lift", lift > 0);
  if (lift > 0) card.style.setProperty("--insp-lift", `${lift}px`);
  else card.style.removeProperty("--insp-lift");
}

// why: STORY-005-11 rules 1, 2, 5 — the status stack and the collapsed inspector head move up
// above the bottom controls when they would meet them. One observer per set of floating controls
// watches the App root, the control bar, the stack, the search card and the inspector head; a new
// card state measures again and watches the head of the new card
export function useStackPlace(
  root: RefObject<HTMLElement>,
  frame: RefObject<HTMLElement>,
  actions: object | null,
  card: string,
): void {
  const watch = useRef<Watch | null>(null);
  useLayoutEffect(() => {
    const shell = root.current;
    const canvas = frame.current;
    if (shell === null || canvas === null) return;
    const controls = canvas.querySelector(":scope > .controls");
    const stack = canvas.querySelector(":scope > .status-stack");
    if (actions === null || controls === null || stack === null) {
      canvas.removeAttribute("data-stack");
      return;
    }
    const tools = canvas.querySelector(":scope > .tools");
    const parts: Parts = { shell, canvas, controls, stack, tools };
    const measure = () => {
      placeStack(parts);
      liftHead(parts);
    };
    const observer = new ResizeObserver(measure);
    for (const el of [shell, controls, stack, tools])
      if (el !== null) observer.observe(el);
    watch.current = { observer, head: null, measure };
    return () => {
      observer.disconnect();
      watch.current = null;
    };
  }, [actions]);
  useLayoutEffect(() => {
    const now = watch.current;
    if (now === null) return;
    const head =
      frame.current?.querySelector(":scope > .inspector > .insp-head") ?? null;
    if (head !== now.head) {
      if (now.head !== null) now.observer.unobserve(now.head);
      if (head !== null) now.observer.observe(head);
      now.head = head;
    }
    now.measure();
  }, [actions, card]);
}
