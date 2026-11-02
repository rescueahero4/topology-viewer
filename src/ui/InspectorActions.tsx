import { aroundInfo, type DrawnId } from "#engine";
import type { Actions } from "./actions";
import type { IconName } from "./icons";
import { canvasState, frontier, lang } from "./state";
import { t, type Key } from "./strings/index";
import type { Tip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

type Button = {
  icon: IconName;
  name: Key;
  tip: Key;
  pressed?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ActionButton({ tip, button }: { tip: Tip; button: Button }) {
  const ui = lang.value;
  return (
    <button
      type="button"
      class="icon-btn"
      aria-label={t(ui, button.name)}
      aria-pressed={button.pressed}
      disabled={button.disabled}
      onClick={button.onPress}
      {...tip.anchor(button.name, t(ui, button.tip))}
    >
      <span class="ic">
        <UiIcon name={button.icon} />
      </span>
    </button>
  );
}

// why: FR-INSPECT-1, FR-CANVAS-12, FR-CANVAS-14, rule 8 (mockup app.js lines 730-734). "Center here"
// has no pressed state: `CanvasState` has no Atomic centre (Implementer item 5). Hide is off for
// the only drawn node (question 19, FR-TABLE-5). Clear selects nothing, then fits (question 17)
function buttonsOf(actions: Actions, me: DrawnId, group: boolean): Button[] {
  const state = canvasState.value;
  const drawn = frontier.value;
  if (state === null) return [];
  const tree = state.layout === "tree-h" || state.layout === "tree-v";
  const pressed = drawn !== null && aroundInfo(state, drawn)?.id === me;
  const buttons: Button[] = [];
  if (state.layout === "atomic" && !group)
    buttons.push({
      icon: "center",
      name: "actions.center",
      tip: "actions.centerTip",
      onPress: () => actions.setLayout("atomic"),
    });
  if (!tree)
    buttons.push({
      icon: "group-root",
      name: "actions.around",
      tip: pressed ? "actions.aroundOnTip" : "actions.aroundTip",
      pressed,
      onPress: () => actions.groupAroundRoot(!pressed),
    });
  buttons.push(
    {
      icon: "eye-off",
      name: "actions.hide",
      tip: "actions.hideTip",
      disabled: drawn !== null && drawn.nodes.length <= 1,
      onPress: () => actions.hide([me]),
    },
    {
      icon: "reset",
      name: "actions.clear",
      tip: "actions.clear",
      onPress: () => actions.clearAndFit(),
    },
  );
  return buttons;
}

export function InspectorActions(props: {
  tip: Tip;
  actions: Actions;
  me: DrawnId;
  group: boolean;
}) {
  const { tip, actions, me, group } = props;
  return (
    <>
      {buttonsOf(actions, me, group).map((button) => (
        <ActionButton key={button.name} tip={tip} button={button} />
      ))}
    </>
  );
}
