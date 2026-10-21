import { computed } from "@preact/signals";
import {
  entityOfDrawnId,
  type DrawnId,
  type GroupNode,
  type ResolvedEntity,
  type Vocab,
} from "@qdic-topology/engine";
import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import type { Actions } from "./actions";
import { Fact } from "./Fact";
import type { ShellHost } from "./host";
import { InspectorActions } from "./InspectorActions";
import { entityHead, groupHead, InspectorHeader } from "./InspectorHeader";
import { InspectorNotes } from "./InspectorNotes";
import { Metadata } from "./Metadata";
import { typeName } from "./names";
import { Relationships } from "./Relationships";
import {
  countsOf,
  isGroup,
  relationsOf,
  type Nodes,
  type Relation,
} from "./relations";
import { frontier, lang, model, selection } from "./state";
import { t } from "./strings/index";
import { useTip } from "./Tooltip";
import type { RelCtx } from "./TripleRow";

type Inspected =
  | { drawn: DrawnId; entity: ResolvedEntity; group?: undefined }
  | { drawn: DrawnId; group: GroupNode; entity?: undefined };

export const drawnNodes = computed<Nodes>(
  () => new Map((frontier.value?.nodes ?? []).map((node) => [node.id, node])),
);

// why: STORY-004-04 rule 1 — the card shows the selected node, and the anchor node of a selected
// edge. An entity is read from the selection id, so the card does not wait for the `settle` of a
// `focus` that draws it; a group node (STORY-004-05 rule 9) is read from the frontier
export const inspected = computed<Inspected | null>(() => {
  const picked = selection.value;
  const now = model.value;
  if (picked === null || now === null) return null;
  const drawn = "edge" in picked ? picked.anchor : picked.node;
  const id = entityOfDrawnId(drawn);
  if (id !== null) {
    const entity = now.vocab.entities.get(id);
    return entity === undefined ? null : { drawn, entity };
  }
  const node = drawnNodes.value.get(drawn);
  return node !== undefined && isGroup(node) ? { drawn, group: node } : null;
});

// why: STORY-004-05 rule 9 (mockup app.js lines 750-752; a group node has `attrs: {}`,
// lib/topology.js line 574) — one Type row with the member type, and no other metadata
function GroupFacts({ vocab, group }: { vocab: Vocab; group: GroupNode }) {
  const ui = lang.value;
  return (
    <div class="facts" data-state="generic">
      <dl>
        <Fact name={t(ui, "inspector.type")}>
          {typeName(ui, group.type, vocab.types)}
        </Fact>
      </dl>
    </div>
  );
}

function EmptyCard({ card }: { card: RefObject<HTMLElement> }) {
  return (
    <aside
      ref={card}
      class="inspector float-card"
      data-state="empty"
      aria-live="polite"
    >
      <div class="insp-head">
        <span class="insp-empty">{t(lang.value, "inspector.empty")}</span>
      </div>
    </aside>
  );
}

type Props = {
  host: ShellHost;
  actions: Actions;
  open: boolean;
  onToggle: () => void;
};

// why: FR-INSPECT-1, FR-CANVAS-13, STORY-004-04 rule 1 (mockup app.js lines 705-790) — empty,
// expanded, or collapsed to its header; the user's choice stays across selections. The one tip of
// the card sits outside it, because the blurred card is the containing block of a fixed element
export function Inspector({ host, actions, open, onToggle }: Props) {
  const tip = useTip();
  const card = useRef<HTMLElement>(null);
  const now = model.value;
  const shown = inspected.value;
  // why: mockup `--insp-peek` (app.js lines 712, 742) — collapsed, the card shows exactly its
  // header; the empty card has the default peek
  useLayoutEffect(() => {
    const el = card.current;
    const head = el?.firstElementChild;
    if (shown !== null && head instanceof HTMLElement)
      el?.style.setProperty("--insp-peek", `${head.offsetHeight + 2}px`);
    else el?.style.removeProperty("--insp-peek");
  });
  if (now === null || shown === null) return <EmptyCard card={card} />;
  const ui = lang.value;
  const drawn = frontier.value;
  const rows = drawn === null ? [] : relationsOf(drawn, shown.drawn);
  const ctx: RelCtx = {
    ...{ tip, actions, model: now, nodes: drawnNodes.value },
    ...{ me: shown.drawn, selection: selection.value },
  };
  const head =
    shown.entity === undefined
      ? groupHead(ui, now.vocab, shown.group)
      : entityHead(now.vocab, shown.entity);
  return (
    <>
      <aside
        ref={card}
        class="inspector float-card"
        data-state={open ? "expanded" : "collapsed"}
        aria-live="polite"
      >
        <InspectorHeader
          {...{ tip, vocab: now.vocab, head, counts: countsOf(rows) }}
          {...{ canvas: now.canvas, open, onToggle }}
        >
          <InspectorActions
            {...{ tip, actions, me: shown.drawn }}
            group={shown.group !== undefined}
          />
        </InspectorHeader>
        {open && <CardBody ctx={ctx} host={host} shown={shown} rows={rows} />}
      </aside>
      {tip.node}
    </>
  );
}

function CardBody(props: {
  ctx: RelCtx;
  host: ShellHost;
  shown: Inspected;
  rows: Relation[];
}) {
  const { ctx, host, shown, rows } = props;
  const { tip, actions, model: now } = ctx;
  return (
    <div class="insp-body">
      {shown.entity === undefined ? (
        <GroupFacts vocab={now.vocab} group={shown.group} />
      ) : (
        <Metadata
          key={shown.entity.id}
          ctx={{ tip, host }}
          model={now}
          entity={shown.entity}
        />
      )}
      <InspectorNotes
        actions={actions}
        vocab={now.vocab}
        node={ctx.nodes.get(shown.drawn)}
      />
      <Relationships ctx={ctx} rows={rows} />
    </div>
  );
}
