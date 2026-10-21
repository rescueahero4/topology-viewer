import type { Selection } from "@qdic-topology/engine";
import { useState } from "preact/hooks";
import { familyClass, familyIcon } from "./familyLook";
import { familyName } from "./names";
import { familyBlocks, type Direction, type Relation } from "./relations";
import { lang } from "./state";
import { t, type Key } from "./strings/index";
import { TripleRow, type RelCtx } from "./TripleRow";
import { UiIcon } from "./UiIcon";

type Tab = "all" | Direction;

const TABS: readonly { tab: Tab; key: Key }[] = [
  { tab: "all", key: "relations.all" },
  { tab: "out", key: "relations.out" },
  { tab: "in", key: "relations.in" },
];

// why: rule 10 (b), FR-QDIC-7 — the three write rules of the profile `writeRules` (GV "The three
// rules") as string-table texts
const RULES: readonly Key[] = [
  "relations.ruleType",
  "relations.rulePairing",
  "relations.ruleEnds",
];

// why: rule 10 (b), STORY-004-03 rule 4 (mockup index.html lines 115-121) — the info icon of the
// relationships block; its tip lists the write rules, made when the tip opens
function RulesInfo({ ctx }: { ctx: RelCtx }) {
  const ui = lang.value;
  return (
    <span
      class="info ic"
      role="img"
      tabIndex={0}
      aria-label={t(ui, "relations.rulesName")}
      {...ctx.tip.anchor("rules", () => RULES.map((key) => t(ui, key)))}
    >
      <UiIcon name="info" />
    </span>
  );
}

function Blocks({
  ctx,
  rows,
  tab,
}: {
  ctx: RelCtx;
  rows: Relation[];
  tab: Tab;
}) {
  const ui = lang.value;
  const blocks = familyBlocks(ctx.model.vocab, rows);
  if (blocks.length === 0)
    return (
      <p class="none-note">
        {t(ui, tab === "all" ? "relations.none" : "relations.noneHere")}
      </p>
    );
  return (
    <>
      {blocks.map((block) => (
        <section
          key={block.family}
          class={`fam-group ${familyClass(block.family)}`}
        >
          <h3 class="fam-head">
            <span class="ic">
              <UiIcon name={familyIcon(block.family)} />
            </span>
            {familyName(ui, block.family)}{" "}
            <span class="n">
              {t(ui, "relations.familyCount", { count: block.rows.length })}
            </span>
          </h3>
          {block.rows.map((row) => (
            <TripleRow key={row.edge.key} ctx={ctx} row={row} />
          ))}
        </section>
      ))}
    </>
  );
}

// why: FR-INSPECT-1, rules 1, 3, 4 (mockup app.js lines 754-790) — the tabs count each direction;
// a new selection shows "All" again (mockup line 529)
export function Relationships({
  ctx,
  rows,
}: {
  ctx: RelCtx;
  rows: Relation[];
}) {
  const ui = lang.value;
  const [chosen, setChosen] = useState<{ at: Selection; tab: Tab }>({
    at: ctx.selection,
    tab: "all",
  });
  const tab = chosen.at === ctx.selection ? chosen.tab : "all";
  const out = rows.filter((row) => row.direction === "out").length;
  const counts: Readonly<Record<Tab, number>> = {
    all: rows.length,
    out,
    in: rows.length - out,
  };
  const shown = rows.filter((row) => tab === "all" || row.direction === tab);
  return (
    <>
      <div class="insp-tabs">
        <div
          role="tablist"
          class="tab-list"
          aria-label={t(ui, "relations.tabs")}
        >
          {TABS.map((item) => (
            <button
              key={item.tab}
              type="button"
              role="tab"
              class="insp-tab"
              aria-selected={tab === item.tab}
              onClick={() => setChosen({ at: ctx.selection, tab: item.tab })}
            >
              {t(ui, item.key, { count: counts[item.tab] })}
            </button>
          ))}
        </div>
        <RulesInfo ctx={ctx} />
      </div>
      <div class="triples" role="tabpanel">
        <Blocks ctx={ctx} rows={shown} tab={tab} />
      </div>
    </>
  );
}
