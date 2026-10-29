import { stats } from "@qdic-topology/engine";
import type { JSX } from "preact";
import type { Actions } from "./actions";
import { GroupingMenu } from "./GroupingMenu";
import { LayoutMenu } from "./LayoutMenu";
import { ScopeMenu } from "./ScopeMenu";
import { isOpen, toggleWorkbench } from "./split";
import { canvasState, editedModel, frontier, lang } from "./state";
import { t } from "./strings/index";
import { useTip, type Tip } from "./Tooltip";
import { TypesMenu } from "./TypesMenu";
import { UiIcon } from "./UiIcon";

type DatasetProps = { tip: Tip; controls: string; embedded: boolean };

// why: FR-HOST-2, rule 9 (mockup index.html line 136, app.js lines 1265-1266) — the tip names the
// macOS key when `navigator.platform` says so; the key works with Ctrl or Cmd on every platform.
// STORY-007-03 rules 4, 5 — embedded, the name is "Dataset table" and the tip above is the label
function DatasetButton({ tip, controls, embedded }: DatasetProps) {
  const ui = lang.value;
  const mac = /mac/i.test(navigator.platform);
  const anchor: JSX.HTMLAttributes<HTMLButtonElement> = embedded
    ? tip.above("dataset", t(ui, "wb.dataset"))
    : tip.anchor("dataset", t(ui, mac ? "wb.toggleTipMac" : "wb.toggleTip"));
  return (
    <button
      type="button"
      class="ctl-btn"
      aria-controls={controls}
      aria-expanded={isOpen()}
      aria-label={embedded ? t(ui, "datasetTable") : undefined}
      {...anchor}
      onClick={(event) => {
        anchor.onClick?.(event);
        toggleWorkbench();
      }}
    >
      <span class="ic">
        <UiIcon name="table" />
      </span>
      {t(ui, "wb.dataset")}
    </button>
  );
}

// why: P22 and the mockup canvas controls (index.html lines 84-133) — bottom left on the canvas,
// each menu opens upwards; the tip of the layout info icons sits outside the blurred card
export function ControlBar({
  actions,
  workbench,
  embedded,
}: {
  actions: Actions;
  workbench: string;
  embedded: boolean;
}) {
  const tip = useTip();
  const now = editedModel.value;
  const state = canvasState.value;
  const drawn = frontier.value;
  if (now === null || state === null || drawn === null) return null;
  const ui = lang.value;
  return (
    <>
      <div class="controls float-card">
        <ScopeMenu
          actions={actions}
          lang={ui}
          model={now}
          state={state}
          drawn={drawn}
          tip={tip}
          embedded={embedded}
        />
        <span class="sep" aria-hidden="true" />
        <TypesMenu
          actions={actions}
          lang={ui}
          vocab={now.vocab}
          types={stats(now.vocab, state).types}
          tip={tip}
          embedded={embedded}
        />
        <span class="sep" aria-hidden="true" />
        <LayoutMenu
          actions={actions}
          lang={ui}
          layout={state.layout}
          tip={tip}
          embedded={embedded}
        />
        <span class="sep" aria-hidden="true" />
        <GroupingMenu
          actions={actions}
          lang={ui}
          grouping={state.grouping}
          tip={tip}
          embedded={embedded}
        />
        <span class="sep" aria-hidden="true" />
        <DatasetButton tip={tip} controls={workbench} embedded={embedded} />
      </div>
      {tip.node}
    </>
  );
}
