import type {
  CanvasLookup,
  DrawnId,
  Lang,
  OnCanvas,
} from "@qdic-topology/engine";
import type { Actions } from "./actions";
import { Checkbox } from "./Checkbox";
import { lang } from "./state";
import { formatted, t } from "./strings/index";
import { useTip } from "./Tooltip";
import { UiIcon } from "./UiIcon";
import {
  columnKey,
  coreName,
  sameColumn,
  type Column,
  type Sort,
} from "./workbenchColumns";
import type { Row } from "./workbenchRows";

type Targets = { show: string[]; hide: number; ids: DrawnId[] };

// why: rule 8 (mockup `selTargets`, app.js lines 1094-1103) — in tick order: the entities to bring
// onto the canvas (a node row that is not drawn or hidden, and such ends of an edge row; a ticked
// hidden row comes back) and the drawn node entities to hide; edge rows leave with their ends
function targetsOf(
  rows: readonly Row[],
  lookup: CanvasLookup,
  states: readonly OnCanvas[],
): Targets {
  const show = new Set<string>();
  const hide = new Set<string>();
  const ids = new Set<DrawnId>();
  const away = (state: OnCanvas) => state === "not-drawn" || state === "hidden";
  for (const row of rows)
    if (row.rtype === "edge") {
      for (const end of [row.subject, row.object])
        if (away(lookup.onCanvas(end))) show.add(end);
    } else if (away(states[row.index])) show.add(row.entity);
    else if (states[row.index] === "drawn") {
      hide.add(row.entity);
      const id = lookup.drawnIdOf(row.entity);
      if (id !== null) ids.add(id);
    }
  return { show: [...show], hide: hide.size, ids: [...ids] };
}

type Props = {
  ticked: readonly Row[];
  total: number;
  span: number;
  lookup: CanvasLookup;
  states: readonly OnCanvas[];
  drawnTotal: number;
  actions: Actions;
  onAll: () => void;
  onClear: () => void;
};

// why: FR-TABLE-5, rule 8, epic question 19 (ddr-0049) — with ticked rows the head is the bulk bar;
// Hide counts at most the drawn nodes less one, and the engine keeps one node drawn
function BulkBar(props: Props) {
  const { ticked, total, lookup, states, drawnTotal, actions } = props;
  const ui = lang.value;
  const tip = useTip();
  const { show, hide, ids } = targetsOf(ticked, lookup, states);
  const hides = Math.max(0, Math.min(hide, drawnTotal - 1));
  const button = (on: boolean, run: () => void) => ({
    type: "button" as const,
    class: "btn small",
    "aria-disabled": on ? undefined : ("true" as const),
    onClick: () => {
      if (on) run();
    },
  });
  const count = (n: number) =>
    n > 0 ? <span class="bulk-n">{formatted(ui, n)}</span> : null;
  return (
    <th scope="colgroup" colSpan={props.span} class="wb-bulk">
      <div class="wb-bulk-in">
        <span class="bulk-sel" aria-live="polite">
          {t(ui, "wb.selected", { count: ticked.length, total })}
        </span>
        <button
          {...button(show.length > 0, () => actions.reveal(show))}
          {...tip.anchor(
            "show",
            t(ui, show.length > 0 ? "wb.showTip" : "wb.showNone"),
          )}
        >
          <UiIcon name="eye" />
          {t(ui, "wb.show")}
          {count(show.length)}
        </button>
        <button
          {...button(hides > 0, () => actions.hide(ids))}
          {...tip.anchor(
            "hide",
            t(ui, hides > 0 ? "wb.hideTip" : "wb.hideNone"),
          )}
        >
          <UiIcon name="eye-off" />
          {t(ui, "wb.hide")}
          {count(hides)}
        </button>
        {ticked.length < total && (
          <button type="button" class="link-btn" onClick={props.onAll}>
            {t(ui, "wb.selectAll", { count: total })}
          </button>
        )}
        <button type="button" class="link-btn" onClick={props.onClear}>
          {t(ui, "wb.clear")}
        </button>
      </div>
      {tip.node}
    </th>
  );
}

const ARROWS = { 1: "wb.ascending", [-1]: "wb.descending" } as const;

function SortHead(props: {
  lang: Lang;
  column: Column;
  sort: Sort;
  onSort: (column: Column) => void;
}) {
  const { lang: ui, column, sort } = props;
  const dir = sort !== null && sameColumn(sort.column, column) ? sort.dir : 0;
  const label = "core" in column ? coreName(ui, column.core) : column.attr;
  return (
    <th
      scope="col"
      aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : "none"}
    >
      <button type="button" data-sort="" onClick={() => props.onSort(column)}>
        {label}
        {dir !== 0 && t(ui, ARROWS[dir])}
      </button>
    </th>
  );
}

type HeadProps = Omit<Props, "span"> & {
  columns: readonly Column[];
  sort: Sort;
  onSort: (column: Column) => void;
};

// why: rule 8 (mockup `renderWbHead`, app.js lines 1107-1131) — the header box has the partial
// state; with ticked rows the column labels give way to the bulk bar. As in the mockup (line 1140)
// the box clears while any row is ticked, so its name and its action agree (QA Done gate item 4)
export function TableHead(props: HeadProps) {
  const ui = lang.value;
  const { ticked, total, columns } = props;
  const k = ticked.length;
  return (
    <tr>
      <th scope="col" class="sel">
        <Checkbox
          checked={k > 0 && k === total}
          partial={k > 0 && k < total}
          label={
            <span class="sr-only">
              {t(ui, k > 0 ? "wb.clearSelection" : "wb.selectAllRows")}
            </span>
          }
          onChange={() => (k > 0 ? props.onClear() : props.onAll())}
        />
      </th>
      {k > 0 ? (
        <BulkBar {...props} span={columns.length} />
      ) : (
        columns.map((column) => (
          <SortHead
            key={columnKey(column)}
            lang={ui}
            column={column}
            sort={props.sort}
            onSort={props.onSort}
          />
        ))
      )}
    </tr>
  );
}
