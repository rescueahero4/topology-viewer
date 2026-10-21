import type { ComponentChildren, JSX } from "preact";
import { useId, useState } from "preact/hooks";

type At = { x: number; y: number };
// why: STORY-004-05 rules 5, 10 (Security gap 1) — a tip of many lines is a function, so its lines
// are made only when the tip opens, never at render
export type TipText = string | (() => readonly string[]);
type Shown = { key: string; tip: string | readonly string[]; at: At };

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

const made = (tip: TipText) => (typeof tip === "string" ? tip : tip());

function body(tip: Shown["tip"]) {
  if (typeof tip === "string") return tip;
  return tip.map((line, i) => (
    <span key={i} class="tip-line">
      {line}
    </span>
  ));
}

// why: P18, P21, f-0053 — the tip is a text node (never a `title` or an attribute) and shows on
// hover and on focus; Escape hides it (mockup `.tip`, app.js lines 513-526). One tip serves many
// anchors, as the one mockup tip does, so a container can put it outside a clipped row
export function useTip() {
  const id = useId();
  const [shown, setShown] = useState<Shown | null>(null);
  const anchor = (key: string, tip: TipText) => {
    const show = (event: Event) =>
      setShown({ key, tip: made(tip), at: placeOf(event) });
    const hide = () => setShown((now) => (now?.key === key ? null : now));
    return {
      "aria-describedby": shown?.key === key ? id : undefined,
      onMouseEnter: show,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Escape") hide();
      },
    };
  };
  // why: STORY-004-04 rule 8 (H4 (b)) — a touch press shows the tip, a second press hides it
  const toggle = (key: string, tip: TipText, event: Event) => {
    const at = placeOf(event);
    setShown((now) => (now?.key === key ? null : { key, tip: made(tip), at }));
  };
  const node =
    shown === null ? null : (
      <span
        id={id}
        role="tooltip"
        class="tip"
        style={{ left: `${shown.at.x}px`, top: `${shown.at.y}px` }}
      >
        {body(shown.tip)}
      </span>
    );
  return { anchor, toggle, node };
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
