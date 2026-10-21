import type { Entry, ResolvedEntity, Vocab } from "@qdic-topology/engine";
import { Fragment, type ComponentChildren, type JSX } from "preact";
import { AiMark } from "./AiMark";
import type { FactRow } from "./factRows";
import { dateText, shownOf, valueText, type Shown } from "./formatValue";
import type { ShellHost } from "./host";
import { provTag, typeName } from "./names";
import { pathText } from "./namesake";
import { lang, locale } from "./state";
import { MISSING, t } from "./strings/index";
import type { Tip } from "./Tooltip";

export type FactCtx = { tip: Tip; host: ShellHost };

const LIST = ", ";

export function Fact(props: {
  name: ComponentChildren;
  wide?: boolean;
  empty?: boolean;
  children: ComponentChildren;
}) {
  const cls = [props.wide && "wide", props.empty && "empty"].filter(Boolean);
  return (
    <>
      <dt>{props.name}</dt>
      <dd class={cls.join(" ") || undefined}>
        {props.empty ? MISSING : props.children}
      </dd>
    </>
  );
}

// why: rule 7, SA §11 — the target shows as a text node and the button opens the same `url.href`
// only through the host port, once per press; the widget has no `href` (FR-HOST-10)
function Value({
  ctx,
  shown,
  ...rest
}: { ctx: FactCtx; shown: Shown } & JSX.HTMLAttributes<HTMLSpanElement>) {
  const ui = lang.value;
  const { link } = shown;
  return (
    <>
      <span class="val" {...rest}>
        {shown.text}
      </span>
      {link !== undefined && (
        <button
          type="button"
          class="link-btn"
          // why: a refused or failed host link has no UI in 0.1.0 (EPIC-006 owns the port)
          onClick={() => void ctx.host.openLink(link).catch(() => undefined)}
        >
          {t(ui, "inspector.openLink")}
        </button>
      )}
    </>
  );
}

function entryShown(slot: string, value: Entry["value"]): Shown {
  const ui = lang.value;
  if (slot === "path" && Array.isArray(value)) return { text: pathText(value) };
  if (slot === "updated")
    return { text: dateText(locale.value, ui, value) ?? valueText(ui, value) };
  if (slot === "tags") return { text: valueText(ui, value) };
  return shownOf(ui, value);
}

// why: rules 8 and 9 (R1) — each entry has "Read from <from>" in the tip of its value, its own AI
// marks, and "from the source system" when the slot read a `notYetIncluded` field
function EntryValue(props: {
  ctx: FactCtx;
  slot: string;
  entry: Entry;
  at: string;
}) {
  const { ctx, slot, entry, at } = props;
  const ui = lang.value;
  const tip = t(ui, "inspector.readFrom", { from: entry.from });
  const anchor = { tabIndex: 0, ...ctx.tip.anchor(at, tip) };
  const shown = entryShown(slot, entry.value);
  return (
    <>
      {slot === "tags" ? (
        <span class="tag-chip" {...anchor}>
          {shown.text}
        </span>
      ) : (
        <Value ctx={ctx} shown={shown} {...anchor} />
      )}
      {entry.inferred !== undefined && (
        <AiMark
          tip={ctx.tip}
          mark={{ kind: "inferred", reason: entry.inferred }}
        />
      )}
      {entry.mapped !== undefined && (
        <AiMark tip={ctx.tip} mark={{ kind: "mapped", reason: entry.mapped }} />
      )}
      {entry.external === true && (
        <span class="src">{t(ui, "inspector.external")}</span>
      )}
    </>
  );
}

export function SlotFact(props: {
  ctx: FactCtx;
  slot: string;
  name: string;
  entries: readonly Entry[];
}) {
  const { ctx, slot, name, entries } = props;
  const sep = slot === "tags" ? "" : LIST;
  return (
    <Fact
      name={name}
      empty={entries.length === 0}
      wide={slot === "description"}
    >
      {entries.map((entry, i) => (
        <Fragment key={i}>
          {i > 0 && sep}
          <EntryValue ctx={ctx} slot={slot} entry={entry} at={`${slot}:${i}`} />
        </Fragment>
      ))}
    </Fact>
  );
}

// why: FR-INSPECT-2, FR-QDIC-7 — the display name, "retired" as text, "built-in" in the tip of the
// name, and the vocabulary description of the type under the row. FR-VOC-3 (ISSUE-012 C7) — the
// provenance tag of the triple rows follows the name
export function TypeFact({
  ctx,
  vocab,
  entity,
}: {
  ctx: FactCtx;
  vocab: Vocab;
  entity: ResolvedEntity;
}) {
  const ui = lang.value;
  const type = entity.type === null ? undefined : vocab.types.get(entity.type);
  const name = typeName(ui, entity.type, vocab.types);
  return (
    <>
      <Fact name={t(ui, "inspector.type")}>
        {type?.builtIn === true ? (
          <span
            tabIndex={0}
            {...ctx.tip.anchor("type", t(ui, "inspector.builtIn"))}
          >
            {name}
          </span>
        ) : (
          name
        )}
        {type !== undefined && (
          <span class="prov mono">{provTag(ui, type.provenance)}</span>
        )}
        {type?.retired === true && (
          <span class="status">{t(ui, "inspector.retired")}</span>
        )}
      </Fact>
      {type?.description !== undefined && type.description !== "" && (
        <dd class="wide type-desc">{type.description}</dd>
      )}
    </>
  );
}

// why: FR-INSPECT-2, FR-QDIC-7, rule 4 (Product Owner question 1) — the place after the Type row
export function WriteFact({ writable }: { writable: boolean }) {
  const ui = lang.value;
  return (
    <Fact name={t(ui, "inspector.writeAccess")}>
      {t(ui, writable ? "inspector.writable" : "inspector.readOnly")}
    </Fact>
  );
}

export function RowFact({ ctx, row }: { ctx: FactCtx; row: FactRow }) {
  const ui = lang.value;
  if (row.kind === "records")
    return (
      <Fact name={t(ui, "inspector.records")}>
        {t(ui, "inspector.recordsValue", {
          count: row.ids.length,
          ids: row.ids.join(LIST),
        })}
      </Fact>
    );
  const name = (
    <>
      {row.label}
      {row.why !== undefined && (
        <AiMark tip={ctx.tip} mark={{ kind: "label", reason: row.why }} />
      )}
    </>
  );
  return (
    <Fact name={name}>
      <Value ctx={ctx} shown={shownOf(ui, row.value)} />
      {row.inferred !== undefined && (
        <AiMark
          tip={ctx.tip}
          mark={{ kind: "inferred", reason: row.inferred }}
        />
      )}
    </Fact>
  );
}
