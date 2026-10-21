import { createElement } from "preact";
import { iconParts, type IconName } from "./icons";

// why: SA §5 UI, guardrail 8 — an icon is built as SVG elements from constant data, never from
// markup text (the mockup `lucide`, app.js line 69, used `innerHTML`)
export function UiIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconParts(name).map(([tag, attrs], index) =>
        createElement(tag, { key: index, ...attrs }),
      )}
    </svg>
  );
}
