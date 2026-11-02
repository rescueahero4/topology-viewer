import {
  filterMode,
  stats,
  type FamilyRow,
  type Lang,
  type PredicateRow,
  type Stats,
  type Vocab,
} from "#engine";
import type { Actions } from "./actions";
import {
  familyClass,
  familyIcon,
  partialOf,
  predicateColour,
} from "./familyLook";
import { FilterPicker } from "./FilterPicker";
import { familyName } from "./names";
import { canvasState, editedModel, lang } from "./state";
import { formatted, t } from "./strings/index";
import { useTip, type Tip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

type Row = { actions: Actions; lang: Lang; tip: Tip };

function FamilyTab(props: Row & { rows: Stats; row: FamilyRow }) {
  const { actions, lang: ui, rows, row } = props;
  const partial = partialOf(rows, row);
  return (
    <button
      type="button"
      class={`fam-tab ${familyClass(row.family)}`}
      aria-pressed={row.on}
      data-partial={partial ? "" : undefined}
      onClick={() => actions.toggleFamily(row.family, !row.on || partial)}
    >
      <span class="ic">
        <UiIcon name={familyIcon(row.family)} />
      </span>
      {familyName(ui, row.family)}
    </button>
  );
}

function Pill(props: Row & { vocab: Vocab; row: PredicateRow }) {
  const { actions, lang: ui, row } = props;
  return (
    <button
      type="button"
      class={`pill ${familyClass(row.family)}`}
      aria-pressed={row.on}
      style={predicateColour(row.predicate)}
      onClick={() => actions.togglePredicate(row.predicate, !row.on)}
    >
      <span class="dot" aria-hidden="true">
        {t(ui, "catbar.dot")}
      </span>
      {row.predicate} <span class="n">{formatted(ui, row.count)}</span>
    </button>
  );
}

// why: rule 6 — the pills of the families that are on, in the family order
const pillsOn = (rows: Stats) =>
  rows.families
    .filter((family) => family.on)
    .flatMap((family) =>
      rows.predicates.filter((p) => p.family === family.family),
    );

// why: FR-FILTER-1, 2, 7 and ddr-0036, ddr-0039 — top left on the canvas: family tabs, then the
// pills of the families that are on, with no separator; a row with more than ten options is one
// picker, by the dataset totals, so a toggle never changes the mode (SA §6 row 17)
export function CategoryBar({ actions }: { actions: Actions }) {
  const tip = useTip();
  const now = editedModel.value;
  const state = canvasState.value;
  if (now === null || state === null) return null;
  const ui = lang.value;
  const rows = stats(now.vocab, state);
  const modes = filterMode(rows);
  const row = { actions, lang: ui, tip };
  const inline =
    modes.families === "advanced" && modes.predicates === "advanced";
  return (
    <nav
      class="catbar"
      aria-label={t(ui, "catbar.name")}
      data-layout={inline ? "inline" : "stacked"}
    >
      <div
        class="fam-tabs"
        role="toolbar"
        aria-label={t(ui, "catbar.families")}
        data-mode={modes.families}
      >
        {modes.families === "basic" ? (
          rows.families.map((family) => (
            <FamilyTab key={family.family} {...row} rows={rows} row={family} />
          ))
        ) : (
          <FilterPicker
            kind="families"
            {...row}
            vocab={now.vocab}
            rows={rows}
          />
        )}
      </div>
      <div
        class="pill-row"
        role="group"
        aria-label={t(ui, "catbar.predicates")}
        data-mode={modes.predicates}
      >
        {modes.predicates === "basic" ? (
          pillsOn(rows).map((p) => (
            <Pill key={p.predicate} {...row} vocab={now.vocab} row={p} />
          ))
        ) : (
          <FilterPicker
            kind="predicates"
            {...row}
            vocab={now.vocab}
            rows={rows}
          />
        )}
      </div>
      {tip.node}
    </nav>
  );
}
