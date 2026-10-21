import type { ComponentChildren, JSX } from "preact";
import { useId, useState } from "preact/hooks";

type At = { x: number; y: number };
type Shown = { key: string; tip: string; at: At };

export type Tip = ReturnType<typeof useTip>;

// why: P18, P21, f-0053 — the tip is a text node (never a `title` or an attribute) and shows on
// hover and on focus; Escape hides it (mockup `.tip`, app.js lines 513-526). One tip serves many
// anchors, as the one mockup tip does, so a container can put it outside a clipped row
export function useTip() {
  const id = useId();
  const [shown, setShown] = useState<Shown | null>(null);
  const anchor = (key: string, tip: string) => {
    const show = (event: Event) => {
      const box = (event.currentTarget as Element).getBoundingClientRect();
      const at = { x: box.right + 8, y: box.top + box.height / 2 };
      setShown({ key, tip, at });
    };
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
  const node =
    shown === null ? null : (
      <span
        id={id}
        role="tooltip"
        class="tip"
        style={{ left: `${shown.at.x}px`, top: `${shown.at.y}px` }}
      >
        {shown.tip}
      </span>
    );
  return { anchor, node };
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
