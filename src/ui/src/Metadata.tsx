import type { ResolvedEntity } from "@qdic-topology/engine";
import { Fragment, type VNode } from "preact";
import { useState } from "preact/hooks";
import { AiMark } from "./AiMark";
import type { CanvasModel } from "./canvas/index";
import { RowFact, SlotFact, TypeFact, WriteFact, type FactCtx } from "./Fact";
import { firstRecord, genericRows, otherRows } from "./factRows";
import { valueText } from "./formatValue";
import { slotName } from "./names";
import { lang } from "./state";
import { t } from "./strings/index";

type Props = { ctx: FactCtx; model: CanvasModel; entity: ResolvedEntity };
type Cap = { open: boolean; toggle: () => void } | null;

// why: FR-INSPECT-4, mockup `FACT_CAP` (app.js line 563) — a capped list shows 6 rows
const FACT_CAP = 6;

function FactList({ facts, cap }: { facts: VNode[]; cap: Cap }) {
  const ui = lang.value;
  const more = cap === null ? 0 : facts.length - FACT_CAP;
  const shown =
    more > 0 && cap?.open !== true ? facts.slice(0, FACT_CAP) : facts;
  return (
    <>
      <dl>{shown}</dl>
      {more > 0 && (
        <button
          type="button"
          class="facts-more"
          aria-expanded={cap?.open === true}
          onClick={cap?.toggle}
        >
          {cap?.open === true
            ? t(ui, "inspector.less")
            : t(ui, "inspector.more", { count: more })}
        </button>
      )}
    </>
  );
}

const keyed = (key: string, node: VNode) => (
  <Fragment key={key}>{node}</Fragment>
);

// why: rules 4 and 5 — the Type row, then the "Write access" row only when the input says it
function headFacts({ ctx, model, entity }: Props): VNode[] {
  const type = keyed(
    "type",
    <TypeFact ctx={ctx} vocab={model.vocab} entity={entity} />,
  );
  if (entity.writable === undefined) return [type];
  return [type, keyed("write", <WriteFact writable={entity.writable} />)];
}

// why: rule 4 — catalog mode: the 13 slots in profile order, never capped, then "Other attributes"
function Catalog({ props, cap }: { props: Props; cap: Cap }) {
  const ui = lang.value;
  const { ctx, model, entity } = props;
  const slots = entity.slots.map((slot) =>
    keyed(
      slot.slot,
      <SlotFact
        ctx={ctx}
        slot={slot.slot}
        name={slotName(ui, slot.slot)}
        entries={slot.entries}
      />,
    ),
  );
  const other = otherRows(ui, model, entity.id).map((row, i) =>
    keyed(String(i), <RowFact ctx={ctx} row={row} />),
  );
  return (
    <>
      <FactList facts={[...headFacts(props), ...slots]} cap={null} />
      {other.length > 0 && (
        <>
          <h4 class="facts-sub">{t(ui, "inspector.other")}</h4>
          <FactList facts={other} cap={cap} />
        </>
      )}
    </>
  );
}

// why: rule 5 — generic mode: the Type row, the key/value rows (capped together), then the
// description text with its AI mark (mockup app.js lines 752, 779)
function Generic({ props, cap }: { props: Props; cap: Cap }) {
  const ui = lang.value;
  const { ctx, model, entity } = props;
  const rows = genericRows(ui, model, entity.id).map((row, i) =>
    keyed(String(i), <RowFact ctx={ctx} row={row} />),
  );
  const record = firstRecord(model, entity.id);
  const description = record?.attrs.description;
  const reason =
    record !== undefined && Object.hasOwn(record.inferred, "description")
      ? record.inferred.description
      : undefined;
  return (
    <>
      <FactList facts={[...headFacts(props), ...rows]} cap={cap} />
      {description !== undefined &&
        description !== null &&
        description !== "" && (
          <p class="blurb">
            {reason !== undefined && (
              <AiMark tip={ctx.tip} mark={{ kind: "inferred", reason }} />
            )}
            {valueText(ui, description)}
          </p>
        )}
    </>
  );
}

// why: FR-INSPECT-4; the parent keys this component by the entity, so "Show N more" closes on a new
// selection (mockup `factsOpen`, app.js line 529)
export function Metadata(props: Props) {
  const ui = lang.value;
  const [open, setOpen] = useState(false);
  const cap = { open, toggle: () => setOpen((now) => !now) };
  const { entity } = props;
  return (
    <div class="facts" data-state={entity.isCatalog ? "catalog" : "generic"}>
      {entity.isCatalog ? (
        <Catalog props={props} cap={cap} />
      ) : (
        <Generic props={props} cap={cap} />
      )}
      {entity.lost && <span class="lost">{t(ui, "inspector.lost")}</span>}
    </div>
  );
}
