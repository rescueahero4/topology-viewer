import { useEffect, useRef, useState } from "preact/hooks";
import type { ShellHost } from "./host";
import { lang } from "./state";
import { t } from "./strings/index";
import { UiIcon } from "./UiIcon";

type Result = Awaited<ReturnType<ShellHost["copyForAi"]>>;
type Said = { result: Result };

// why: mockup `copyText` (app.js lines 179-187) — the feedback replaces the label for 2.2 s
const FEEDBACK_MS = 2200;

const FEEDBACK = {
  copied: "copy.copied",
  failed: "copy.failed",
  sent: "copy.sent",
} as const;

// why: rule 3, rule 7 (Security gap 1, FR-HOST-9) — the text is made and goes to the host port
// only inside the press handler; a refusal of the port reads as `failed`
export function CopyButton({
  host,
  text,
}: {
  host: ShellHost;
  text: () => string;
}) {
  const [said, setSaid] = useState<Said | null>(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  useEffect(() => {
    if (said === null) return;
    const timer = setTimeout(() => setSaid(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [said]);
  const ui = lang.value;
  const press = () => {
    const show = (result: Result) => {
      if (live.current) setSaid({ result });
    };
    host.copyForAi(text()).then(show, () => show("failed"));
  };
  return (
    <button type="button" class="btn" onClick={press}>
      {said === null ? (
        <>
          <span class="ic">
            <UiIcon name="copy" />
          </span>
          {t(ui, "action.copy")}
        </>
      ) : (
        t(ui, FEEDBACK[said.result])
      )}
    </button>
  );
}
