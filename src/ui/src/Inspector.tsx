import { computed } from "@preact/signals";
import { entityDrawnId } from "@qdic-topology/engine";
import { useLayoutEffect, useRef } from "preact/hooks";
import type { ShellHost } from "./host";
import { InspectorHeader } from "./InspectorHeader";
import { Metadata } from "./Metadata";
import { lang, model, selection } from "./state";
import { t } from "./strings/index";
import { useTip } from "./Tooltip";

// why: the engine drawn id of an entity is `entityDrawnId(<entity id>)`; a group id has no entity
const ENTITY = entityDrawnId("");

// why: rule 1 — the card shows the selected entity node, and the anchor node of a selected edge;
// a group node is not an entity (STORY-004-05 rule 9 adds its card). The id is read from the
// selection, so the card does not wait for the `settle` of a `focus` that draws the node
export const inspected = computed<string | null>(() => {
  const picked = selection.value;
  if (picked === null) return null;
  const id = "edge" in picked ? picked.anchor : picked.node;
  const entity = id.startsWith(ENTITY) ? id.slice(ENTITY.length) : null;
  return entity !== null && model.value?.vocab.entities.has(entity) === true
    ? entity
    : null;
});

type Props = { host: ShellHost; open: boolean; onToggle: () => void };

// why: FR-INSPECT-1, FR-CANVAS-13, rule 1 (mockup app.js lines 705-745) — empty, expanded, or
// collapsed to its header; the user's choice stays across selections. The one tip of the card
// sits outside it, because the blurred card is the containing block of a fixed element
export function Inspector({ host, open, onToggle }: Props) {
  const tip = useTip();
  const card = useRef<HTMLElement>(null);
  const now = model.value;
  const id = inspected.value;
  const entity = id === null ? undefined : now?.vocab.entities.get(id);
  const shown = now !== null && entity !== undefined;
  // why: mockup `--insp-peek` (app.js lines 712, 742) — collapsed, the card shows exactly its
  // header; the empty card has the default peek
  useLayoutEffect(() => {
    const el = card.current;
    const head = el?.firstElementChild;
    if (shown && head instanceof HTMLElement)
      el?.style.setProperty("--insp-peek", `${head.offsetHeight + 2}px`);
    else el?.style.removeProperty("--insp-peek");
  });
  if (!shown)
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
  return (
    <>
      <aside
        ref={card}
        class="inspector float-card"
        data-state={open ? "expanded" : "collapsed"}
        aria-live="polite"
      >
        <InspectorHeader
          tip={tip}
          vocab={now.vocab}
          canvas={now.canvas}
          entity={entity}
          open={open}
          onToggle={onToggle}
        />
        {open && (
          <div class="insp-body">
            <Metadata
              key={entity.id}
              ctx={{ tip, host }}
              model={now}
              entity={entity}
            />
          </div>
        )}
      </aside>
      {tip.node}
    </>
  );
}
