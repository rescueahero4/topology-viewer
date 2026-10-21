import { stats } from "@qdic-topology/engine";
import type { Actions } from "./actions";
import { GroupingMenu } from "./GroupingMenu";
import { LayoutMenu } from "./LayoutMenu";
import { ScopeMenu } from "./ScopeMenu";
import { canvasState, frontier, lang, model } from "./state";
import { useTip } from "./Tooltip";
import { TypesMenu } from "./TypesMenu";

// why: P22 and the mockup canvas controls (index.html lines 84-133) — bottom left on the canvas,
// each menu opens upwards; the tip of the layout info icons sits outside the blurred card
export function ControlBar({ actions }: { actions: Actions }) {
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
      </div>
      {tip.node}
    </>
  );
}
