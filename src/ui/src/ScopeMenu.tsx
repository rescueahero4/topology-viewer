import type {
  Budget,
  CanvasState,
  Frontier,
  Lang,
} from "@qdic-topology/engine";
import type { Actions } from "./actions";
import type { CanvasModel } from "./canvas/index";
import { Menu, MenuItem } from "./Menu";
import { resetView } from "./resetCompare";
import { formatted, t, tAround, type Key } from "./strings/index";
import { UiIcon } from "./UiIcon";

type Props = {
  actions: Actions;
  lang: Lang;
  model: CanvasModel;
  state: CanvasState;
  drawn: Frontier;
};

type Option = { budget: Budget; note?: Key };

// why: FR-CANVAS-5 and the mockup scope menu (index.html lines 90-97)
const OPTIONS: readonly Option[] = [
  { budget: 10 },
  { budget: 20, note: "default" },
  { budget: 50 },
  { budget: "all", note: "scope.slow" },
];

function budgetText(lang: Lang, budget: Budget): string {
  return budget === "all"
    ? t(lang, "scope.everything")
    : t(lang, "scope.budget", { count: budget });
}

// why: mockup `renderScope` (app.js lines 422-436) — the reason line follows the scope mode; the
// root label is model text, so it is a text node in its own element
function Reason({ lang, model, state }: Omit<Props, "actions" | "drawn">) {
  const { mode, root } = state.scope;
  if (mode === "custom") return <>{t(lang, "scope.custom")}</>;
  if (mode !== "auto") return null;
  const [before, after] = tAround(lang, "scope.auto", "root");
  const label =
    root === null ? "" : (model.vocab.entities.get(root)?.label ?? "");
  return (
    <>
      {before}
      <strong>{label}</strong>
      {after}
    </>
  );
}

function Summary(props: Omit<Props, "actions">) {
  const { lang, model, drawn } = props;
  const total = model.graph.entities.length;
  if (props.state.scope.mode === "all") {
    const [before, after] = tAround(lang, "scope.summaryAll", "total", {
      total,
    });
    return (
      <p class="scope-summary">
        {before}
        <strong>{formatted(lang, total)}</strong>
        {after}
      </p>
    );
  }
  const values = { shown: drawn.nodes.length, total };
  const [before, after] = tAround(lang, "scope.summary", "shown", values);
  const [hintBefore, hintAfter] = tAround(lang, "scope.hint", "chip");
  return (
    <p class="scope-summary">
      {before}
      <strong>{formatted(lang, values.shown)}</strong>
      {after} <Reason {...props} />
      <span class="hint">
        {hintBefore}
        <span class="more-chip" aria-hidden="true">
          {t(lang, "scope.chip")}
        </span>
        {hintAfter}
      </span>
    </p>
  );
}

function ResetItem({ actions, lang, state }: Props) {
  const view = resetView.value;
  const note =
    state.scope.hint !== null
      ? t(lang, "scope.noteFirst")
      : view === null || view.budget === "all"
        ? t(lang, "scope.noteAll")
        : t(lang, "scope.budget", { count: view.budget });
  return (
    <MenuItem
      kind="action"
      disabled={view === null || !view.enabled}
      onSelect={() => actions.resetView()}
    >
      <span class="ic">
        <UiIcon name="reset" />
      </span>
      {t(lang, "scope.reset")}
      <small>{note}</small>
    </MenuItem>
  );
}

// why: FR-CANVAS-5, FR-CANVAS-13 — the scope button names the drawn count; a budget or a reset
// is one canvas call, and the engine re-selects under Active
export function ScopeMenu(props: Props) {
  const { actions, lang, model, state, drawn } = props;
  const all = state.scope.mode === "all";
  const values = {
    shown: drawn.nodes.length,
    total: model.graph.entities.length,
  };
  const label = (
    <>
      <span class="ic">
        <UiIcon name="scan" />
      </span>
      <span class="mono">
        {t(lang, all ? "scope.labelAll" : "scope.label", values)}
      </span>
      <span class="ic chev">
        <UiIcon name="chevron-up" />
      </span>
    </>
  );
  return (
    <Menu
      label={label}
      name={t(lang, all ? "scope.nameAll" : "scope.name", values)}
      buttonClass="ctl-btn"
      menuClass="scope-menu"
      closeOnPick
    >
      <Summary {...props} />
      <hr />
      <p class="menu-label">{t(lang, "scope.start")}</p>
      {OPTIONS.map(({ budget, note }) => (
        <MenuItem
          key={budget}
          kind="radio"
          checked={state.budget === budget}
          onSelect={() => actions.setBudget(budget)}
        >
          {budgetText(lang, budget)}
          {note !== undefined && <small>{t(lang, note)}</small>}
        </MenuItem>
      ))}
      <hr />
      <ResetItem {...props} />
    </Menu>
  );
}
