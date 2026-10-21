import type { DrawnId, Selection } from "@qdic-topology/engine";
import { useId, useLayoutEffect, useRef } from "preact/hooks";
import type { Actions } from "./actions";
import type { CanvasModel } from "./canvas/index";
import { predicateColour } from "./familyLook";
import { provenanceName } from "./names";
import {
  endName,
  isGroup,
  predicateLines,
  type Nodes,
  type Relation,
} from "./relations";
import { rendererText } from "./rendererText";
import { lang } from "./state";
import { t, tAround } from "./strings/index";
import type { Tip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

export type RelCtx = {
  tip: Tip;
  actions: Actions;
  model: CanvasModel;
  nodes: Nodes;
  me: DrawnId;
  selection: Selection;
};

function End({ ctx, id }: { ctx: RelCtx; id: DrawnId }) {
  const name = endName(lang.value, ctx.model.vocab, ctx.nodes.get(id));
  return <span class={id === ctx.me ? "me" : undefined}>{name}</span>;
}

// why: rule 6 (mockup app.js line 815) — the arrow goes to the other end: `focus` an entity, or
// `expand` a group node. The name is a text node, never an attribute (SA §11)
function GoTo({ ctx, row }: { ctx: RelCtx; row: Relation }) {
  const id = useId();
  const ui = lang.value;
  const other = ctx.nodes.get(row.other);
  const press = (event: MouseEvent) => {
    event.stopPropagation();
    if (other === undefined) return;
    if (isGroup(other)) ctx.actions.expand(other.id);
    else ctx.actions.focus(other.entity);
  };
  // why: the model name is its own text node in the name, in the word order of each language
  const [before, after] = tAround(ui, "relations.goTo", "name");
  return (
    <>
      <button
        type="button"
        class="goto icon-btn"
        aria-labelledby={id}
        onClick={press}
      >
        <span class="ic">
          <UiIcon name="arrow-right" />
        </span>
      </button>
      <span id={id} hidden>
        {before}
        {endName(ui, ctx.model.vocab, other)}
        {after}
      </span>
    </>
  );
}

// why: FR-INSPECT-1, FR-CANVAS-10, rules 5 and 6 (mockup app.js lines 761-772) — the row picks its
// edge as the canvas does; the picked row scrolls into view; the predicate tip is made on open
export function TripleRow({ ctx, row }: { ctx: RelCtx; row: Relation }) {
  const ui = lang.value;
  const ref = useRef<HTMLDivElement>(null);
  const { edge } = row;
  const { selection } = ctx;
  const picked =
    selection !== null && "edge" in selection && selection.edge === edge.key;
  useLayoutEffect(() => {
    if (picked) ref.current?.scrollIntoView({ block: "nearest" });
  }, [picked, selection]);
  const select = () => ctx.actions.select(edge.key);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if ((event.target as Element).closest("button") !== null) return;
    event.preventDefault();
    select();
  };
  const predicate = ctx.model.vocab.predicates.get(edge.predicate);
  const name = edge.retired
    ? rendererText(ui).pillRetired(edge.predicate)
    : edge.predicate;
  const lines = () => predicateLines(ui, ctx.model, ctx.nodes, edge);
  const cls = ["triple", edge.muted && "muted", picked && "is-picked"];
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      class={cls.filter(Boolean).join(" ")}
      aria-pressed={picked}
      style={predicateColour(edge.predicate)}
      onClick={select}
      onKeyDown={onKeyDown}
    >
      <span class="d" />
      <span class="s">
        <End ctx={ctx} id={edge.subject} />
      </span>
      <span class="p" tabIndex={0} {...ctx.tip.anchor(edge.key, lines)}>
        {name}
      </span>
      <span class="o">
        <End ctx={ctx} id={edge.object} />
      </span>
      {predicate !== undefined && (
        <span class="prov mono">
          {t(ui, "relations.prov", {
            prov: provenanceName(ui, predicate.provenance),
          })}
        </span>
      )}
      <GoTo ctx={ctx} row={row} />
    </div>
  );
}
