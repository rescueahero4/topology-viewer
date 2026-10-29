import type { EditCode, Lang } from "@qdic-topology/engine";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { ApplyChoice } from "./ApplyChoice";
import {
  isAsk,
  MESSAGES,
  readField,
  startText,
  valueInput,
  type Ask,
  type Fact,
  type LineKind,
  type Read,
  type Saved,
} from "./cellEdit";
import { Choice, TYPES, type Close } from "./CellEditor";
import { valueText } from "./formatValue";
import { useElementId } from "./ids";
import { t, type Key } from "./strings/index";

export type FactsProps = {
  ui: Lang;
  text: string;
  facts: readonly Fact[];
  check: (key: string, read: Read) => EditCode | null;
  save: (key: string, read: Read) => Saved;
  onClose: (how: Close) => void;
  holder: { current: (() => boolean) | null };
};

type Line = Fact & { kind: LineKind | null };

// why: STORY-008-06 rule 2 — the three named facts show the key of the Attributes cell
const LABELS = new Map<string, Key>([
  ["valid_from", "wb.validFrom"],
  ["valid_to", "wb.validTo"],
  ["isActive", "wb.isActive"],
]);

const labelOf = (ui: Lang, key: string) => {
  const label = LABELS.get(key);
  return label === undefined ? key : t(ui, label);
};

type Parts = {
  lines: readonly Line[];
  box: { current: HTMLDivElement | null };
  fields: { current: (HTMLInputElement | null)[] };
};

// why: STORY-008-06 rule 5 — the control of a line takes the focus: its input, or the checked
// button of its true/false choice
function focusLine({ lines, box, fields }: Parts, at: number | undefined) {
  if (at === undefined) return;
  if (lines[at].kind === "boolean") {
    const seg = box.current?.querySelector(`dd[data-line="${at}"] .seg`);
    seg?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    return;
  }
  const el = fields.current[at];
  el?.focus();
  if (lines[at].kind === "text" || lines[at].kind === "datetime") el?.select();
}

// why: STORY-008-06 rule 3 — the document press, read before the focus moves
function usePress(
  box: { current: HTMLDivElement | null },
  go: (target: EventTarget | null) => void,
) {
  const latest = useRef(go);
  latest.current = go;
  useEffect(() => {
    const doc = box.current?.ownerDocument;
    const onPress = (event: Event) => latest.current(event.target);
    doc?.addEventListener("pointerdown", onPress, true);
    return () => doc?.removeEventListener("pointerdown", onPress, true);
  }, [box]);
}

// why: STORY-008-07 rule 4 — a line save that asks opens the choice; `then` runs when the line
// saves, at once or after the pick; nothing else saves while the choice is open
function useAsk(
  parts: Parts,
  setCode: (at: number, code: Code) => void,
  save: (at: number) => Saved,
) {
  const { lines } = parts;
  const [asking, setAsking] = useState<Asking | null>(null);
  const saveAt = (at: number, then: () => void = () => undefined) => {
    if (asking !== null) return false;
    if (lines[at] === undefined || lines[at].kind === null) {
      then();
      return true;
    }
    const found = save(at);
    if (isAsk(found)) {
      setCode(at, null);
      setAsking({ at, ask: found, then });
      return false;
    }
    setCode(at, found);
    if (found === null) then();
    return found === null;
  };
  const choose = (all: boolean) => {
    if (asking === null) return;
    const found = asking.ask.apply(all);
    setAsking(null);
    setCode(asking.at, found);
    if (found === null) asking.then();
    else focusLine(parts, asking.at);
  };
  const cancel = () => {
    setAsking(null);
    focusLine(parts, asking?.at);
  };
  return { asking, saveAt, choose, cancel };
}

// why: STORY-008-06 rule 3 (PRD-002 FR-CELL-4 addendum 0.3) — each line saves on its own as one
// edit; a line with no change saves nothing (the save path gives no change for the same value)
function useLines(props: FactsProps) {
  const latest = useRef(props);
  latest.current = props;
  const [lines] = useState<Line[]>(() =>
    props.facts.map((fact) => ({ ...fact, kind: valueInput(fact.value) })),
  );
  const parts: Parts = {
    lines,
    box: useRef<HTMLDivElement>(null),
    fields: useRef<(HTMLInputElement | null)[]>([]),
  };
  const open = lines.flatMap((line, at) => (line.kind === null ? [] : [at]));
  const [choices, setChoices] = useState(() => lines.map((l) => l.value));
  const [codes, setCodes] = useState(() => lines.map(() => null as Code));
  const active = useRef(open[0] ?? -1);
  const setCode = (at: number, code: Code) =>
    setCodes((now) => now.map((c, i) => (i === at ? code : c)));
  const readAt = (at: number): Read => {
    const { kind, value } = lines[at];
    if (kind === "boolean") return { after: choices[at] };
    const el = parts.fields.current[at];
    return kind === null || !el ? { after: value } : readField(kind, el);
  };
  const { asking, saveAt, choose, cancel } = useAsk(parts, setCode, (at) =>
    latest.current.save(lines[at].key, readAt(at)),
  );
  const recheck = (at: number) => {
    if (codes[at] !== null)
      setCode(at, latest.current.check(lines[at].key, readAt(at)));
  };
  const pick = (at: number, value: unknown) =>
    setChoices((now) => now.map((c, i) => (i === at ? value : c)));
  const ask = { asking, choose, cancel };
  return { parts, open, choices, codes, active, saveAt, recheck, pick, ask };
}

type Code = EditCode | null;
type Asking = { at: number; ask: Ask; then: () => void };

// why: STORY-008-06 rules 3, 5 — Enter and Tab save the line and move to the next line (Shift+Tab
// to the one before, both in a loop); a bad value keeps the focus; Escape closes the form
function keysOf(
  lines: ReturnType<typeof useLines>,
  onClose: (how: Close) => void,
) {
  const { parts, open, active, saveAt } = lines;
  return (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose("key");
      return;
    }
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.key === "Tab" && event.shiftKey ? -1 : 1;
    const pos = open.indexOf(active.current);
    const next = open[(pos + step + open.length) % open.length];
    saveAt(active.current, () => focusLine(parts, next));
  };
}

// why: STORY-008-06 rule 3 — a press on another line saves the line; a press outside the form
// also closes the form when the line saves
function pressOf(
  lines: ReturnType<typeof useLines>,
  onClose: (how: Close) => void,
) {
  const { parts, active, saveAt } = lines;
  return (target: EventTarget | null) => {
    if (!(target instanceof Node && parts.box.current?.contains(target))) {
      saveAt(active.current, () => onClose("press"));
      return;
    }
    const line =
      target instanceof Element ? target.closest("[data-line]") : null;
    if (
      line instanceof HTMLElement &&
      Number(line.dataset.line) !== active.current
    )
      saveAt(active.current);
  };
}

// why: STORY-008-06 rules 1-6 (PRD-002 FR-CELL-4) — the edge facts form under the Attributes cell,
// one line per fact, values only. A press outside the line saves it; a press outside the form also
// closes the form when the line saves. Escape gives the old values back and closes the form. Keys
// and values are text nodes and input `value` properties; each id comes from the line index
// (guardrail 8)
export function FactsForm(props: FactsProps) {
  const { ui, onClose, holder } = props;
  const lines = useLines(props);
  const { parts, open, choices, codes, active, saveAt } = lines;
  const { asking } = lines.ask;
  const base = useElementId();
  holder.current = () => saveAt(active.current, () => onClose("start"));
  usePress(parts.box, pressOf(lines, onClose));
  useLayoutEffect(() => {
    parts.lines.forEach((line, at) => {
      const el = parts.fields.current[at];
      if (el) el.value = startText(line.value);
    });
    focusLine(parts, open[0]);
  }, []);
  return (
    <div class="cell-edit facts-edit">
      <span class="cell-text">{props.text}</span>
      <div
        ref={parts.box}
        class="facts facts-form float-card"
        role="group"
        aria-label={t(ui, "edit.facts")}
        onKeyDown={keysOf(lines, onClose)}
      >
        <dl>
          {parts.lines.map((line, at) => (
            <FactLine
              key={at}
              {...{ ui, line, at, base, fields: parts.fields }}
              code={codes[at]}
              choice={choices[at]}
              onFocus={() => {
                active.current = at;
              }}
              onPick={(value) => lines.pick(at, value)}
              onInput={() => lines.recheck(at)}
            />
          ))}
        </dl>
        {asking !== null && (
          <ApplyChoice
            {...{ ui, ask: asking.ask, label: `${base}-k${asking.at}` }}
            onPick={lines.ask.choose}
            onCancel={lines.ask.cancel}
          />
        )}
      </div>
    </div>
  );
}

type LineProps = {
  ui: Lang;
  line: Line;
  at: number;
  base: string;
  fields: { current: (HTMLInputElement | null)[] };
  code: Code;
  choice: unknown;
  onFocus: () => void;
  onPick: (value: unknown) => void;
  onInput: () => void;
};

// why: STORY-008-06 rule 2 — a list or an object fact shows its value as read-only text; rule 3 —
// a bad value gives its message under the line, with `aria-invalid` on that input
function FactLine(props: LineProps) {
  const { ui, line, at, base, code } = props;
  const ids = { key: `${base}-k${at}`, message: `${base}-m${at}` };
  const { kind } = line;
  return (
    <>
      <dt id={ids.key} data-line={at}>
        {labelOf(ui, line.key)}
      </dt>
      <dd data-line={at} onFocusCapture={props.onFocus}>
        {kind === null ? (
          valueText(ui, line.value)
        ) : kind === "boolean" ? (
          <Choice
            ui={ui}
            label={ids.key}
            choice={props.choice}
            onPick={props.onPick}
            focusFirst={false}
          />
        ) : (
          <input
            ref={(el) => {
              props.fields.current[at] = el;
            }}
            class="cell-input"
            type={TYPES[kind]}
            aria-labelledby={ids.key}
            aria-invalid={code === null ? undefined : "true"}
            aria-describedby={code === null ? undefined : ids.message}
            onInput={props.onInput}
          />
        )}
        <div aria-live="polite">
          {code !== null && (
            <p id={ids.message} class="form-error">
              {t(ui, MESSAGES[code])}
            </p>
          )}
        </div>
      </dd>
    </>
  );
}
