import type { ComponentChildren, JSX } from "preact";
import { useId, useRef, useState } from "preact/hooks";

type Props = JSX.HTMLAttributes<HTMLSpanElement> & {
  tip: string;
  children: ComponentChildren;
};
type At = { x: number; y: number };

// why: P18, P21, f-0053 — the tip is a text node next to its anchor (never a `title` or an
// attribute) and shows on hover and on focus; Escape hides it (mockup `.tip`, app.js lines 513-526)
export function Tooltip({ tip, children, ...anchor }: Props) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<At | null>(null);
  const show = () => {
    const box = ref.current?.getBoundingClientRect();
    if (box !== undefined)
      setAt({ x: box.right + 8, y: box.top + box.height / 2 });
  };
  const hide = () => setAt(null);
  return (
    <>
      <span
        {...anchor}
        ref={ref}
        tabIndex={0}
        aria-describedby={at === null ? undefined : id}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(event) => {
          if (event.key === "Escape") hide();
        }}
      >
        {children}
      </span>
      {at !== null && (
        <span
          id={id}
          role="tooltip"
          class="tip"
          style={{ left: `${at.x}px`, top: `${at.y}px` }}
        >
          {tip}
        </span>
      )}
    </>
  );
}
