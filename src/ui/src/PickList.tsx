import type { EditCode, Lang } from "@qdic-topology/engine";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { startText, type Read } from "./cellEdit";
import { predicateColour } from "./familyLook";
import { useElementId } from "./ids";
import { provTag } from "./names";
import { filtered, kindItems, kindText, predicateItems } from "./pickItems";
import { editedModel, shownInput } from "./state";
import { t } from "./strings/index";
import { TypeGlyph } from "./TypeGlyph";

export type PickProps = {
  ui: Lang;
  value: unknown;
  ids: { name: string; message: string };
  code: EditCode | null;
  reader: { current: (() => Read | null) | null };
  onPick: (read: Read) => void;
  onInput: () => void;
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

// why: STORY-008-05 rules 2, 3, 7, 8 — the Kind and the Predicate list (`.pick-menu`, `.pick-item`,
// `TypeGlyph`, `.prov`, `.pdot`) with free text: Enter saves the active item, else the typed text
// (trimmed; an empty text gives `empty` through `checkEdit`). Every label is a text node
export function PickList(props: PickProps & { kind: "kind" | "predicate" }) {
  const { ui, kind, reader, onPick } = props;
  const model = editedModel.value;
  const input = shownInput.value;
  const all =
    model === null || input === null || !input.ok
      ? []
      : kind === "kind"
        ? kindItems(input.profile, model.graph)
        : predicateItems(input.profile, model.graph);
  const shown = (item: string) =>
    kind === "kind" && model !== null ? kindText(ui, model.vocab)(item) : item;
  const combo = useCombo(props.value);
  const items = filtered(all, combo.query ?? "", shown);
  const active = combo.active < items.length ? combo.active : -1;
  reader.current = () =>
    active >= 0
      ? { after: items[active] }
      : { after: (combo.field.current?.value ?? "").trim() };
  const name = kind === "kind" ? "edit.kinds" : "edit.predicates";
  return (
    <>
      <input {...combo.attributes(props, items.length)} />
      <div class="menu pick-menu">
        <div
          id={combo.list}
          class="pick-list"
          role="listbox"
          aria-label={t(ui, name)}
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
              {kind === "kind" ? (
                <KindItem ui={ui} item={item} />
              ) : (
                <>
                  <span class="pdot" aria-hidden="true" />
                  <span class="nm">{item}</span>
                </>
              )}
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

function KindItem({ ui, item }: { ui: Lang; item: string }) {
  const vocab = editedModel.value?.vocab;
  const type = vocab?.types.get(item);
  return (
    <>
      <TypeGlyph visual={type?.visual ?? null} size={16} untyped={null} />
      <span class="nm">
        {vocab === undefined ? item : kindText(ui, vocab)(item)}
      </span>
      {type?.provenance === "custom" && (
        <span class="prov mono">{provTag(ui, type.provenance)}</span>
      )}
    </>
  );
}
