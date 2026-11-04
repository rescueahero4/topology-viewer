import { custom, optionOf, type CustomLayout } from "./custom";
import { extendable } from "./Part";
import type { Lang, LayoutName } from "#engine";
import { useElementId } from "./ids";
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

// The built-in layouts that the developer keeps. All of them with no option.
function shownLayouts(): readonly Layout[] {
  const names = optionOf<readonly string[]>("layout-menu", "layouts");
  return names === undefined
    ? LAYOUTS
    : LAYOUTS.filter((item) => names.includes(item.name));
}

function CustomLayouts({ actions, layout }: Pick<Props, "actions" | "layout">) {
  const given = custom.value.layouts ?? {};
  const names = Object.keys(given);
  if (names.length === 0) return null;
  return (
    <>
      <hr />
      {names.map((name) => (
        <MenuItem
          key={name}
          kind="radio"
          checked={layout === `custom:${name}`}
          onSelect={() => actions.setLayout(`custom:${name}`)}
        >
          {(given[name] as CustomLayout).label}
        </MenuItem>
      ))}
    </>
  );
}

type Props = {
  actions: Actions;
  lang: Lang;
  layout: LayoutName;
  tip: Tip;
  embedded: boolean;
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
  const id = useElementId();
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
// the canvas; the checked item follows the canvas state. STORY-007-03 rules 4, 5 — embedded, the
// name is "Layout" and the tip above is the button text of the current layout
function LayoutMenuView(props: Props) {
  const { lang, layout, tip, embedded } = props;
  const current = LAYOUTS.find((item) => item.name === layout) ?? LAYOUTS[0];
  const items = (trees: boolean) =>
    shownLayouts().filter((item) => TREES.includes(item.name) === trees).map(
      (item) => <LayoutItem key={item.name} {...props} item={item} />,
    );
  const plain = items(false);
  const trees = items(true);
  // A custom layout names itself on the button.
  const customName = layout.startsWith("custom:")
    ? custom.value.layouts?.[layout.slice("custom:".length)]?.label
    : undefined;
  const buttonText = customName ?? t(lang, current.button);
  const label = (
    <>
      <span class="ic">
        <UiIcon name={current.icon} />
      </span>
      {buttonText}
      <span class="ic chev">
        <UiIcon name="chevron-up" />
      </span>
    </>
  );
  return (
    <Menu
      label={label}
      name={embedded ? t(lang, "layout.heading") : undefined}
      buttonClass="ctl-btn"
      menuClass="layout-menu"
      closeOnPick
      anchor={embedded ? tip.above("layout", buttonText) : undefined}
    >
      {plain.length > 0 && (
        <p class="menu-label">{t(lang, "layout.heading")}</p>
      )}
      {plain}
      {plain.length > 0 && trees.length > 0 && <hr />}
      {trees.length > 0 && <p class="menu-label">{t(lang, "layout.tree")}</p>}
      {trees}
      <CustomLayouts actions={props.actions} layout={layout} />
    </Menu>
  );
}

export const LayoutMenu = extendable("layout-menu", LayoutMenuView);
