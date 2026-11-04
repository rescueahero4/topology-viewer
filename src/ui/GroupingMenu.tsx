import { optionOf } from "./custom";
import { extendable } from "./Part";
import type { Grouping, Lang } from "#engine";
import type { Actions } from "./actions";
import { Menu, MenuItem } from "./Menu";
import { t, type Key } from "./strings/index";
import type { Tip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

type Props = {
  actions: Actions;
  lang: Lang;
  grouping: Grouping;
  tip: Tip;
  embedded: boolean;
};

// why: mockup grouping menu (index.html lines 124-130) — 2 or more is the default
const OPTIONS: readonly { grouping: Grouping; note?: Key }[] = [
  { grouping: 2, note: "default" },
  { grouping: 5 },
  { grouping: 10 },
  { grouping: "off", note: "grouping.offNote" },
];

function optionsOfMenu(): readonly { grouping: Grouping; note?: Key }[] {
  const given = optionOf<readonly Grouping[]>("grouping-menu", "values");
  if (given === undefined) return OPTIONS;
  return given.map(
    (grouping) => OPTIONS.find((one) => one.grouping === grouping) ?? { grouping },
  );
}

function optionText(lang: Lang, grouping: Grouping): string {
  return grouping === "off"
    ? t(lang, "grouping.off")
    : t(lang, "grouping.atLeast", { count: grouping });
}

// why: FR-CANVAS-2 and the mockup button label (app.js line 485) — "Group 2+" … "Group off".
// STORY-007-03 rules 4, 5 — embedded, the name is the menu heading and the tip above is the label
function GroupingMenuView(props: Props) {
  const { actions, lang, grouping, tip, embedded } = props;
  const text =
    grouping === "off"
      ? t(lang, "grouping.buttonOff")
      : t(lang, "grouping.button", { count: grouping });
  const label = (
    <>
      <span class="ic">
        <UiIcon name="layers" />
      </span>
      {text}
      <span class="ic chev">
        <UiIcon name="chevron-up" />
      </span>
    </>
  );
  return (
    <Menu
      label={label}
      name={embedded ? t(lang, "grouping.heading") : undefined}
      buttonClass="ctl-btn"
      menuClass="grouping-menu"
      closeOnPick
      anchor={
        embedded
          ? tip.above("grouping", text)
          : tip.anchor("grouping", t(lang, "grouping.tip"))
      }
    >
      <p class="menu-label">{t(lang, "grouping.heading")}</p>
      {optionsOfMenu().map((option) => (
        <MenuItem
          key={option.grouping}
          kind="radio"
          checked={grouping === option.grouping}
          onSelect={() => actions.setGrouping(option.grouping)}
        >
          {optionText(lang, option.grouping)}
          {option.note !== undefined && <small>{t(lang, option.note)}</small>}
        </MenuItem>
      ))}
    </Menu>
  );
}

export const GroupingMenu = extendable("grouping-menu", GroupingMenuView);
