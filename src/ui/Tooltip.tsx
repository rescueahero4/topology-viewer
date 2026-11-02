import type { ComponentChildren, JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { useElementId } from "./ids";

type At = { x: number; y: number };
// why: STORY-004-05 rules 5, 10 (Security gap 1) — a tip of many lines is a function, so its lines
// are made only when the tip opens, never at render
export type TipText = string | (() => readonly string[]);
type Box = { left: number; top: number; width: number };
// why: STORY-007-03 rule 5 — a tip above its anchor is placed in two passes: the first render
// measures the tip box, then `at` moves it; `box` is the anchor box until that measure
type Shown = {
  key: string;
  tip: string | readonly string[];
  at: At;
  top?: boolean;
  box?: Box;
};

export type Tip = ReturnType<typeof useTip>;

// why: the CSS `max-width` of `.tip` and the mockup edge gap (app.js lines 521-523): a tip near the
// right edge moves left, so a tip of the right-hand inspector stays inside the frame
const TIP_WIDTH = 240;
const GAP = 8;

function placeOf(event: Event): At {
  const anchor = event.currentTarget as Element;
  const box = anchor.getBoundingClientRect();
  const width = anchor.ownerDocument.documentElement.clientWidth;
  const right = width > 0 ? width - TIP_WIDTH - GAP : Infinity;
  return {
    x: Math.max(GAP, Math.min(box.right + GAP, right)),
    y: box.top + box.height / 2,
  };
}

// why: STORY-007-03 rule 5 (app.js lines 524-527) — the tip centre is over the anchor centre, its
// bottom 8 px above the anchor, and it stays 8 px inside the frame at the left, right and top
function aboveOf(box: Box, tip: HTMLElement): At {
  const width = tip.ownerDocument.documentElement.clientWidth;
  const { offsetWidth: w, offsetHeight: h } = tip;
  return {
    x: Math.max(
      GAP,
      Math.min(box.left + box.width / 2 - w / 2, width - w - GAP),
    ),
    y: Math.max(GAP, box.top - h - GAP),
  };
}

function boxOf(event: Event): Box {
  const { left, top, width } = (
    event.currentTarget as Element
  ).getBoundingClientRect();
  return { left, top, width };
}

// why: STORY-007-03 rule 5 (embed.js line 31) — no tip shows over the open menu of its button
const menuOpen = (event: Event) => {
  const el = event.currentTarget as Element;
  return (
    el.getAttribute("aria-haspopup") === "true" &&
    el.getAttribute("aria-expanded") === "true"
  );
};

const made = (tip: TipText) => (typeof tip === "string" ? tip : tip());

// why: STORY-004-09 rule 5 (NF-5) — the Escape key of the App hides a shown tip, also one that
// shows on hover while the focus is elsewhere, and then does nothing else
const shownTips = new Set<() => void>();

export function closeTips(): boolean {
  if (shownTips.size === 0) return false;
  for (const hide of [...shownTips]) hide();
  return true;
}

function body(tip: Shown["tip"]) {
  if (typeof tip === "string") return tip;
  return tip.map((line, i) => (
    <span key={i} class="tip-line">
      {line}
    </span>
  ));
}

type Handlers = {
  key: string;
  shown: Shown | null;
  id: string;
  show: (event: Event) => void;
  hide: () => void;
};

function handlers({ key, shown, id, show, hide }: Handlers) {
  return {
    "aria-describedby": shown?.key === key ? id : undefined,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    // why: STORY-004-09 rule 5 (QA Done gate item 1) — the anchor takes the Escape of its shown
    // tip, as `Menu` does, so the Escape of the App does not clear the selection after the
    // render of the hide (a user key press runs the microtasks between the two listeners)
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Escape" || shown?.key !== key) return;
      event.preventDefault();
      hide();
    },
  };
}

// why: P18, P21, f-0053 — the tip is a text node (never a `title` or an attribute) and shows on
// hover and on focus; Escape hides it (mockup `.tip`, app.js lines 513-526). One tip serves many
// anchors, as the one mockup tip does, so a container can put it outside a clipped row
export function useTip() {
  const id = useElementId();
  const [shown, setShown] = useState<Shown | null>(null);
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (shown === null) return;
    const hide = () => setShown(null);
    shownTips.add(hide);
    return () => void shownTips.delete(hide);
  }, [shown]);
  useLayoutEffect(() => {
    const box = shown?.box;
    if (box === undefined || el.current === null) return;
    const at = aboveOf(box, el.current);
    setShown((now) =>
      now !== null && now === shown ? { ...now, at, box: undefined } : now,
    );
  }, [shown]);
  const anchor = (key: string, tip: TipText) => {
    const show = (event: Event) =>
      setShown({ key, tip: made(tip), at: placeOf(event) });
    const hide = () => setShown((now) => (now?.key === key ? null : now));
    return handlers({ key, shown, id, show, hide });
  };
  // why: STORY-007-03 rule 5 (ddr-0059, embed.js lines 26-41) — the tip of an icon-only control
  // sits above it; a press hides it
  const above = (key: string, tip: string) => {
    const show = (event: Event) => {
      if (menuOpen(event)) return;
      const box = boxOf(event);
      setShown({ key, tip, at: { x: GAP, y: box.top }, top: true, box });
    };
    const hide = () => setShown((now) => (now?.key === key ? null : now));
    return { ...handlers({ key, shown, id, show, hide }), onClick: hide };
  };
  // why: STORY-004-04 rule 8 (H4 (b)) — a touch press shows the tip, a second press hides it
  const toggle = (key: string, tip: TipText, event: Event) => {
    const at = placeOf(event);
    setShown((now) => (now?.key === key ? null : { key, tip: made(tip), at }));
  };
  const node =
    shown === null ? null : (
      <span
        ref={el}
        id={id}
        role="tooltip"
        class="tip"
        data-place={shown.top ? "top" : undefined}
        style={{ left: `${shown.at.x}px`, top: `${shown.at.y}px` }}
      >
        {body(shown.tip)}
      </span>
    );
  return { anchor, above, toggle, node };
}

type Props = JSX.HTMLAttributes<HTMLSpanElement> & {
  tip: string;
  children: ComponentChildren;
};

export function Tooltip({ tip, children, ...anchor }: Props) {
  const tips = useTip();
  return (
    <>
      <span {...anchor} tabIndex={0} {...tips.anchor("", tip)}>
        {children}
      </span>
      {tips.node}
    </>
  );
}
