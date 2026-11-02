import type { OnCanvas } from "#engine";
import type { IconName } from "./icons";
import { lang } from "./state";
import { t, type Key } from "./strings/index";
import { Tooltip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

type Look = { icon: IconName; class: string; name: Key; tip: Key };

// why: mockup Canvas column (app.js lines 1020-1022, styles.css lines 469-472); H1 — a faded node
// stays on the canvas, so it has the drawn glyph and colour with its own name and tip (P20)
const LOOKS: Readonly<Record<OnCanvas, Look>> = {
  drawn: { icon: "eye", class: "oc on", name: "eye.drawn", tip: "eye.drawn" },
  "not-drawn": {
    icon: "eye",
    class: "oc",
    name: "eye.notDrawn",
    tip: "eye.notDrawn",
  },
  hidden: {
    icon: "eye-off",
    class: "oc hid",
    name: "eye.hidden",
    tip: "eye.hidden",
  },
  faded: {
    icon: "eye",
    class: "oc on",
    name: "eye.faded",
    tip: "eye.fadedTip",
  },
};

export function EyeIcon({ state }: { state: OnCanvas }) {
  const look = LOOKS[state];
  return (
    <Tooltip
      tip={t(lang.value, look.tip)}
      class={look.class}
      role="img"
      aria-label={t(lang.value, look.name)}
    >
      <UiIcon name={look.icon} />
    </Tooltip>
  );
}
