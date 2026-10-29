import type { EditCode, Lang } from "@qdic-topology/engine";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  MESSAGES,
  readField,
  startText,
  type FieldKind,
  type InputKind,
  type Read,
} from "./cellEdit";
import { useElementId } from "./ids";
import { NodePick } from "./NodePick";
import { PickList } from "./PickList";
import { t, tAround } from "./strings/index";

export type Close = "key" | "press" | "start";

export type EditorProps = {
  ui: Lang;
  kind: InputKind;
  value: unknown;
  name: string;
  check: (read: Read) => EditCode | null;
  save: (read: Read) => EditCode | null;
  onClose: (how: Close) => void;
  holder: { current: (() => boolean) | null };
};

export const TYPES: Readonly<Record<FieldKind, string>> = {
  text: "text",
  datetime: "text",
  number: "number",
  date: "date",
};

const CHOICES = [
  { value: true, key: "edit.yes" },
  { value: false, key: "edit.no" },
  { value: undefined, key: "edit.noValue" },
] as const;

type Shared = {
  ids: { name: string; message: string };
  code: EditCode | null;
};

type ChoiceProps = {
  ui: Lang;
  label: string;
  choice: unknown;
  onPick: (v: unknown) => void;
  focusFirst?: boolean;
};

// why: STORY-008-04 rule 5 (owner 2026-10-29) — the true/false choice is the `.seg` radio group of
// the Workbench bar with "Yes", "No" and "No value"; the arrow keys move the choice. STORY-008-06 —
// a line of the facts form takes no focus at the start (`focusFirst` false)
export function Choice({
  ui,
  label,
  choice,
  onPick,
  focusFirst = true,
}: ChoiceProps) {
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(focusFirst);
  const at = CHOICES.findIndex((c) => c.value === choice);
  useLayoutEffect(() => {
    if (moved.current)
      box.current?.querySelectorAll("button")[Math.max(0, at)]?.focus();
    moved.current = true;
  }, [at]);
  return (
    <div
      ref={box}
      class="seg"
      role="radiogroup"
      aria-labelledby={label}
      onKeyDown={(event) => {
        const step =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const next = (Math.max(0, at) + step + CHOICES.length) % CHOICES.length;
        onPick(CHOICES[next].value);
      }}
    >
      {CHOICES.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={c.value === choice}
          tabIndex={c.value === choice ? 0 : -1}
          onClick={() => onPick(c.value)}
        >
          {t(ui, c.key)}
        </button>
      ))}
    </div>
  );
}

// why: STORY-008-04 rules 7, 10, 12 — the message is a text node in a polite live region, under the
// cell; its id comes from `useElementId`, never from a model or typed string
function Message({ ui, ids, code }: Shared & { ui: Lang }) {
  return (
    <div class="cell-msg" aria-live="polite">
      {code !== null && (
        <p id={ids.message} class="form-error float-card">
          {t(ui, MESSAGES[code])}
        </p>
      )}
    </div>
  );
}

// why: STORY-008-04 rule 4 — a press outside the editor saves; with a bad value the editor stays
function usePressOutside(box: { current: HTMLElement | null }, go: () => void) {
  const latest = useRef(go);
  latest.current = go;
  useEffect(() => {
    const doc = box.current?.ownerDocument;
    const onPress = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && box.current?.contains(target)) return;
      latest.current();
    };
    doc?.addEventListener("pointerdown", onPress, true);
    return () => doc?.removeEventListener("pointerdown", onPress, true);
  }, [box]);
}

function useField(kind: InputKind, value: unknown) {
  const field = useRef<HTMLInputElement>(null);
  // why: STORY-008-04 rule 10 — the old value goes into the `value` property, never an attribute
  useLayoutEffect(() => {
    const el = field.current;
    if (el === null) return;
    el.value = startText(value);
    el.focus();
    if (kind === "text" || kind === "datetime") el.select();
  }, []);
  return field;
}

type Picks = {
  kind: InputKind;
  reader: { current: (() => Read | null) | null };
};

// why: STORY-008-04 rule 5, STORY-008-05 rules 2-4 — the value that a save reads: the choice, the
// input, or the item or free text of a list (`null`: a node search with no active item)
function readOf(
  { kind, reader }: Picks,
  choice: unknown,
  field: HTMLInputElement | null,
): Read | null {
  if (kind === "boolean") return { after: choice };
  if (kind === "kind" || kind === "predicate" || kind === "node")
    return reader.current?.() ?? null;
  return field === null ? null : readField(kind, field);
}

// why: STORY-008-04 rules 4, 5, 7, 8 — the editor of one cell: Enter and a press outside save,
// Escape cancels; a bad value keeps the editor open with its message; the input takes the name
// "Edit <column>" from a text node. With nothing to save (a node search with no active item),
// Enter does nothing and a press outside closes the editor with no save
export function CellEditor(props: EditorProps) {
  const { ui, kind, value, name, check, save, onClose, holder } = props;
  const box = useRef<HTMLDivElement>(null);
  const field = useField(kind, value);
  const reader = useRef<(() => Read | null) | null>(null);
  const [choice, setChoice] = useState<unknown>(value ?? undefined);
  const [code, setCode] = useState<EditCode | null>(null);
  const ids = { name: useElementId(), message: useElementId() };
  const read = () => readOf({ kind, reader }, choice, field.current);
  const done = (how: Close, given: Read | null = read()) => {
    if (given === null) {
      if (how !== "key") onClose(how);
      return how !== "key";
    }
    const found = save(given);
    setCode(found);
    if (found === null) onClose(how);
    return found === null;
  };
  holder.current = () => done("start");
  usePressOutside(box, () => done("press"));
  const [before, after] = tAround(ui, "edit.name", "column");
  const onInput = () => {
    const now = read();
    if (code !== null && now !== null) setCode(check(now));
  };
  const pick = { ui, value, ids, code, reader, onInput };
  const onPick = (given: Read) => void done("key", given);
  return (
    <div
      ref={box}
      class="cell-edit"
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") onClose("key");
        else done("key");
      }}
    >
      <span id={ids.name} class="sr-only">
        {before}
        {name}
        {after}
      </span>
      {kind === "boolean" ? (
        <Choice ui={ui} label={ids.name} choice={choice} onPick={setChoice} />
      ) : kind === "kind" || kind === "predicate" ? (
        <PickList {...pick} kind={kind} onPick={onPick} />
      ) : kind === "node" ? (
        <NodePick {...pick} onPick={onPick} />
      ) : (
        <Field {...{ ids, code, kind, field, onInput }} />
      )}
      <Message {...{ ui, ids, code }} />
    </div>
  );
}

function Field({
  ids,
  code,
  kind,
  field,
  onInput,
}: Shared & {
  kind: FieldKind;
  field: { current: HTMLInputElement | null };
  onInput: () => void;
}): ComponentChildren {
  return (
    <input
      ref={field}
      class="cell-input"
      type={TYPES[kind]}
      aria-labelledby={ids.name}
      aria-invalid={code === null ? undefined : "true"}
      aria-describedby={code === null ? undefined : ids.message}
      onInput={onInput}
    />
  );
}
