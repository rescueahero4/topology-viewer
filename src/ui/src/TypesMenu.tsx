import {
  typeGroups,
  type Lang,
  type TypeRow,
  type Vocab,
} from "@qdic-topology/engine";
import { Fragment } from "preact";
import type { Actions } from "./actions";
import { Checkbox } from "./Checkbox";
import { Menu } from "./Menu";
import { groupName, provenanceName, typeName } from "./names";
import { formatted, t } from "./strings/index";
import type { Tip } from "./Tooltip";
import { TypeGlyph } from "./TypeGlyph";
import { UiIcon } from "./UiIcon";

type Props = {
  actions: Actions;
  lang: Lang;
  vocab: Vocab;
  types: readonly TypeRow[];
  tip: Tip;
  embedded: boolean;
};

function TypeLine({
  actions,
  lang,
  vocab,
  row,
}: Omit<Props, "types"> & { row: TypeRow }) {
  const visual =
    row.type === null ? null : (vocab.types.get(row.type)?.visual ?? null);
  return (
    <li class={row.on ? undefined : "off"}>
      <Checkbox
        checked={row.on}
        onChange={(on) => actions.toggleType(row.type, on)}
        label={
          <>
            <span class="glyph">
              <TypeGlyph
                visual={visual}
                size={20}
                untyped={row.type === null ? vocab.untyped : null}
              />
            </span>
            <span class="name">{typeName(lang, row.type, vocab.types)}</span>
            <span class="prov">{provenanceName(lang, row.provenance)}</span>
            <span class="n">{formatted(lang, row.count)}</span>
          </>
        }
      />
    </li>
  );
}

// why: FR-FILTER-3, FR-VOC-3, P20 (ddr-0047 "Types") — one block for each group of the Types menu
// in the order of `typeGroups()`, so `ui` reads no profile; the rows keep the `stats` order.
// STORY-007-03 rules 4, 5 — embedded, the name is "Node types" and the tip above is the label
export function TypesMenu(props: Props) {
  const { lang, types, tip, embedded } = props;
  const blocks = typeGroups()
    .map((group) => ({
      group,
      rows: types.filter((row) => row.group === group),
    }))
    .filter((block) => block.rows.length > 0);
  const label = (
    <>
      <span class="ic">
        <UiIcon name="nodes" />
      </span>
      {t(lang, "types.button")}
      <span class="ic chev">
        <UiIcon name="chevron-up" />
      </span>
    </>
  );
  return (
    <Menu
      label={label}
      name={embedded ? t(lang, "types.heading") : undefined}
      buttonClass="ctl-btn"
      anchor={
        embedded ? tip.above("types", t(lang, "types.button")) : undefined
      }
    >
      <p class="menu-label">{t(lang, "types.heading")}</p>
      {blocks.map(({ group, rows }) => (
        <Fragment key={group}>
          <div class="fam-head">{groupName(lang, group)}</div>
          <ul class="type-list">
            {rows.map((row) => (
              <TypeLine key={row.type ?? 0} {...props} row={row} />
            ))}
          </ul>
        </Fragment>
      ))}
    </Menu>
  );
}
