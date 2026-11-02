import type { EditCode, Lang } from "#engine";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { startText, type PickKind, type Read } from "./cellEdit";
import { familyClass, predicateColour } from "./familyLook";
import { useElementId } from "./ids";
import { familyName, provTag } from "./names";
import {
  CANVAS_ITEMS,
  familyItems,
  filtered,
  kindItems,
  kindText,
  predicateItems,
  typeLabelItems,
} from "./pickItems";
import { SHOWN } from "./SearchResults";
import { editedModel, shownInput } from "./state";
import { t, type Key } from "./strings/index";
import { TypeGlyph } from "./TypeGlyph";

export type PickProps = {
  ui: Lang;
  value: unknown;
  ids: { name: string; message: string };
  code: EditCode | null;
  reader: { current: (() => Read | null) | null };
  onPick: (read: Read) => void;
  onInput: () => void;
  values?: readonly string[];
};

// why: STORY-008-05 rules 5, 9 — the cell input is a combobox that keeps the focus; ArrowDown and
// ArrowUp move the active item (as the canvas search, `Search.tsx`); each option id is the list id
// with the item index, never a type name, a predicate or an entity id
export function useCombo(value: unknown) {
  const field = useRef<HTMLInputElement>(null);
  const list = useElementId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  useLayoutEffect(() => {
    const el = field.current;
    if (el === null) return;
    el.value = startText(value);
    el.focus();
    el.select();
  }, []);
  const attributes = (props: PickProps, count: number) => {
    const at = active < count ? active : -1;
    return {
      ref: field,
      class: "cell-input",
      role: "combobox" as const,
      "aria-labelledby": props.ids.name,
      "aria-autocomplete": "list" as const,
      "aria-expanded": count > 0,
      "aria-controls": list,
      "aria-activedescendant": at >= 0 ? `${list}-${at}` : undefined,
      "aria-invalid": props.code === null ? undefined : ("true" as const),
      "aria-describedby": props.code === null ? undefined : props.ids.message,
      onInput: (event: Event) => {
        setQuery((event.currentTarget as HTMLInputElement).value);
        setActive(-1);
        props.onInput();
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive(Math.max(0, Math.min(count - 1, at + step)));
      },
    };
  };
  return { field, list, query, active, attributes };
}

// why: STORY-008-05 rule 5 — a press on an item saves it; the press keeps the focus in the input
export const optionOf = (
  list: string,
  index: number,
  active: number,
  onPress: () => void,
) => ({
  id: `${list}-${index}`,
  role: "option" as const,
  "aria-selected": index === active,
  onMouseDown: (event: MouseEvent) => event.preventDefault(),
  onClick: onPress,
});

type Model = NonNullable<typeof editedModel.value>;
type Input = Extract<NonNullable<typeof shownInput.value>, { ok: true }>;

// why: SA §4.8 addendum 0.33 (4) — an edge row has no "Not on canvas"
function itemsOf(
  props: PickProps & { kind: PickKind },
  model: Model,
  input: Input,
) {
  const { graph, vocab } = model;
  const { kind } = props;
  if (kind === "kind") return kindItems(input.profile, graph);
  if (kind === "predicate") return predicateItems(input.profile, graph);
  if (kind === "family") return familyItems(input.profile, vocab);
  if (kind === "typeLabel") return typeLabelItems(graph);
  if (kind === "values") return [...(props.values ?? [])];
  return props.value === "edge" ? CANVAS_ITEMS.slice(0, 1) : CANVAS_ITEMS;
}

const CANVAS_TEXT: Readonly<Record<string, Key>> = {
  on: "edit.onCanvas",
  off: "edit.notOnCanvas",
};

function textOf(ui: Lang, kind: PickKind, model: Model | null) {
  return (item: string) => {
    if (kind === "kind" && model !== null)
      return kindText(ui, model.vocab)(item);
    if (kind === "family") return familyName(ui, item);
    if (kind === "canvas") return t(ui, CANVAS_TEXT[item]);
    if (kind === "typeLabel" && (item === "node" || item === "edge"))
      return t(ui, item === "node" ? "wb.node" : "wb.edge");
    return item;
  };
}

const LABELS: Readonly<Record<PickKind, Key>> = {
  kind: "edit.kinds",
  predicate: "edit.predicates",
  family: "wb.col.family",
  typeLabel: "wb.col.type",
  canvas: "wb.col.canvas",
  values: "edit.values",
};

// why: STORY-008-05 rules 2, 3, 7, 8 — the Kind and the Predicate list (`.pick-menu`, `.pick-item`,
// `TypeGlyph`, `.prov`, `.pdot`) with free text: Enter saves the active item, else the typed text
// (trimmed; an empty text gives `empty` through `checkEdit`). Every label is a text node.
// STORY-008-09 rules 10, 11, 13, 17 — the Type and Family lists take free text too; the Canvas
// list takes one of its two items only (a typed text saves when it is the text of an item)
export function PickList(props: PickProps & { kind: PickKind }) {
  const { ui, kind, reader, onPick } = props;
  const model = editedModel.value;
  const input = shownInput.value;
  const all =
    model === null || input === null || !input.ok
      ? []
      : itemsOf(props, model, input);
  const shown = textOf(ui, kind, model);
  const combo = useCombo(kind === "canvas" ? "" : props.value);
  const items = filtered(all, combo.query ?? "", shown).slice(0, SHOWN);
  const active = combo.active < items.length ? combo.active : -1;
  reader.current = () => {
    if (active >= 0) return { after: items[active] };
    const text = (combo.field.current?.value ?? "").trim();
    if (kind === "values" && text === "") return { after: undefined };
    if (kind !== "canvas") return { after: text };
    const item = all.find((one) => shown(one) === text || one === text);
    return item === undefined ? null : { after: item };
  };
  return (
    <>
      <input {...combo.attributes(props, items.length)} />
      <div class="menu pick-menu">
        <div
          id={combo.list}
          class="pick-list"
          role="listbox"
          aria-label={t(ui, LABELS[kind])}
        >
          {items.map((item, i) => (
            <div
              key={item}
              class="menu-item pick-item"
              style={kind === "predicate" ? predicateColour(item) : undefined}
              {...optionOf(combo.list, i, active, () =>
                onPick({ after: item }),
              )}
            >
              <ItemBody ui={ui} kind={kind} item={item} text={shown(item)} />
            </div>
          ))}
        </div>
        {items.length === 0 && (
          <p class="pick-empty">{t(ui, "edit.noMatch")}</p>
        )}
      </div>
    </>
  );
}

type Body = { ui: Lang; kind: PickKind; item: string; text: string };

function ItemBody({ ui, kind, item, text }: Body) {
  if (kind === "kind") return <KindItem ui={ui} item={item} />;
  if (kind === "predicate")
    return (
      <>
        <span class="pdot" aria-hidden="true" />
        <span class="nm">{item}</span>
      </>
    );
  if (kind === "family")
    return <span class={`fam ${familyClass(item)}`}>{text}</span>;
  return <span class="nm">{text}</span>;
}

function KindItem({ ui, item }: { ui: Lang; item: string }) {
  const vocab = editedModel.value?.vocab;
  const type = vocab?.types.get(item);
  // why: a profile type that the data does not use takes its preview mark (`Vocab.previews`)
  const visual = type?.visual ?? vocab?.previews.get(item) ?? null;
  return (
    <>
      <TypeGlyph visual={visual} size={16} untyped={null} />
      <span class="nm">
        {vocab === undefined ? item : kindText(ui, vocab)(item)}
      </span>
      {type?.provenance === "custom" && (
        <span class="prov mono">{provTag(ui, type.provenance)}</span>
      )}
    </>
  );
}
