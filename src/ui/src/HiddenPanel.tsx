import { computed } from "@preact/signals";
import {
  groupParts,
  hiddenList,
  type DrawnId,
  type HiddenItem,
  type Lang,
  type Vocab,
} from "@qdic-topology/engine";
import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Actions } from "./actions";
import { Checkbox } from "./Checkbox";
import { HiddenRow, type Row } from "./HiddenRow";
import { entityIdOf } from "./Inspector";
import { typeName } from "./names";
import { keepTicks, rangeSelect, type Ticks } from "./rangeSelect";
import { groupText } from "./relations";
import { canvasState, lang, model } from "./state";
import { formatted, MISSING, t } from "./strings/index";
import { UiIcon } from "./UiIcon";

// why: mockup `renderHidden` sub line (app.js line 875) — the parts join with a middle dot
const PART = " · ";
// why: mockup `dockHidden` (app.js line 839) — the card sits 12 px left of the inspector
const DOCK_GAP = 12;

export const hiddenItems = computed<HiddenItem[]>(() => {
  const state = canvasState.value;
  return state === null ? [] : hiddenList(state);
});

// why: rule 1 (Implementer item 2) — an `e:` key names its entity; a `g:` key takes its type from
// `groupParts` and its name from the canvas group text of that type and the member count
function rowOf(ui: Lang, vocab: Vocab, item: HiddenItem): Row {
  const id = entityIdOf(item.key);
  const entity = id === null ? undefined : vocab.entities.get(id);
  const type =
    id === null ? (groupParts(item.key)?.type ?? null) : (entity?.type ?? null);
  const name =
    id === null
      ? groupText(ui, vocab, type, item.members.length)
      : (entity?.label ?? MISSING);
  const parts = [typeName(ui, type, vocab.types)];
  if (item.members.length > 1)
    parts.push(t(ui, "hidden.together", { count: item.members.length }));
  if (item.stranded > 0)
    parts.push(t(ui, "hidden.stranded", { count: item.stranded }));
  return { key: item.key, type, name, sub: parts.join(PART) };
}

// why: mockup `dockHidden` (app.js lines 839-841) — the card docks left of the inspector, whatever
// width the inspector has; the canvas element carries the distance for the card and the search
export function useDock(canvas: RefObject<HTMLElement>): void {
  useLayoutEffect(() => {
    const frame = canvas.current;
    const inspector = frame?.querySelector<HTMLElement>(".inspector");
    if (frame == null || inspector == null) return;
    const dock = () =>
      frame.style.setProperty(
        "--hid-right",
        `${inspector.offsetWidth + DOCK_GAP}px`,
      );
    dock();
    const watch = new ResizeObserver(dock);
    watch.observe(inspector);
    return () => watch.disconnect();
  });
}

// why: mockup `.hid-count.bump` (styles.css line 285) — a new element for each count, so the bump
// runs once each time the count grows
function Chip({ count, open, onToggle }: Toggle & { count: number }) {
  const ui = lang.value;
  const before = useRef(0);
  const bump = useRef(false);
  if (count !== before.current) {
    bump.current = count > before.current;
    before.current = count;
  }
  return (
    <button
      type="button"
      class="hid-toggle"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span class="ic">
        <UiIcon name="eye-off" />
      </span>
      {t(ui, "hidden.chip")}
      <span key={count} class={bump.current ? "hid-count bump" : "hid-count"}>
        {formatted(ui, count)}
      </span>
      {!open && (
        <span class="ic chev">
          <UiIcon name="chevrons-up" />
        </span>
      )}
    </button>
  );
}

type Toggle = { open: boolean; onToggle: () => void };
type Props = Toggle & { actions: Actions };

// why: FR-CANVAS-12, rule 1 (mockup app.js lines 828-949, index.html lines 145-150) — a chip while
// anything is hidden, a card when the user opens it; `App` shows it only while the list has items
export function HiddenPanel({ actions, open, onToggle }: Props) {
  const ui = lang.value;
  const now = model.value;
  if (now === null) return null;
  const items = hiddenItems.value;
  return (
    <aside
      class="hidden-panel float-card"
      data-state={open ? "expanded" : "collapsed"}
      aria-label={t(ui, "hidden.name")}
    >
      <div class="insp-head hid-head">
        <Chip count={items.length} open={open} onToggle={onToggle} />
        {open && <span class="spacer" />}
        {open && (
          <button
            type="button"
            class="icon-btn"
            aria-label={t(ui, "hidden.collapse")}
            aria-expanded="true"
            onClick={onToggle}
          >
            <span class="ic">
              <UiIcon name="chevrons-down" />
            </span>
          </button>
        )}
      </div>
      {open && (
        <HiddenBody
          actions={actions}
          vocab={now.vocab}
          rows={items.map((item) => rowOf(ui, now.vocab, item))}
        />
      )}
    </aside>
  );
}

type BodyProps = { actions: Actions; vocab: Vocab; rows: Row[] };

// why: rule 1 (mockup app.js lines 909-937) — a key that left the list loses its tick; a restore
// takes its keys out of the ticks and is one `restore(keys)` call
function useTicks(keys: DrawnId[], actions: Actions) {
  const [ticks, setTicks] = useState<Ticks<DrawnId>>({
    ticked: new Set(),
    anchor: null,
  });
  const kept = keepTicks(keys, ticks);
  const { ticked } = kept;
  return {
    ticked,
    tick: (key: DrawnId, shift: boolean) =>
      setTicks(rangeSelect(keys, kept, key, shift)),
    tickAll: (on: boolean) =>
      setTicks({ ticked: new Set(on ? keys : []), anchor: null }),
    restore: (picked: DrawnId[]) => {
      setTicks({
        ticked: new Set([...ticked].filter((key) => !picked.includes(key))),
        anchor: kept.anchor,
      });
      actions.restore(picked);
    },
  };
}

type Keys = {
  list: HTMLUListElement | null;
  keys: DrawnId[];
  move: (index: number) => void;
  tick: (key: DrawnId, shift: boolean) => void;
  restore: (picked: DrawnId[]) => void;
};

// why: rule 1 (mockup app.js lines 939-948) — the list is one tab stop: the arrow keys move the
// active row, Space ticks it (Shift+Space ticks the range) and Enter restores it
function onListKey(
  event: KeyboardEvent,
  { list, keys, move, tick, restore }: Keys,
) {
  const index = [...(list?.children ?? [])].indexOf(event.target as Element);
  if (index < 0) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    const target = list?.children[next];
    if (!(target instanceof HTMLElement)) return;
    move(next);
    target.focus();
  } else if (event.key === " ") {
    event.preventDefault();
    tick(keys[index], event.shiftKey);
  } else if (event.key === "Enter") {
    event.preventDefault();
    restore([keys[index]]);
  }
}

// why: rule 1 (mockup app.js lines 870-949) — the select-all box, the restore button and the rows
function HiddenBody({ actions, vocab, rows }: BodyProps) {
  const ui = lang.value;
  const list = useRef<HTMLUListElement>(null);
  const keys = rows.map((row) => row.key);
  const { ticked, tick, tickAll, restore } = useTicks(keys, actions);
  const [active, setActive] = useState(0);
  const at = Math.min(active, rows.length - 1);
  return (
    <div class="insp-body hid-body">
      <SelectBar
        keys={keys}
        ticked={ticked}
        onTick={tickAll}
        onShow={() =>
          restore(ticked.size > 0 ? keys.filter((k) => ticked.has(k)) : keys)
        }
      />
      <ul
        ref={list}
        class="hid-list"
        role="listbox"
        aria-multiselectable="true"
        aria-label={t(ui, "hidden.list")}
        onKeyDown={(event) =>
          onListKey(event, {
            ...{ list: list.current, keys, move: setActive },
            ...{ tick, restore },
          })
        }
      >
        {rows.map((row, i) => (
          <HiddenRow
            key={row.key}
            {...{ row, vocab, active: i === at, ticked: ticked.has(row.key) }}
            onPress={(shift) => tick(row.key, shift)}
            onShow={() => restore([row.key])}
          />
        ))}
      </ul>
    </div>
  );
}

type BarProps = {
  keys: readonly DrawnId[];
  ticked: ReadonlySet<DrawnId>;
  onTick: (on: boolean) => void;
  onShow: () => void;
};

// why: rule 1 (mockup `syncHidChecks`, app.js lines 896-908) — the select-all box with its partial
// state, the selection note and the restore button
function SelectBar({ keys, ticked, onTick, onShow }: BarProps) {
  const ui = lang.value;
  const count = ticked.size;
  const total = keys.length;
  const note =
    count > 0
      ? t(ui, "hidden.selected", { count, total })
      : t(ui, "hidden.selectAll");
  return (
    <div class="hid-bar">
      <Checkbox
        checked={count > 0 && count === total}
        partial={count > 0 && count < total}
        label={<span aria-live="polite">{note}</span>}
        onChange={onTick}
      />
      <span class="spacer" />
      <button type="button" class="btn small primary" onClick={onShow}>
        {count > 0
          ? t(ui, "hidden.showSelected", { count })
          : t(ui, "hidden.showAll")}
      </button>
    </div>
  );
}
