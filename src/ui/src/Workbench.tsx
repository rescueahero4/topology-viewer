import {
  canvasLookup,
  type CanvasLookup,
  type DrawnId,
  type Lang,
  type OnCanvas,
} from "@qdic-topology/engine";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { Actions } from "./actions";
import { TableHead } from "./BulkBar";
import type { CanvasModel } from "./canvas/index";
import type { ShellHost } from "./host";
import { keepTicks, rangeSelect, type Ticks } from "./rangeSelect";
import { closeWorkbench, expandTable, layout } from "./split";
import { canvasState, frontier, lang, model } from "./state";
import { t } from "./strings/index";
import { fold } from "./FilterPicker";
import { WorkbenchBar } from "./WorkbenchBar";
import {
  attributeKeys,
  NO_CHOICE,
  sameColumn,
  shownColumns,
  sortRows,
  type Choice,
  type Column,
  type Sort,
} from "./workbenchColumns";
import {
  entitiesOf,
  keeps,
  rowsOf,
  rowState,
  searchTexts,
  type Filters,
  type Row,
} from "./workbenchRows";
import { WorkbenchTable } from "./WorkbenchTable";

type Session = {
  model: CanvasModel | null;
  filters: Filters;
  sort: Sort;
  choice: Choice;
  ticks: Ticks<number>;
  text: string;
};
type Update = (change: (now: Session) => Partial<Session>) => void;

const NO_TICKS: Ticks<number> = { ticked: new Set(), anchor: null };
// why: rule 4 (mockup `wbf`, app.js line 1003) — the filters at the start
const START: Omit<Session, "model"> = {
  filters: {
    scope: "all",
    rowType: "both",
    kinds: new Set(),
    families: new Set(),
    query: "",
  },
  sort: null,
  choice: NO_CHOICE,
  ticks: NO_TICKS,
  text: "",
};
// why: rule 4 (mockup search box, app.js line 1200) — the query takes the text 200 ms after a key
const DEBOUNCE_MS = 200;

// why: rule 12 (mockup `refreshWorkbench`, app.js lines 1202-1207) — a new input clears the ticks,
// the Kind and Family picks and the column choice; the choice is never stored (SA §11)
function fresh(now: CanvasModel | null, from: Session): Session {
  const { scope, rowType, query } = from.filters;
  const filters = { ...START.filters, scope, rowType, query };
  return { ...from, model: now, filters, choice: NO_CHOICE, ticks: NO_TICKS };
}

function useSession(now: CanvasModel | null): [Session, Update] {
  const [stored, setStored] = useState<Session>({ model: now, ...START });
  const session = stored.model === now ? stored : fresh(now, stored);
  const update: Update = (change) =>
    setStored((last) => {
      const base = last.model === now ? last : fresh(now, last);
      return { ...base, ...change(base) };
    });
  return [session, update];
}

// why: rule 3 (Implementer round-2 note 6) — one `canvasLookup` for each `settle` and one
// constant-time call for each row; the filters, the counts and the bulk bar read these states
function useTableView(now: CanvasModel, session: Session, ui: Lang) {
  const { graph, vocab } = now;
  const rows = rowsOf(graph, vocab);
  const settled = frontier.value;
  const state = canvasState.value;
  const lookup = useMemo(
    () => (state === null ? null : canvasLookup(state, graph, vocab)),
    [settled, now],
  );
  const states = useMemo<readonly OnCanvas[]>(
    () =>
      rows.map((row) =>
        lookup === null ? "not-drawn" : rowState(row, lookup),
      ),
    [rows, lookup],
  );
  const hidden = useMemo(
    () =>
      graph.entities.filter((e) => lookup?.onCanvas(e.id) === "hidden").length,
    [lookup, graph],
  );
  const texts = searchTexts(rows, ui, vocab);
  const { sort, filters } = session;
  const byCanvas =
    sort !== null && "core" in sort.column && sort.column.core === "canvas";
  const sorted = useMemo(
    () => sortRows(rows, sort, { lang: ui, vocab, states }),
    [rows, sort, ui, vocab, byCanvas ? states : null],
  );
  const shown = useMemo(
    () => sorted.filter((row) => keeps(filters, { states, texts }, row)),
    [sorted, filters, states, texts],
  );
  return {
    rows,
    lookup,
    states,
    hidden,
    shown,
    drawn: settled?.nodes.length ?? 0,
  };
}

type View = ReturnType<typeof useTableView>;

// why: rule 4 (mockup app.js lines 1063-1065) — "N rows" or "N of M rows", the canvas part only
// when the scope mode is not `all`, and the hidden part only when something is hidden
function countText(ui: Lang, now: CanvasModel, view: View): string {
  const total = view.rows.length;
  const shown = view.shown.length;
  const parts = [
    shown === total
      ? t(ui, "wb.rows", { count: total })
      : t(ui, "wb.rowsOf", { shown, total }),
  ];
  if (canvasState.value?.scope.mode !== "all")
    parts.push(
      t(ui, "wb.onCanvas", {
        shown: view.drawn,
        total: now.graph.entities.length,
      }),
    );
  if (view.hidden > 0) parts.push(t(ui, "wb.hidden", { count: view.hidden }));
  return parts.join("");
}

// why: rule 7 (mockup app.js lines 1213-1233) — a row with a hidden entity restores its Hidden
// entries; any other row focuses its record, or the subject of a triple
function pressOf(actions: Actions, lookup: CanvasLookup | null) {
  return (row: Row) => {
    if (lookup === null) return;
    const keys = entitiesOf(row)
      .map((id) => lookup.hiddenOf(id))
      .filter((key): key is DrawnId => key !== null);
    if (keys.length > 0) actions.restore([...new Set(keys)]);
    else actions.focus(row.rtype === "node" ? row.id : row.subject);
  };
}

// why: rule 5 — ascending, then descending, then the default order
const nextSort = (now: Sort, column: Column): Sort =>
  now === null || !sameColumn(now.column, column)
    ? { column, dir: 1 }
    : now.dir === 1
      ? { column, dir: -1 }
      : null;

function choose(choice: Choice, column: Column, on: boolean): Choice {
  if ("core" in column)
    return { ...choice, core: new Map(choice.core).set(column.core, on) };
  return { ...choice, attrs: new Map(choice.attrs).set(column.attr, on) };
}

// why: FR-TABLE-5 — a row that a filter removes loses its tick (mockup app.js line 1071)
function useTicks(view: View, session: Session, update: Update) {
  const keys = view.shown.map((row) => row.index);
  const kept = keepTicks(keys, session.ticks);
  const now = session.ticks;
  useLayoutEffect(() => {
    if (kept.ticked.size !== now.ticked.size || kept.anchor !== now.anchor)
      update(() => ({ ticks: kept }));
  });
  return {
    kept,
    tick: (index: number, shift: boolean) =>
      update((s) => ({
        ticks: rangeSelect(keys, keepTicks(keys, s.ticks), index, shift),
      })),
    all: () =>
      update((s) => ({
        ticks: {
          ticked: new Set([...keepTicks(keys, s.ticks).ticked, ...keys]),
          anchor: null,
        },
      })),
    clear: () => update(() => ({ ticks: NO_TICKS })),
  };
}

type BodyProps = {
  now: CanvasModel;
  actions: Actions;
  host: ShellHost;
  session: Session;
  update: Update;
  onText: (value: string) => void;
};

// why: rule 4 (mockup app.js line 1068) — the empty text of the Hidden scope with nothing hidden
function emptyText(ui: Lang, view: View, session: Session): string | null {
  if (view.shown.length > 0) return null;
  const nothing = session.filters.scope === "hidden" && view.hidden === 0;
  return t(ui, nothing ? "wb.emptyHidden" : "wb.empty");
}

type TableProps = Omit<BodyProps, "host" | "onText"> & {
  view: View;
  columns: readonly Column[];
};

function BodyTable({
  now,
  actions,
  session,
  update,
  view,
  columns,
}: TableProps) {
  const ui = lang.value;
  const { kept, tick, all, clear } = useTicks(view, session, update);
  const ticked = [...kept.ticked].map((index) => view.rows[index]);
  const { lookup, states } = view;
  const head = lookup !== null && (
    <TableHead
      {...{ ticked, total: view.shown.length, columns, actions }}
      {...{ lookup, states, drawnTotal: view.drawn, sort: session.sort }}
      onSort={(column) => update((s) => ({ sort: nextSort(s.sort, column) }))}
      onAll={all}
      onClear={clear}
    />
  );
  return (
    <WorkbenchTable
      {...{ rows: view.shown, columns, states, vocab: now.vocab, head }}
      empty={emptyText(ui, view, session)}
      ticked={kept.ticked}
      onTick={tick}
      onPress={pressOf(actions, lookup)}
    />
  );
}

function WorkbenchBody(props: BodyProps) {
  const { now, host, session, update } = props;
  const ui = lang.value;
  const view = useTableView(now, session, ui);
  const keys = attributeKeys(now.graph);
  return (
    <>
      <WorkbenchBar
        {...{ lang: ui, vocab: now.vocab, rows: view.rows, keys }}
        {...{
          filters: session.filters,
          text: session.text,
          onText: props.onText,
        }}
        choice={session.choice}
        onFilters={(change) =>
          update((s) => ({ filters: { ...s.filters, ...change } }))
        }
        onColumn={(column, on) =>
          update((s) => ({ choice: choose(s.choice, column, on) }))
        }
        count={countText(ui, now, view)}
        hidden={view.hidden}
        layout={layout.value}
        onExpand={() => expandTable(host)}
        onClose={closeWorkbench}
      />
      <BodyTable
        {...props}
        view={view}
        columns={shownColumns(keys, session.choice)}
      />
    </>
  );
}

type Props = { id: string; actions: Actions | null; host: ShellHost };

// why: FR-TABLE-4, FR-HOST-2, rules 4, 9, 12 — the Dataset table under the canvas. It stays mounted
// for the App, so the session state stays; a closed Workbench is `inert` and draws no rows
export function Workbench({ id, actions, host }: Props) {
  const ui = lang.value;
  const now = model.value;
  const [session, update] = useSession(now);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onText = (value: string) => {
    update(() => ({ text: value }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const query = fold(value.trim());
      update((s) => ({ filters: { ...s.filters, query } }));
    }, DEBOUNCE_MS);
  };
  const open = layout.value !== "canvas-only";
  return (
    <section
      id={id}
      class="workbench"
      aria-label={t(ui, "datasetTable")}
      inert={!open}
    >
      {open && now !== null && actions !== null && (
        <WorkbenchBody {...{ now, actions, host, session, update, onText }} />
      )}
    </section>
  );
}
