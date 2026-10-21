import {
  entityOfDrawnId,
  type Lang,
  type OnCanvas,
  type Provenance,
  type Selection,
  type Vocab,
} from "@qdic-topology/engine";
import type { ComponentChildren, RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { Checkbox } from "./Checkbox";
import { EyeIcon } from "./EyeIcon";
import { familyClass } from "./familyLook";
import { provTag } from "./names";
import { lang, selection } from "./state";
import { t, tAround } from "./strings/index";
import { useTip, type Tip } from "./Tooltip";
import { TypeGlyph } from "./TypeGlyph";
import { cellText, columnKey, type Column } from "./workbenchColumns";
import type { Row } from "./workbenchRows";

// why: FR-TABLE-4, rule 6 (mockup `ROW_H`, `OVERSCAN`, app.js line 999)
const ROW_H = 36;
const OVERSCAN = 10;

type Port = { top: number; height: number };

const windowOf = ({ top, height }: Port, count: number) => ({
  first: Math.max(0, Math.floor(top / ROW_H) - OVERSCAN),
  last: Math.min(count, Math.ceil((top + height) / ROW_H) + OVERSCAN),
});

const same = (a: Port, b: Port, count: number) => {
  const [x, y] = [windowOf(a, count), windowOf(b, count)];
  return x.first === y.first && x.last === y.last;
};

// why: rule 6 (mockup `renderWbWindow`, app.js lines 1077-1092) — a new render only when the first
// or the last index of the window changes, and on a resize of the scroll area
function useWindow(scroll: RefObject<HTMLDivElement>, count: number) {
  const [port, setPort] = useState<Port>({ top: 0, height: 0 });
  const measure = (force: boolean) => {
    const el = scroll.current;
    if (el === null) return;
    const next = { top: el.scrollTop, height: el.clientHeight };
    setPort((now) => (!force && same(now, next, count) ? now : next));
  };
  useLayoutEffect(() => {
    const el = scroll.current;
    if (el === null) return;
    measure(true);
    const watch = new ResizeObserver(() => measure(true));
    watch.observe(el);
    return () => watch.disconnect();
  }, [scroll]);
  return { ...windowOf(port, count), measure };
}

// why: rule 7 (mockup app.js lines 1235-1244) — a canvas selection of an entity that did not come
// from a table press scrolls its first row into view, a third of the height below the top. The
// press keeps the selection that it made, so a press that makes none holds back no later selection
// (QA Done gate item 1)
function useFocusScroll(
  scroll: RefObject<HTMLDivElement>,
  rows: readonly Row[],
  fromTable: { current: Selection | undefined },
  measure: (force: boolean) => void,
) {
  const seen = useRef<Selection>(selection.value);
  const now = selection.value;
  useLayoutEffect(() => {
    if (now === seen.current) return;
    seen.current = now;
    const pressed = fromTable.current === now;
    fromTable.current = undefined;
    const entity = focusOf(now);
    const el = scroll.current;
    if (pressed || entity === null || el === null) return;
    const at = rows.findIndex((r) => r.rtype === "node" && r.entity === entity);
    const { scrollTop: top, clientHeight: height } = el;
    if (
      at < 0 ||
      (at * ROW_H >= top && (at + 1) * ROW_H <= top + height - ROW_H)
    )
      return;
    el.scrollTop = Math.max(0, at * ROW_H - height / 3);
    measure(true);
  }, [now]);
}

// why: mockup `isFocusRow` (app.js line 1012) — a selected entity marks its node rows; a group or
// an edge selection marks none
function focusOf(now: Selection): string | null {
  return now !== null && "node" in now ? entityOfDrawnId(now.node) : null;
}

type Cells = {
  ui: Lang;
  vocab: Vocab;
  tip: Tip;
  state: OnCanvas;
};

// why: rule 2 — a long cell keeps one line (shell-workbench.css) and its full text is in the one
// `Tooltip` of the table; the text is a text node, never an attribute (SA §11)
function Cell({
  column,
  row,
  ui,
  vocab,
  tip,
  state,
}: Cells & { column: Column; row: Row }) {
  if ("core" in column && column.core === "canvas")
    return (
      <td>
        <EyeIcon state={state} />
      </td>
    );
  const text = cellText(ui, vocab, column, row);
  if (text === "") return <td />;
  const anchor = tip.anchor(`${row.index}:${columnKey(column)}`, text);
  if (!("core" in column)) return <td {...anchor}>{text}</td>;
  if (column.core === "id")
    return (
      <td {...anchor}>
        <code>{text}</code>
      </td>
    );
  if (column.core === "type")
    return (
      <td>
        <span class={`t-${row.rtype}`}>{text}</span>
      </td>
    );
  if (column.core === "kind" && row.rtype === "node")
    return <KindCell {...{ ui, text, row, vocab, anchor }} />;
  if (column.core === "predicate" && row.rtype === "edge")
    return (
      <td {...anchor}>
        {text}
        <ProvTag
          ui={ui}
          provenance={vocab.predicates.get(row.predicate)?.provenance}
        />
      </td>
    );
  if (column.core === "name" && row.rtype === "edge")
    return (
      <td {...anchor}>
        <span class="pred">{text}</span>
      </td>
    );
  if (column.core === "family" && row.rtype === "edge")
    return (
      <td {...anchor}>
        <span class={`fam ${familyClass(row.family)}`}>{text}</span>
      </td>
    );
  return <td {...anchor}>{text}</td>;
}

// why: FR-VOC-3 (ISSUE-012 C7) — the inspector tag after the Kind of a node row and the Predicate
// of an edge row; the cell text, the sort and the search stay without it
function ProvTag({ ui, provenance }: { ui: Lang; provenance?: Provenance }) {
  if (provenance === undefined) return null;
  return <span class="prov mono">{provTag(ui, provenance)}</span>;
}

type KindProps = {
  ui: Lang;
  text: string;
  row: Extract<Row, { rtype: "node" }>;
  vocab: Vocab;
  anchor: ReturnType<Tip["anchor"]>;
};

function KindCell({ ui, text, row, vocab, anchor }: KindProps) {
  const type = row.type === null ? undefined : vocab.types.get(row.type);
  const visual = type?.visual ?? null;
  return (
    <td {...anchor}>
      <span class="kind">
        <TypeGlyph
          visual={visual}
          size={16}
          untyped={row.type === null ? vocab.untyped : null}
        />
        {text}
        <ProvTag ui={ui} provenance={type?.provenance} />
      </span>
    </td>
  );
}

type Line = {
  row: Row;
  columns: readonly Column[];
  ticked: boolean;
  focus: string | null;
  cells: Cells;
  onTick: (shift: boolean) => void;
  onPress: () => void;
};

// why: rule 7 — the tick cell only ticks (with Shift a range); any other cell presses the row.
// The tick takes its name from text nodes, and the model name is its own text node (SA §11)
function TableRow({
  row,
  columns,
  ticked,
  focus,
  cells,
  onTick,
  onPress,
}: Line) {
  const [before, after] = tAround(cells.ui, "wb.selectRow", "name");
  const marked = row.rtype === "node" && row.entity === focus;
  const classes = ["row", marked ? "is-focus" : "", ticked ? "is-sel" : ""];
  return (
    <tr
      class={classes.filter((c) => c !== "").join(" ")}
      aria-selected={ticked}
      onClick={(event) => {
        if (!(event.target as Element).closest("td.sel")) onPress();
      }}
    >
      <td
        class="sel"
        {...cells.tip.anchor(`${row.index}:sel`, t(cells.ui, "rangeTip"))}
        onMouseDown={(event) => {
          if (event.shiftKey) event.preventDefault();
        }}
      >
        <Checkbox
          checked={ticked}
          label={
            <span class="sr-only">
              {before}
              {row.rtype === "node" ? row.name : row.id}
              {after}
            </span>
          }
          onChange={(_, shift) => onTick(shift)}
        />
      </td>
      {columns.map((column) => (
        <Cell key={columnKey(column)} column={column} row={row} {...cells} />
      ))}
    </tr>
  );
}

function Spacer({ height, span }: { height: number; span: number }) {
  if (height <= 0) return null;
  return (
    <tr class="wb-pad" aria-hidden="true">
      <td colSpan={span} style={{ height: `${height}px` }} />
    </tr>
  );
}

type Props = {
  rows: readonly Row[];
  columns: readonly Column[];
  states: readonly OnCanvas[];
  vocab: Vocab;
  ticked: ReadonlySet<number>;
  head: ComponentChildren;
  empty: string | null;
  onTick: (index: number, shift: boolean) => void;
  onPress: (row: Row) => void;
};

// why: FR-TABLE-4, rules 3, 6, 7 — the window of rows between two spacer rows, so the scroll height
// stays the height of every row; the head is the column labels or the bulk bar
export function WorkbenchTable(props: Props) {
  const { rows, columns, states, vocab, ticked, head, empty } = props;
  const ui = lang.value;
  const tip = useTip();
  const scroll = useRef<HTMLDivElement>(null);
  const fromTable = useRef<Selection | undefined>(undefined);
  const { first, last, measure } = useWindow(scroll, rows.length);
  useFocusScroll(scroll, rows, fromTable, measure);
  const focus = focusOf(selection.value);
  const span = columns.length + 1;
  return (
    <div class="wb-scroll" ref={scroll} onScroll={() => measure(false)}>
      <table class="wb-table">
        <thead>{head}</thead>
        <tbody>
          <Spacer height={first * ROW_H} span={span} />
          {rows.slice(first, last).map((row) => (
            <TableRow
              key={row.index}
              {...{ row, columns, focus }}
              ticked={ticked.has(row.index)}
              cells={{ ui, vocab, tip, state: states[row.index] }}
              onTick={(shift) => props.onTick(row.index, shift)}
              onPress={() => {
                const before = selection.peek();
                props.onPress(row);
                const after = selection.peek();
                fromTable.current = after === before ? undefined : after;
              }}
            />
          ))}
          <Spacer height={(rows.length - last) * ROW_H} span={span} />
        </tbody>
      </table>
      {empty !== null && <p class="wb-empty">{empty}</p>}
      {tip.node}
    </div>
  );
}
