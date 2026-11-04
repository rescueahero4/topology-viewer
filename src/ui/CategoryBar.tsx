import { commands, customFilters, type CustomFilter } from "./commands";
import { optionOf } from "./custom";
import { extendable } from "./Part";
import {
  filterMode,
  stats,
  type Mode,
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

function FamilyTabView(props: Row & { rows: Stats; row: FamilyRow }) {
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

const FamilyTab = extendable("family-tab", FamilyTabView, ({ row }) => ({
  family: row.family,
  count: row.count,
  on: row.on,
}));

function PillView(props: Row & { vocab: Vocab; row: PredicateRow }) {
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

const Pill = extendable("predicate-pill", PillView, ({ row }) => ({
  predicate: row.predicate,
  family: row.family,
  count: row.count,
  on: row.on,
}));

const FamilyPicker = extendable("family-picker", FilterPicker);
const PredicatePicker = extendable("predicate-picker", FilterPicker);

// The rows without what the developer leaves out, and the mode by the developer's limit.
function shownRows(all: Stats) {
  const noFamilies = optionOf<readonly string[]>("filter-families", "hidden");
  const noPredicates = optionOf<readonly string[]>("filters", "hidden");
  const rows: Stats = {
    ...all,
    families: all.families.filter((one) => !noFamilies?.includes(one.family)),
    predicates: all.predicates.filter(
      (one) => !noPredicates?.includes(one.predicate),
    ),
  };
  const modes = filterMode(rows);
  const mode = (part: string, count: number, now: Mode): Mode => {
    const most = optionOf<number>(part, "basicMax");
    return most === undefined ? now : count > most ? "advanced" : "basic";
  };
  return {
    rows,
    modes: {
      families: mode("filter-families", rows.families.length, modes.families),
      predicates: mode("filters", rows.predicates.length, modes.predicates),
    },
  };
}

function CustomFilters() {
  const given = optionOf<readonly CustomFilter[]>("filters", "custom") ?? [];
  const on = customFilters.value;
  return (
    <>
      {given.map((filter) => (
        <button
          key={filter.id}
          type="button"
          class="pill custom-filter"
          aria-pressed={on.has(filter.id)}
          onClick={() => commands.setCustomFilter(filter.id, !on.has(filter.id))}
        >
          {filter.label}
        </button>
      ))}
    </>
  );
}

type RowsProps = Row & { vocab: Vocab; rows: Stats; mode: Mode };

function FamilyStripView({ mode, ...row }: RowsProps) {
  const { rows, vocab } = row;
  return (
    <div
      class="fam-tabs"
      role="toolbar"
      aria-label={t(row.lang, "catbar.families")}
      data-mode={mode}
    >
      {mode === "basic" ? (
        rows.families.map((family) => (
          <FamilyTab key={family.family} {...row} row={family} />
        ))
      ) : (
        <FamilyPicker kind="families" {...row} vocab={vocab} />
      )}
    </div>
  );
}

function PredicateStripView({ mode, ...row }: RowsProps) {
  const { rows, vocab } = row;
  return (
    <div
      class="pill-row"
      role="group"
      aria-label={t(row.lang, "catbar.predicates")}
      data-mode={mode}
    >
      {mode === "basic" ? (
        pillsOn(rows).map((p) => (
          <Pill key={p.predicate} {...row} vocab={vocab} row={p} />
        ))
      ) : (
        <PredicatePicker kind="predicates" {...row} vocab={vocab} />
      )}
      <CustomFilters />
    </div>
  );
}

const FamilyStrip = extendable("filter-families", FamilyStripView);
const PredicateStrip = extendable("filters", PredicateStripView);

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
function CategoryBarView({ actions }: { actions: Actions }) {
  const tip = useTip();
  const now = editedModel.value;
  const state = canvasState.value;
  if (now === null || state === null) return null;
  const ui = lang.value;
  const { rows, modes } = shownRows(stats(now.vocab, state));
  const row = { actions, lang: ui, tip };
  const inline =
    modes.families === "advanced" && modes.predicates === "advanced";
  return (
    <nav
      class="catbar"
      aria-label={t(ui, "catbar.name")}
      data-layout={inline ? "inline" : "stacked"}
    >
      <FamilyStrip {...row} vocab={now.vocab} rows={rows} mode={modes.families} />
      <PredicateStrip
        {...row}
        vocab={now.vocab}
        rows={rows}
        mode={modes.predicates}
      />
      {tip.node}
    </nav>
  );
}

export const CategoryBar = extendable("filter-bar", CategoryBarView);
