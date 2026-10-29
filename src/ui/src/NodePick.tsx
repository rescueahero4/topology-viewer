import { typeName } from "./names";
import { nodeHits } from "./pickItems";
import { optionOf, useCombo, type PickProps } from "./PickList";
import { editedModel } from "./state";
import { t } from "./strings/index";
import { TypeGlyph } from "./TypeGlyph";

// why: STORY-008-05 rules 4, 5, 7 — the Subject and Object search: the typed text finds nodes by
// name with `matchEntities`, the first 50 in the canvas search list (`ul.menu.search-results`,
// `.glyph`, `.name`, `.meta`); no free text, so Enter with no active item saves nothing. The input
// starts with the label of the old end, and the id goes to the save only from an item
export function NodePick(props: PickProps) {
  const { ui, reader, onPick } = props;
  const model = editedModel.value;
  const combo = useCombo(model?.vocab.entities.get(String(props.value))?.label);
  const query = combo.query ?? "";
  const hits = model === null ? [] : nodeHits(model.graph, query);
  const active = combo.active < hits.length ? combo.active : -1;
  reader.current = () => (active >= 0 ? { after: hits[active] } : null);
  return (
    <>
      <input {...combo.attributes(props, hits.length)} />
      {query.trim() !== "" && model !== null && (
        <ul
          id={combo.list}
          class="menu search-results"
          role="listbox"
          aria-label={t(ui, "edit.nodes")}
        >
          {hits.length === 0 && <li class="none">{t(ui, "edit.noMatch")}</li>}
          {hits.map((id, i) => {
            const entity = model.vocab.entities.get(id);
            const type = entity?.type ?? null;
            const visual =
              type === null
                ? null
                : (model.vocab.types.get(type)?.visual ?? null);
            return (
              <li
                key={id}
                {...optionOf(combo.list, i, active, () =>
                  onPick({ after: id }),
                )}
              >
                <span class="glyph">
                  <TypeGlyph
                    visual={visual}
                    size={16}
                    untyped={model.vocab.untyped}
                  />
                </span>
                <span class="name">{entity?.label ?? id}</span>
                <span class="meta">
                  {typeName(ui, type, model.vocab.types)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
