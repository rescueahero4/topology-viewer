import type { ResolvedEntity, Visual, Vocab } from "@qdic-topology/engine";
import { namesakeLine } from "./namesake";
import { lang } from "./state";
import { t } from "./strings/index";
import type { Tip } from "./Tooltip";
import { TypeGlyph } from "./TypeGlyph";
import { UiIcon } from "./UiIcon";

type Props = {
  tip: Tip;
  vocab: Vocab;
  entity: ResolvedEntity;
  open: boolean;
  onToggle: () => void;
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

// why: FR-INSPECT-1, rules 2 and 3 (mockup app.js lines 722-739) — row 1 has the ROOT pill and
// the collapse toggle; row 2 has the type mark, the label (two lines, the full label in the tip)
// and the service badge; a namesake gets one more line with its container path (FR-CANVAS-19)
export function InspectorHeader({ tip, vocab, entity, open, onToggle }: Props) {
  const ui = lang.value;
  const type = entity.type === null ? undefined : vocab.types.get(entity.type);
  const visual = type?.visual ?? null;
  const service = serviceOf(entity);
  const namesake = namesakeLine(vocab, entity.id);
  return (
    <div class="insp-head is-node">
      <div class="insp-bar">
        <span class="root-pill" style={pillColour(visual ?? vocab.untyped)}>
          {t(ui, "inspector.root")}
        </span>
        <span class="spacer" />
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
        <strong tabIndex={0} {...tip.anchor("label", entity.label)}>
          {entity.label}
        </strong>
        {service !== "" && <span class="sys-badge">{service}</span>}
      </div>
      {namesake !== null && (
        <span class="sub" tabIndex={0} {...tip.anchor("namesake", namesake)}>
          {namesake}
        </span>
      )}
    </div>
  );
}
