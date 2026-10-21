import type { Grouping, Lang } from "@qdic-topology/engine";
import type { Actions } from "./actions";
import { Menu, MenuItem } from "./Menu";
import { t, type Key } from "./strings/index";
import type { Tip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

type Props = { actions: Actions; lang: Lang; grouping: Grouping; tip: Tip };

// why: mockup grouping menu (index.html lines 124-130) — 2 or more is the default
const OPTIONS: readonly { grouping: Grouping; note?: Key }[] = [
  { grouping: 2, note: "default" },
  { grouping: 5 },
  { grouping: 10 },
  { grouping: "off", note: "grouping.offNote" },
];

function optionText(lang: Lang, grouping: Grouping): string {
  return grouping === "off"
    ? t(lang, "grouping.off")
    : t(lang, "grouping.atLeast", { count: grouping });
}

// why: FR-CANVAS-2 and the mockup button label (app.js line 485) — "Group 2+" … "Group off"
export function GroupingMenu({ actions, lang, grouping, tip }: Props) {
  const label = (
    <>
      <span class="ic">
        <UiIcon name="layers" />
      </span>
      {grouping === "off"
        ? t(lang, "grouping.buttonOff")
        : t(lang, "grouping.button", { count: grouping })}
      <span class="ic chev">
        <UiIcon name="chevron-up" />
      </span>
    </>
  );
  return (
    <Menu
      label={label}
      buttonClass="ctl-btn"
      closeOnPick
      anchor={tip.anchor("grouping", t(lang, "grouping.tip"))}
    >
      <p class="menu-label">{t(lang, "grouping.heading")}</p>
      {OPTIONS.map((option) => (
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
