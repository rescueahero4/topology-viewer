import type {
  FamilyRow,
  Lang,
  PredicateRow,
  Stats,
  Vocab,
} from "@qdic-topology/engine";
import { useState } from "preact/hooks";
import type { Actions } from "./actions";
import {
  familyClass,
  familyIcon,
  familyTip,
  partialOf,
  predicateColour,
  predicateTip,
} from "./familyLook";
import { Menu, MenuItem } from "./Menu";
import { familyName } from "./names";
import { formatted, t } from "./strings/index";
import type { Tip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

type Props = {
  kind: "families" | "predicates";
  actions: Actions;
  lang: Lang;
  tip: Tip;
  vocab: Vocab;
  rows: Stats;
};

// why: the mockup search (app.js line 343) with the engine `fold` rule (NFC, lower case)
const fold = (text: string) => text.normalize("NFC").toLowerCase();

const TEXTS = {
  families: {
    noun: "pick.families",
    search: "pick.searchFamilies",
    none: "pick.noFamilies",
  },
  predicates: {
    noun: "pick.predicates",
    search: "pick.searchPredicates",
    none: "pick.noPredicates",
  },
} as const;

function familyItems(props: Props, query: string) {
  const { actions, lang: ui, tip, rows } = props;
  const match = (row: FamilyRow) =>
    query === "" || fold(familyName(ui, row.family)).includes(query);
  return rows.families.filter(match).map((row) => {
    const partial = partialOf(rows, row);
    return (
      <MenuItem
        key={row.family}
        kind="check"
        checked={row.on}
        partial={partial}
        class={`pick-item ${familyClass(row.family)}`}
        onSelect={() => actions.toggleFamily(row.family, !row.on || partial)}
        {...tip.anchor(`f${row.family}`, familyTip(ui, row))}
      >
        <span class="ic fam-ic">
          <UiIcon name={familyIcon(row.family)} />
        </span>
        <span class="nm">{familyName(ui, row.family)}</span>
        <small>{formatted(ui, row.count)}</small>
      </MenuItem>
    );
  });
}

function predicateItem(props: Props, row: PredicateRow) {
  const { actions, lang: ui, tip, vocab } = props;
  return (
    <MenuItem
      key={row.predicate}
      kind="check"
      checked={row.on}
      class={`pick-item ${familyClass(row.family)}`}
      style={predicateColour(row.predicate)}
      onSelect={() => actions.togglePredicate(row.predicate, !row.on)}
      {...tip.anchor(`p${row.predicate}`, predicateTip(ui, vocab, row))}
    >
      <span class="pdot" aria-hidden="true" />
      <span class="nm">{row.predicate}</span>
      <small>{formatted(ui, row.count)}</small>
    </MenuItem>
  );
}

// why: mockup `renderPicker` (app.js lines 316-356) — predicates under the heads of the families
// that are on
function predicateItems(props: Props, query: string) {
  const { lang: ui, rows } = props;
  return rows.families
    .filter((family) => family.on)
    .flatMap((family) => {
      const own = rows.predicates.filter(
        (row) =>
          row.family === family.family &&
          (query === "" || fold(row.predicate).includes(query)),
      );
      if (own.length === 0) return [];
      return [
        <div
          key={`h${family.family}`}
          class={`fam-head ${familyClass(family.family)}`}
        >
          <span class="ic">
            <UiIcon name={familyIcon(family.family)} />
          </span>
          {familyName(ui, family.family)}
        </div>,
        ...own.map((row) => predicateItem(props, row)),
      ];
    });
}

// why: FR-FILTER-7 advanced mode — one picker with "on/total", a search box and check items; a
// toggle keeps the menu open; no match gives the query back as a text node
export function FilterPicker(props: Props) {
  const { kind, lang: ui, rows } = props;
  const [query, setQuery] = useState("");
  const texts = TEXTS[kind];
  const families =
    kind === "families" ? rows.families : rows.families.filter((f) => f.on);
  const pool: readonly { on: boolean }[] =
    kind === "families"
      ? families
      : rows.predicates.filter((p) =>
          families.some((f) => f.family === p.family),
        );
  const on = pool.filter((row) => row.on).length;
  const typed = query.trim();
  const items =
    kind === "families"
      ? familyItems(props, fold(typed))
      : predicateItems(props, fold(typed));
  const label = (
    <>
      <span class="pick-label">{t(ui, texts.noun)}</span>
      <span class="pick-count">
        {t(ui, "pick.count", { on, total: pool.length })}
      </span>
      <span class="ic chev">
        <UiIcon name="chevron-down" />
      </span>
    </>
  );
  return (
    <Menu
      label={label}
      buttonClass={on < pool.length ? "pick-btn filtered" : "pick-btn"}
      menuClass="pick-menu"
    >
      <div class="pick-search">
        <span class="ic" aria-hidden="true">
          <UiIcon name="search" />
        </span>
        <input
          type="search"
          placeholder={t(ui, texts.search)}
          aria-label={t(ui, texts.search)}
          autocomplete="off"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div class="pick-list">
        {items.length > 0 ? (
          items
        ) : (
          <p class="pick-empty">{t(ui, texts.none, { query: typed })}</p>
        )}
      </div>
    </Menu>
  );
}
