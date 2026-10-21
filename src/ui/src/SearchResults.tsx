import type {
  CanvasLookup,
  Graph,
  Lang,
  OnCanvas,
  Vocab,
} from "@qdic-topology/engine";
import type { Actions } from "./actions";
import type { CanvasModel } from "./canvas/index";
import { typeName } from "./names";
import { namesakeLine } from "./namesake";
import { lang } from "./state";
import { t, tAround, type Key } from "./strings/index";
import { TypeGlyph } from "./TypeGlyph";

// why: mockup `showResults` (app.js lines 958-959) — the first 50 rows, then one "N more…" line
export const SHOWN = 50;

// why: rule 3, SA §6 row 21 (search part), P20 — `drawn` adds nothing; a faded hit is text only,
// with no state glyph, because the mockup search row has none (H1, app.js lines 951-991)
const STATE_TEXT: Readonly<Record<OnCanvas, Key | null>> = {
  drawn: null,
  "not-drawn": "search.notDrawn",
  hidden: "search.hidden",
  faded: "search.faded",
};

const recordCounts = new WeakMap<Graph, ReadonlyMap<string, number>>();

// why: FR-DATA-5 — one row for each entity with the count of its records, read once for each input
function recordsOf(graph: Graph): ReadonlyMap<string, number> {
  let known = recordCounts.get(graph);
  if (known === undefined) {
    known = new Map(graph.entities.map((e) => [e.id, e.records.length]));
    recordCounts.set(graph, known);
  }
  return known;
}

// why: rule 3, open question 1 (FR-CANVAS-12 "Restore"; mockup table row app.js lines 1229-1231)
// — a hidden hit restores its Hidden entry; every other hit is focused (FR-CANVAS-4)
export function pickHit(
  actions: Actions,
  lookup: CanvasLookup | null,
  id: string,
): void {
  const key = lookup?.onCanvas(id) === "hidden" ? lookup.hiddenOf(id) : null;
  if (key !== null) actions.restore([key]);
  else actions.focus(id);
}

function metaOf(
  ui: Lang,
  type: string | null,
  vocab: Vocab,
  records: number,
  state: OnCanvas,
): string {
  const key = STATE_TEXT[state];
  return [
    typeName(ui, type, vocab.types),
    records > 1 ? t(ui, "search.records", { count: records }) : "",
    key === null ? "" : t(ui, key),
  ].join("");
}

type Props = {
  model: CanvasModel;
  lookup: CanvasLookup | null;
  hits: readonly string[];
  active: number;
  query: string;
  labelledBy: string;
  onPick: (id: string) => void;
};

// why: rule 3, FR-CANVAS-19, EPIC-003 hand-off H12 (mockup app.js lines 954-958) — each row has the
// type mark, the full label and the meta line; a namesake gets its container path under the meta
// line. A press keeps the focus in the input, so the list does not close before the pick
export function SearchResults(props: Props) {
  const { model, lookup, hits, active, query, labelledBy, onPick } = props;
  const ui = lang.value;
  const { vocab } = model;
  const records = recordsOf(model.graph);
  const [before, after] = tAround(ui, "search.none", "query");
  return (
    <ul
      class="menu search-results"
      role="listbox"
      aria-labelledby={labelledBy}
      onMouseDown={(event) => event.preventDefault()}
    >
      {hits.length === 0 && (
        <li class="none">
          {before}
          {query}
          {after}
        </li>
      )}
      {hits.slice(0, SHOWN).map((id, i) => {
        const entity = vocab.entities.get(id);
        const type = entity?.type ?? null;
        const visual =
          type === null ? null : (vocab.types.get(type)?.visual ?? null);
        const state = lookup?.onCanvas(id) ?? "drawn";
        const namesake = namesakeLine(vocab, id);
        return (
          <li
            key={id}
            role="option"
            aria-selected={i === active}
            onClick={() => onPick(id)}
          >
            <span class="glyph">
              <TypeGlyph visual={visual} size={16} untyped={vocab.untyped} />
            </span>
            <span class="name">{entity?.label ?? id}</span>
            <span class="meta">
              {metaOf(ui, type, vocab, records.get(id) ?? 1, state)}
            </span>
            {namesake !== null && <span class="sub">{namesake}</span>}
          </li>
        );
      })}
      {hits.length > SHOWN && (
        <li class="none">
          {t(ui, "search.more", { count: hits.length - SHOWN })}
        </li>
      )}
    </ul>
  );
}
