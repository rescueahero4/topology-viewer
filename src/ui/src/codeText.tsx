import type { ComponentChildren } from "preact";

const SPAN = /`([^`]+)`/;

// why: rule 2, SA §11 Untrusted input (mockup `fill`, app.js line 135) — a backtick span of the
// catalog text becomes a `code` element; each part is a text node, never parsed markup
export function codeText(text: string): ComponentChildren {
  return text
    .split(SPAN)
    .map((part, index) =>
      index % 2 === 1 ? <code key={index}>{part}</code> : part,
    )
    .filter((part) => part !== "");
}
