import { batch, signal } from "@preact/signals";
import {
  noticeText,
  type Lang,
  type Shaped,
  type warningEntries,
} from "@qdic-topology/engine";
import { codeText } from "./codeText";
import { CopyButton } from "./CopyButton";
import type { ShellHost } from "./host";
import { lang, shaped, warnings } from "./state";
import { t } from "./strings/index";
import { UiIcon } from "./UiIcon";

type Entries = ReturnType<typeof warningEntries>;
export type ChipLine = { code: string; body: string; ai: string };

// why: FR-DATA-3 (mockup SKIPS, app.js lines 191-195) — the codes of the records left out
const SKIPS: ReadonlySet<string> = new Set([
  "no-id",
  "duplicate-id",
  "dangling-edge",
]);

// why: rule 4 (mockup `dataNotice`, app.js line 197) — the dismiss and the open state belong to
// one warning list, so a new input shows the chip again, collapsed, and an Undo of the same
// input keeps them
const dismissedFor = signal<Entries | null>(null);
const openFor = signal<Entries | null>(null);

export const chipDismissed = () =>
  warnings.value.length > 0 && dismissedFor.value === warnings.value;

// why: rule 5 (FR-HOST-9, H4 (b)) — the Scope-menu item shows the chip again, collapsed
export function showChip(): void {
  batch(() => {
    dismissedFor.value = null;
    openFor.value = null;
  });
}

// why: rule 4, epic questions 1 and 3 (SA §6) — every warning entry, the skip codes first, then
// the catalog order of the list; the catalog body with the count, and `kind` for `shaped-from`
export function chipLines(
  entries: Entries,
  ui: Lang,
  shape: Shaped | undefined,
): ChipLine[] {
  const skips = entries.filter((entry) => SKIPS.has(entry.code));
  const rest = entries.filter((entry) => !SKIPS.has(entry.code));
  return [...skips, ...rest].map(({ code, count }) => {
    const info =
      code === "shaped-from" && shape !== undefined
        ? { count, kind: shape.kind }
        : { count };
    const { body, ai } = noticeText(code, info, ui);
    return { code, body, ai };
  });
}

const aiTexts = (lines: readonly ChipLine[]) => [
  ...new Set(lines.map((line) => line.ai).filter((ai) => ai !== "")),
];

// why: rule 4, H3 — the skip sum when a skip code is present, else the sum of every entry
export function chipHeader(entries: Entries, ui: Lang): string {
  const skipped = entries
    .filter((entry) => SKIPS.has(entry.code))
    .reduce((sum, entry) => sum + entry.count, 0);
  if (skipped > 0) return t(ui, "chip.skipped", { count: skipped });
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  return t(ui, "chip.warnings", { count: total });
}

// why: rule 4 (mockup copy handler, app.js lines 227-230) — catalog text with counts and tokens
// only; each "For the AI client" text once (epic question 2)
export function chipCopy(lines: readonly ChipLine[], ui: Lang): string {
  const ai = aiTexts(lines);
  return [
    t(ui, "chip.copyHead"),
    ...lines.map((line) => t(ui, "chip.copyLine", { line: line.body })),
    ...(ai.length > 0 ? [t(ui, "chip.copyFix", { ai: ai.join(" ") })] : []),
  ].join("\n");
}

function Body({ host, lines }: { host: ShellHost; lines: ChipLine[] }) {
  const ui = lang.value;
  const skipped = lines.some((line) => SKIPS.has(line.code));
  return (
    <div class="dn-body">
      {skipped && <p>{t(ui, "chip.intro")}</p>}
      <ul>
        {lines.map((line) => (
          <li key={line.code}>{codeText(line.body)}</li>
        ))}
      </ul>
      <div class="notice-ai">
        <p class="notice-h">
          <span class="ic">
            <UiIcon name="bot" />
          </span>
          {t(ui, "notice.ai")}
        </p>
        {aiTexts(lines).map((ai) => (
          <p key={ai}>{codeText(ai)}</p>
        ))}
      </div>
      <CopyButton host={host} text={() => chipCopy(lines, ui)} />
    </div>
  );
}

// why: FR-DATA-3, FR-CANVAS-16, SA §6 row 13 (mockup `renderDataNotice`, app.js lines 199-220) —
// a partial problem is never silent; the chip is collapsed until the user opens it
export function DataNotice({ host }: { host: ShellHost }) {
  const list = warnings.value;
  if (list.length === 0 || dismissedFor.value === list) return null;
  const ui = lang.value;
  const open = openFor.value === list;
  return (
    <aside
      class="data-notice float-card"
      data-state={open ? "expanded" : "collapsed"}
      aria-live="polite"
    >
      <div class="dn-head">
        <button
          type="button"
          class="dn-toggle"
          aria-expanded={open}
          onClick={() => (openFor.value = open ? null : list)}
        >
          <span class="ic">
            <UiIcon name="alert-triangle" />
          </span>
          {chipHeader(list, ui)}
          <span class="ic chev">
            <UiIcon name={open ? "chevron-down" : "chevron-up"} />
          </span>
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label={t(ui, "chip.dismiss")}
          onClick={() => (dismissedFor.value = list)}
        >
          <span class="ic">
            <UiIcon name="x" />
          </span>
        </button>
      </div>
      {open && <Body host={host} lines={chipLines(list, ui, shaped.value)} />}
    </aside>
  );
}
