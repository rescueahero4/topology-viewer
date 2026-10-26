import type { ShellHost } from "./host";
import { lang } from "./state";
import { t } from "./strings/index";
import { UiIcon } from "./UiIcon";

type Props = {
  host: ShellHost;
  embedded?: boolean;
  displayMode?: "inline" | "fullscreen";
  availableDisplayModes?: readonly string[];
};

// why: STORY-007-04 rules 1-4 (embed-frame.html line 34, embed.js lines 10-24; SA §4.3 addendum)
// — only in the widget and only while the host lists "fullscreen"; a press asks for the other
// mode, and the state follows the display mode that the host reports, not the request result.
// No tip (the WorkbenchBar.tsx icon buttons)
export function DisplayToggle(props: Props) {
  const { host, embedded, displayMode, availableDisplayModes } = props;
  if (
    embedded !== true ||
    availableDisplayModes?.includes("fullscreen") !== true
  )
    return null;
  const full = displayMode === "fullscreen";
  return (
    <button
      type="button"
      class="icon-btn float-card display-btn"
      aria-label={t(lang.value, full ? "display.exit" : "display.fullscreen")}
      aria-pressed={full ? "true" : "false"}
      onClick={() =>
        void host
          .requestDisplayMode(full ? "inline" : "fullscreen")
          .catch(() => undefined)
      }
    >
      <span class="ic">
        <UiIcon name={full ? "minimize" : "maximize"} />
      </span>
    </button>
  );
}
