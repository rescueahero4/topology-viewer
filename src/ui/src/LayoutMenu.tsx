import type { Lang, LayoutName } from "@qdic-topology/engine";
import { useId } from "preact/hooks";
import type { Actions } from "./actions";
import type { IconName } from "./icons";
import { Menu, MenuItem } from "./Menu";
import { t, type Key } from "./strings/index";
import type { Tip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

type Layout = {
  name: LayoutName;
  item: Key;
  button: Key;
  tip: Key;
  icon: IconName;
};

// why: mockup layout menu and its button labels and icons (index.html lines 112-121, app.js lines
// 474-475)
const LAYOUTS: readonly Layout[] = [
  {
    name: "force",
    item: "layout.force",
    button: "layout.force",
    tip: "layout.forceTip",
    icon: "layout",
  },
  {
    name: "atomic",
    item: "layout.atomic",
    button: "layout.atomic",
    tip: "layout.atomicTip",
    icon: "orbit",
  },
  {
    name: "bubbles",
    item: "layout.bubbles",
    button: "layout.bubbles",
    tip: "layout.bubblesTip",
    icon: "bubbles",
  },
  {
    name: "tree-h",
    item: "layout.treeH",
    button: "layout.treeHName",
    tip: "layout.treeHTip",
    icon: "tree-h",
  },
  {
    name: "tree-v",
    item: "layout.treeV",
    button: "layout.treeVName",
    tip: "layout.treeVTip",
    icon: "tree-v",
  },
];
const TREES: readonly LayoutName[] = ["tree-h", "tree-v"];

type Props = {
  actions: Actions;
  lang: Lang;
  layout: LayoutName;
  tip: Tip;
};

// why: P18, P21 — one line per layout; the description is in the tooltip of the info icon, and a
// press on the icon picks nothing (app.js line 470). The icon is not a tab stop; the item points
// to the description text (mockup index.html lines 115-121, ISSUE-012 C2)
function LayoutItem({
  actions,
  lang,
  layout,
  tip,
  item,
}: Props & { item: Layout }) {
  const id = useId();
  const text = t(lang, item.tip);
  return (
    <>
      <MenuItem
        kind="radio"
        checked={layout === item.name}
        aria-describedby={id}
        onSelect={() => actions.setLayout(item.name)}
      >
        {t(lang, item.item)}
        <span
          class="info ic"
          onClick={(event) => event.stopPropagation()}
          {...tip.anchor(item.name, text)}
        >
          <UiIcon name="info" />
        </span>
      </MenuItem>
      <span id={id} hidden>
        {text}
      </span>
    </>
  );
}

// why: FR-CANVAS-2, FR-CANVAS-8 — a pick of the current layout runs it again, so every pick calls
// the canvas; the checked item follows the canvas state
export function LayoutMenu(props: Props) {
  const { lang, layout } = props;
  const current = LAYOUTS.find((item) => item.name === layout) ?? LAYOUTS[0];
  const items = (trees: boolean) =>
    LAYOUTS.filter((item) => TREES.includes(item.name) === trees).map(
      (item) => <LayoutItem key={item.name} {...props} item={item} />,
    );
  const label = (
    <>
      <span class="ic">
        <UiIcon name={current.icon} />
      </span>
      {t(lang, current.button)}
      <span class="ic chev">
        <UiIcon name="chevron-up" />
      </span>
    </>
  );
  return (
    <Menu label={label} buttonClass="ctl-btn" closeOnPick>
      <p class="menu-label">{t(lang, "layout.heading")}</p>
      {items(false)}
      <hr />
      <p class="menu-label">{t(lang, "layout.tree")}</p>
      {items(true)}
    </Menu>
  );
}
