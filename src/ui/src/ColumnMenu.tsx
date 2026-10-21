import type { Lang } from "@qdic-topology/engine";
import { useMemo, useState } from "preact/hooks";
import { Menu, MenuItem } from "./Menu";
import { t } from "./strings/index";
import { UiIcon } from "./UiIcon";
import {
  attrShown,
  CORE,
  coreName,
  type Choice,
  type Column,
} from "./workbenchColumns";
import { fold } from "./FilterPicker";

// why: rule 12 (Security round 4; Product Owner 2026-10-21) — the menu holds at most 200
// attribute keys, so its DOM is bounded for any count of distinct keys
const MENU_KEYS = 200;

type Props = {
  lang: Lang;
  keys: readonly string[];
  choice: Choice;
  onToggle: (column: Column, on: boolean) => void;
};

// why: rule 12 — one item for each core column but the tick column, then at most 200 attribute
// keys that match, in coverage order, then one line for the keys that are not listed
function Items({
  lang: ui,
  keys,
  choice,
  onToggle,
  query,
}: Props & { query: string }) {
  const folded = useMemo(() => keys.map(fold), [keys]);
  const typed = fold(query.trim());
  const matched = useMemo(
    () =>
      keys.flatMap((_, at) =>
        typed === "" || folded[at].includes(typed) ? [at] : [],
      ),
    [keys, folded, typed],
  );
  const listed = matched.slice(0, MENU_KEYS);
  const item = (key: string, column: Column, on: boolean, name: string) => (
    <MenuItem
      key={key}
      kind="check"
      checked={on}
      onSelect={() => onToggle(column, !on)}
    >
      <span class="nm">{name}</span>
    </MenuItem>
  );
  return (
    <div class="pick-list">
      {CORE.map((key) =>
        item(
          key,
          { core: key },
          choice.core.get(key) ?? true,
          coreName(ui, key),
        ),
      )}
      {listed.map((at) =>
        item(
          `attr:${keys[at]}`,
          { attr: keys[at] },
          attrShown(choice, keys[at], at),
          keys[at],
        ),
      )}
      {matched.length > listed.length && (
        <p class="pick-empty">
          {t(ui, "wb.moreKeys", { count: matched.length - listed.length })}
        </p>
      )}
    </div>
  );
}

// why: FR-TABLE-1, rule 12 (H4 (b)) — the searchable form of the STORY-004-03 picker; a toggle
// keeps the menu open. The keys are text nodes (SA §11)
export function ColumnMenu(props: Props) {
  const ui = props.lang;
  const [query, setQuery] = useState("");
  return (
    <Menu
      label={t(ui, "wb.columns")}
      buttonClass="wb-btn"
      menuClass="pick-menu"
    >
      <p class="menu-label">{t(ui, "wb.columnsHeading")}</p>
      <div class="pick-search">
        <span class="ic" aria-hidden="true">
          <UiIcon name="search" />
        </span>
        <input
          type="search"
          placeholder={t(ui, "wb.searchColumns")}
          aria-label={t(ui, "wb.searchColumns")}
          autocomplete="off"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <Items {...props} query={query} />
    </Menu>
  );
}
