import {
  copyMessage,
  noticeText,
  type NoticeEntry,
} from "#engine";
import type { Actions } from "./actions";
import { codeText } from "./codeText";
import { CopyButton } from "./CopyButton";
import type { ShellHost } from "./host";
import { isIcon } from "./icons";
import type { NoticeCase } from "./noticeCase";
import { openWorkbench } from "./split";
import { lang } from "./state";
import { t } from "./strings/index";
import { UiIcon } from "./UiIcon";

type Name = NoticeEntry["actions"][number];

// why: rule 3 (Implementer round 4) — the labels are the contract labels, copied into the tables
// because `ui` does not import `contract` (SA §3); `strings.test.ts` compares them
const LABEL = {
  "show-types": "action.show-types",
  "reset-view": "action.reset-view",
  retry: "action.retry",
  table: "action.table",
  copy: "action.copy",
} as const satisfies Record<Name, string>;

// why: ddr-0052 (mockup ACTIONS, app.js lines 128-134) — the primary look of three actions
const PRIMARY: ReadonlySet<Name> = new Set([
  "show-types",
  "reset-view",
  "retry",
]);

type Props = {
  found: NoticeCase;
  host: ShellHost;
  actions: Actions | null;
  table: boolean;
  onRetry: () => void;
};

// why: rule 3 — "Try again" only for the transient cause; "Open Dataset table" only while the
// input has a table (a fatal input has no Workbench)
function namesOf({ found, table }: Props, entry: NoticeEntry): Name[] {
  return entry.actions.filter(
    (name) => (name !== "retry" || found.retry) && (name !== "table" || table),
  );
}

function Action({
  name,
  props,
}: {
  name: Exclude<Name, "copy">;
  props: Props;
}) {
  const { actions, onRetry } = props;
  const press = {
    "show-types": () => actions?.showAllTypes(),
    "reset-view": () => actions?.resetView(),
    retry: onRetry,
    table: openWorkbench,
  };
  return (
    <button
      type="button"
      class={PRIMARY.has(name) ? "btn primary" : "btn"}
      onClick={press[name]}
    >
      {t(lang.value, LABEL[name])}
    </button>
  );
}

function Sections({ entry }: { entry: NoticeEntry }) {
  const ui = lang.value;
  return (
    <>
      {entry.user.length > 0 && (
        <div class="notice-sect">
          <p class="notice-h">{t(ui, "notice.user")}</p>
          <ul>
            {entry.user.map((line, index) => (
              <li key={index}>{codeText(line)}</li>
            ))}
          </ul>
        </div>
      )}
      {entry.ai !== "" && (
        <div class="notice-sect notice-ai">
          <p class="notice-h">
            <span class="ic">
              <UiIcon name="info" />
            </span>
            {t(ui, "notice.ai")}
          </p>
          <p>{codeText(entry.ai)}</p>
        </div>
      )}
      <details class="notice-details">
        <summary>{t(ui, "notice.details")}</summary>
        <code>{entry.code}</code>
      </details>
    </>
  );
}

// why: FR-CANVAS-16, ddr-0052, rule 2 — one layout for the 28 codes, over the canvas and under
// the floating controls; the details hold the code only (no message, stack or path, SA §9)
export function CanvasNotice(props: Props) {
  const { found, host } = props;
  const ui = lang.value;
  const entry = noticeText(found.code, found.info, ui);
  const empty = entry.severity === "empty";
  const names = namesOf(props, entry);
  return (
    <div
      class="overlay"
      data-state={empty ? "empty" : "error"}
      role={empty ? "status" : "alert"}
      aria-live="polite"
    >
      <div class="notice">
        <span class="notice-ic ic">
          <UiIcon name={isIcon(entry.icon) ? entry.icon : "alert-triangle"} />
        </span>
        <p class="overlay-title">{codeText(entry.title)}</p>
        <p class="notice-body">{codeText(entry.body)}</p>
        <Sections entry={entry} />
        {names.length > 0 && (
          <div class="notice-actions">
            {names.map((name) =>
              name === "copy" ? (
                <CopyButton
                  key={name}
                  host={host}
                  text={() =>
                    copyMessage(entry.code, found.info, ui, entry.code)
                  }
                />
              ) : (
                <Action key={name} name={name} props={props} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
