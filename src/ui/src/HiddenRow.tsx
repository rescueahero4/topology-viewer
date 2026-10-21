import type { DrawnId, Vocab } from "@qdic-topology/engine";
import { useId } from "preact/hooks";
import { CheckMark } from "./Checkbox";
import { lang } from "./state";
import { t, tAround } from "./strings/index";
import type { Tip } from "./Tooltip";
import { TypeGlyph } from "./TypeGlyph";
import { UiIcon } from "./UiIcon";

export type Row = {
  key: DrawnId;
  type: string | null;
  name: string;
  sub: string;
};

type Props = {
  row: Row;
  vocab: Vocab;
  tip: Tip;
  active: boolean;
  ticked: boolean;
  onPress: (shift: boolean) => void;
  onShow: () => void;
};

// why: rule 1 (mockup app.js lines 875-880) — the check box and the eye button are not in the tab
// order; the row is the one tab stop. The eye button takes its name from a text node, and the
// model name is its own text node in it (SA §11)
export function HiddenRow({
  row,
  vocab,
  tip,
  active,
  ticked,
  onPress,
  onShow,
}: Props) {
  const id = useId();
  const [before, after] = tAround(lang.value, "hidden.showOne", "name");
  const visual =
    row.type === null ? null : (vocab.types.get(row.type)?.visual ?? null);
  return (
    <li
      class="hid-row"
      role="option"
      tabIndex={active ? 0 : -1}
      aria-selected={ticked}
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
      onClick={(event) => onPress(event.shiftKey)}
      {...tip.anchor(row.key, t(lang.value, "rangeTip"))}
    >
      <CheckMark checked={ticked} partial={false} />
      <span class="glyph">
        <TypeGlyph visual={visual} size={18} untyped={vocab.untyped} />
      </span>
      <span class="txt">
        <span class="name">{row.name}</span>
        <span class="sub">{row.sub}</span>
      </span>
      <button
        type="button"
        class="icon-btn"
        tabIndex={-1}
        aria-labelledby={id}
        onClick={(event) => {
          event.stopPropagation();
          onShow();
        }}
      >
        <span class="ic">
          <UiIcon name="eye" />
        </span>
      </button>
      <span id={id} hidden>
        {before}
        {row.name}
        {after}
      </span>
    </li>
  );
}
