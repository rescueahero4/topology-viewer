import type {
  GroupNode,
  Lang,
  ResolvedEntity,
  Visual,
  Vocab,
} from "@qdic-topology/engine";
import type { ComponentChildren } from "preact";
import { namesakeLine } from "./namesake";
import { endName } from "./relations";
import { lang } from "./state";
import { t } from "./strings/index";
import type { Tip } from "./Tooltip";
import { TypeGlyph } from "./TypeGlyph";
import { UiIcon } from "./UiIcon";

export type Head = {
  type: string | null;
  name: string;
  service: string;
  namesake: string | null;
};
type Counts = { rows: number; ends: number };

type Props = {
  tip: Tip;
  vocab: Vocab;
  head: Head;
  counts: Counts;
  open: boolean;
  onToggle: () => void;
  children: ComponentChildren;
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
// why: EPIC-003 TL-9 — the badge reads only this slot entry, as the canvas subtitle does
const SERVICE_SLOT = "data_source";
const SERVICE_FROM = "attribute service_name";

// why: rule 2, reading (d1) — one fixed property `--c`, only from the guarded colour of the type
// visual and only as a six-digit hex colour. A profile icon has no colour in the engine visual
// (B4: the shell takes only `typeMark` from the renderer), so its pill keeps the token colour
function pillColour(visual: Visual | null) {
  if (visual === null || "icon" in visual || !HEX.test(visual.color))
    return undefined;
  return { "--c": visual.color };
}

// why: TL-9 — the first `service_name` entry, its first UTF-16 unit in upper case
function serviceOf(entity: ResolvedEntity): string {
  const slot = entity.slots.find((s) => s.slot === SERVICE_SLOT);
  const entry = slot?.entries.find((e) => e.from === SERVICE_FROM);
  const service = entry === undefined ? "" : String(entry.value);
  return `${service.charAt(0).toUpperCase()}${service.slice(1)}`;
}

export function entityHead(vocab: Vocab, entity: ResolvedEntity): Head {
  return {
    type: entity.type,
    name: entity.label,
    service: serviceOf(entity),
    namesake: namesakeLine(vocab, entity.id),
  };
}

// why: STORY-004-05 rule 9 (mockup app.js lines 750-752) — a group node shows the mark of its
// member type and the canvas group text as its name
export function groupHead(ui: Lang, vocab: Vocab, group: GroupNode): Head {
  const name = endName(ui, vocab, group);
  return { type: group.type, name, service: "", namesake: null };
}

// why: STORY-004-05 rule 2 (mockup app.js lines 721, 728) — "<rows>e <n>n", the full text in the tip
function CountText({ tip, counts }: { tip: Tip; counts: Counts }) {
  const ui = lang.value;
  const full = t(ui, "relations.countTip", {
    rows: t(ui, "relations.countRows", { count: counts.rows }),
    ends: t(ui, "relations.countEnds", { count: counts.ends }),
  });
  return (
    <span class="hops mono" tabIndex={0} {...tip.anchor("counts", full)}>
      {t(ui, "relations.counts", counts)}
    </span>
  );
}

// why: FR-INSPECT-1, rules 2 and 3 (mockup app.js lines 722-739) — row 1 has the ROOT pill, the
// counts, the actions of the open card and the collapse toggle; row 2 has the type mark, the name
// (two lines, the full name in the tip) and the service badge; a namesake gets one more line with
// its container path (FR-CANVAS-19)
export function InspectorHeader(props: Props) {
  const { tip, vocab, head, counts, open, onToggle, children } = props;
  const ui = lang.value;
  const type = head.type === null ? undefined : vocab.types.get(head.type);
  const visual = type?.visual ?? null;
  return (
    <div class="insp-head is-node">
      <div class="insp-bar">
        <span class="root-pill" style={pillColour(visual ?? vocab.untyped)}>
          {t(ui, "inspector.root")}
        </span>
        <CountText tip={tip} counts={counts} />
        <span class="spacer" />
        {open && children}
        <button
          type="button"
          class="icon-btn"
          aria-label={t(ui, open ? "inspector.collapse" : "inspector.expand")}
          aria-expanded={open}
          onClick={onToggle}
        >
          <span class="ic">
            <UiIcon name={open ? "chevrons-down" : "chevrons-up"} />
          </span>
        </button>
      </div>
      <div class="insp-title">
        <span class="glyph">
          <TypeGlyph visual={visual} size={16} untyped={vocab.untyped} />
        </span>
        <strong tabIndex={0} {...tip.anchor("label", head.name)}>
          {head.name}
        </strong>
        {head.service !== "" && <span class="sys-badge">{head.service}</span>}
      </div>
      {head.namesake !== null && (
        <span
          class="sub"
          tabIndex={0}
          {...tip.anchor("namesake", head.namesake)}
        >
          {head.namesake}
        </span>
      )}
    </div>
  );
}
