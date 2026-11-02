import {
  aroundInfo,
  entityOfDrawnId,
  groupParts,
  type AroundInfo,
  type Lang,
  type Vocab,
} from "#engine";
import type { Actions } from "./actions";
import { drawnNodes } from "./Inspector";
import { groupText, isGroup } from "./relations";
import { editedModel, frontier, lang, settled } from "./state";
import { t, tAround } from "./strings/index";
import { useTip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

// why: rule 2 (Implementer item 3) — an entity root shows its label; a group root (no label) shows
// the canvas group text of the `groupParts` type and the member count of its group node.
// STORY-008-02 rule 3 — the label of an entity root comes from the edited model
function rootName(ui: Lang, vocab: Vocab, info: AroundInfo): string {
  const entity = vocab.entities.get(entityOfDrawnId(info.id) ?? "");
  if (info.label !== null) return entity?.label ?? info.label;
  const node = drawnNodes.value.get(info.id);
  const count = node !== undefined && isGroup(node) ? node.count : 0;
  return groupText(ui, vocab, groupParts(info.id)?.type ?? null, count);
}

// why: FR-CANVAS-14, NF-5, P19, P20, rule 2 (mockup app.js lines 532-545, styles.css lines
// 321-332) — the pill shows exactly while `aroundInfo` is not null and says "faded", never
// "hidden"; its name comes from its text nodes; one press ends the grouping. SA §6 row 10
// (STORY-005-07; ISSUE-021) — the state and the frontier of the last `settle`: a `select` or an
// `explore` event of an exit carries the end state before the glide home is drawn
export function FocusPill({ actions }: { actions: Actions }) {
  const tip = useTip();
  const state = settled.value?.state ?? null;
  const drawn = frontier.value;
  const now = editedModel.value;
  const info =
    state === null || drawn === null ? null : aroundInfo(state, drawn);
  if (info === null || now === null) return null;
  const ui = lang.value;
  const name = rootName(ui, now.vocab, info);
  const count = info.total - info.shown;
  const [before, after] = tAround(ui, "pill.focused", "name");
  return (
    <>
      <button
        type="button"
        class="focus-pill float-card"
        aria-live="polite"
        onClick={() => actions.groupAroundRoot(false)}
        {...tip.anchor("pill", t(ui, "pill.tip", { name, count }))}
      >
        <span class="ic">
          <UiIcon name="group-root" />
        </span>
        <span class="fp-txt">
          {before}
          <span class="fp-name">{name}</span>
          {after}
          <span class="fp-n">{t(ui, "pill.faded", { count })}</span>
        </span>
        <span class="sr-only">{t(ui, "nameSep")}</span>
        <span class="fp-act">
          <span class="ic">
            <UiIcon name="x" />
          </span>
          {t(ui, "pill.showAll")}
        </span>
      </button>
      {tip.node}
    </>
  );
}
