import type { Lang, Vocab } from "@qdic-topology/engine";
import type { ComponentChildren } from "preact";
import { useId, useMemo } from "preact/hooks";
import { Checkbox } from "./Checkbox";
import { ColumnMenu } from "./ColumnMenu";
import { Menu } from "./Menu";
import { familyName, typeName } from "./names";
import type { Layout } from "./split";
import { formatted, t, type Key } from "./strings/index";
import { useTip, type Tip } from "./Tooltip";
import { TypeGlyph } from "./TypeGlyph";
import { UiIcon } from "./UiIcon";
import type { Choice, Column } from "./workbenchColumns";
import type { Filters, Row, RowType, Scope } from "./workbenchRows";

type Item<K> = { key: K; label: ComponentChildren; count: number };

type CheckProps<K> = {
  lang: Lang;
  name: Key;
  items: readonly Item<K>[];
  picked: ReadonlySet<K>;
  onPick: (picked: ReadonlySet<K>) => void;
};

// why: FR-TABLE-2, rule 4 (mockup `renderWbFilterMenus`, app.js lines 1159-1173) — a menu of check
// items with counts, "Clear" while any item is on, and a count badge on the button
function CheckMenu<K>({
  lang: ui,
  name,
  items,
  picked,
  onPick,
}: CheckProps<K>) {
  const toggle = (key: K, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(key);
    else next.delete(key);
    onPick(next);
  };
  const label = (
    <>
      {t(ui, name)}
      {picked.size > 0 && (
        <span class="count-badge">{formatted(ui, picked.size)}</span>
      )}
    </>
  );
  return (
    <Menu
      label={label}
      buttonClass={picked.size > 0 ? "wb-btn active" : "wb-btn"}
      menuClass="wb-menu"
    >
      {picked.size > 0 && (
        <button type="button" class="clear" onClick={() => onPick(new Set())}>
          {t(ui, "wb.clear")}
        </button>
      )}
      <p class="menu-label">{t(ui, name)}</p>
      {items.map((item, at) => (
        <div class="check-item" key={at}>
          <Checkbox
            checked={picked.has(item.key)}
            label={
              <>
                {item.label}
                <span class="n">{formatted(ui, item.count)}</span>
              </>
            }
            onChange={(on) => toggle(item.key, on)}
          />
        </div>
      ))}
    </Menu>
  );
}

// why: rule 4 — the Kind items are the node types with their node-row counts, most first; the
// Family items are the edge families in the vocab order
function useMenuItems(rows: readonly Row[], vocab: Vocab, ui: Lang) {
  return useMemo(() => {
    const kinds = new Map<string | null, number>();
    const families = new Map<string, number>();
    for (const row of rows)
      if (row.rtype === "node")
        kinds.set(row.type, (kinds.get(row.type) ?? 0) + 1);
      else families.set(row.family, (families.get(row.family) ?? 0) + 1);
    const kindItems = [...kinds]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => {
        const visual =
          key === null ? null : (vocab.types.get(key)?.visual ?? null);
        const untyped = key === null ? vocab.untyped : null;
        const label = (
          <>
            <span class="glyph">
              <TypeGlyph visual={visual} size={16} untyped={untyped} />
            </span>
            {typeName(ui, key, vocab.types)}
          </>
        );
        return { key, label, count };
      });
    const familyItems = vocab.families
      .filter((family) => families.has(family.key))
      .map(({ key }) => ({
        key,
        label: familyName(ui, key),
        count: families.get(key) ?? 0,
      }));
    return { kindItems, familyItems };
  }, [rows, vocab, ui]);
}

type Option<V extends string> = {
  value: V;
  label: ComponentChildren;
  tip?: string;
};
type SegProps<V extends string> = {
  name: string;
  value: V;
  options: readonly Option<V>[];
  tip: Tip;
  onPick: (value: V) => void;
};

// why: the mockup `.seg` radio groups (index.html lines 184-193) and the tip of the Hidden
// option (line 187)
function Seg<V extends string>(props: SegProps<V>) {
  const { name, value, options, tip, onPick } = props;
  return (
    <div class="seg" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onPick(option.value)}
          {...(option.tip === undefined
            ? {}
            : tip.anchor(option.value, option.tip))}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type BarProps = {
  lang: Lang;
  vocab: Vocab;
  rows: readonly Row[];
  filters: Filters;
  onFilters: (change: Partial<Filters>) => void;
  text: string;
  onText: (value: string) => void;
  keys: readonly string[];
  choice: Choice;
  onColumn: (column: Column, on: boolean) => void;
  count: string;
  hidden: number;
  layout: Layout;
  onExpand: () => void;
  onClose: () => void;
};

const scopeOptions = (ui: Lang, hidden: number): Option<Scope>[] => [
  { value: "all", label: t(ui, "wb.scopeAll") },
  { value: "canvas", label: t(ui, "wb.scopeCanvas") },
  {
    value: "hidden",
    label: (
      <>
        {t(ui, "wb.scopeHidden")}
        {hidden > 0 && <span class="seg-n">{formatted(ui, hidden)}</span>}
      </>
    ),
    tip: t(ui, "wb.scopeHiddenTip"),
  },
];

function FilterControls(props: BarProps) {
  const { lang: ui, filters, onFilters } = props;
  const { kindItems, familyItems } = useMenuItems(props.rows, props.vocab, ui);
  const tip = useTip();
  const types: Option<RowType>[] = [
    { value: "both", label: t(ui, "wb.both") },
    { value: "nodes", label: t(ui, "wb.nodes") },
    { value: "edges", label: t(ui, "wb.edges") },
  ];
  return (
    <>
      <Seg
        name={t(ui, "wb.scope")}
        value={filters.scope}
        options={scopeOptions(ui, props.hidden)}
        tip={tip}
        onPick={(scope) => onFilters({ scope })}
      />
      <Seg
        name={t(ui, "wb.rowType")}
        value={filters.rowType}
        options={types}
        tip={tip}
        onPick={(rowType) => onFilters({ rowType })}
      />
      <CheckMenu
        lang={ui}
        name="wb.kind"
        items={kindItems}
        picked={filters.kinds}
        onPick={(kinds) => onFilters({ kinds })}
      />
      <CheckMenu
        lang={ui}
        name="wb.family"
        items={familyItems}
        picked={filters.families}
        onPick={(families) => onFilters({ families })}
      />
      <ColumnMenu
        lang={ui}
        keys={props.keys}
        choice={props.choice}
        onToggle={props.onColumn}
      />
      {tip.node}
    </>
  );
}

// why: rules 4, 9, 12 (mockup index.html lines 173-208) — the filters, the "Columns" menu, the
// count, the search box, "Expand table" or "Restore split view", and "Close table"
export function WorkbenchBar(props: BarProps) {
  const { lang: ui, layout } = props;
  const id = useId();
  const full = layout === "table-full";
  return (
    <div class="wb-bar">
      <FilterControls {...props} />
      <span class="spacer" />
      <span class="wb-count" aria-live="polite">
        {props.count}
      </span>
      <label for={id} class="sr-only">
        {t(ui, "wb.searchRows")}
      </label>
      <input
        {...{ id, type: "search", autocomplete: "off" }}
        class="wb-search"
        placeholder={t(ui, "wb.searchHint")}
        value={props.text}
        onInput={(event) => props.onText(event.currentTarget.value)}
      />
      <button
        type="button"
        class="icon-btn"
        aria-label={t(ui, full ? "wb.restore" : "wb.expand")}
        onClick={props.onExpand}
      >
        <span class="ic">
          <UiIcon name={full ? "minimize" : "maximize"} />
        </span>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={t(ui, "wb.close")}
        onClick={props.onClose}
      >
        <span class="ic">
          <UiIcon name="x" />
        </span>
      </button>
    </div>
  );
}
