import { stats } from "@qdic-topology/engine";
import type { Actions } from "./actions";
import { GroupingMenu } from "./GroupingMenu";
import { LayoutMenu } from "./LayoutMenu";
import { ScopeMenu } from "./ScopeMenu";
import { isOpen, toggleWorkbench } from "./split";
import { canvasState, frontier, lang, model } from "./state";
import { t } from "./strings/index";
import { useTip, type Tip } from "./Tooltip";
import { TypesMenu } from "./TypesMenu";
import { UiIcon } from "./UiIcon";

// why: FR-HOST-2, rule 9 (mockup index.html line 136, app.js lines 1265-1266) — the tip names the
// macOS key when `navigator.platform` says so; the key works with Ctrl or Cmd on every platform
function DatasetButton({ tip, controls }: { tip: Tip; controls: string }) {
  const ui = lang.value;
  const mac = /mac/i.test(navigator.platform);
  return (
    <button
      type="button"
      class="ctl-btn"
      aria-controls={controls}
      aria-expanded={isOpen()}
      onClick={toggleWorkbench}
      {...tip.anchor(
        "dataset",
        t(ui, mac ? "wb.toggleTipMac" : "wb.toggleTip"),
      )}
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
}: {
  actions: Actions;
  workbench: string;
}) {
  const tip = useTip();
  const now = model.value;
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
        />
        <span class="sep" aria-hidden="true" />
        <TypesMenu
          actions={actions}
          lang={ui}
          vocab={now.vocab}
          types={stats(now.vocab, state).types}
        />
        <span class="sep" aria-hidden="true" />
        <LayoutMenu
          actions={actions}
          lang={ui}
          layout={state.layout}
          tip={tip}
        />
        <span class="sep" aria-hidden="true" />
        <GroupingMenu actions={actions} lang={ui} grouping={state.grouping} />
        <span class="sep" aria-hidden="true" />
        <DatasetButton tip={tip} controls={workbench} />
      </div>
      {tip.node}
    </>
  );
}
