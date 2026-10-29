import type { EditCode, Lang } from "@qdic-topology/engine";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  MESSAGES,
  readField,
  startText,
  type InputKind,
  type Read,
} from "./cellEdit";
import { useElementId } from "./ids";
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

const TYPES: Readonly<Record<Exclude<InputKind, "boolean">, string>> = {
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

// why: STORY-008-04 rule 5 (owner 2026-10-29) — the true/false choice is the `.seg` radio group of
// the Workbench bar with "Yes", "No" and "No value"; the arrow keys move the choice
function Choice({
  ui,
  ids,
  choice,
  onPick,
}: Shared & { ui: Lang; choice: unknown; onPick: (v: unknown) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const at = CHOICES.findIndex((c) => c.value === choice);
  useLayoutEffect(() => {
    box.current?.querySelectorAll("button")[Math.max(0, at)]?.focus();
  }, [at]);
  return (
    <div
      ref={box}
      class="seg"
      role="radiogroup"
      aria-labelledby={ids.name}
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

// why: STORY-008-04 rules 4, 5, 7, 8 — the editor of one cell: Enter and a press outside save,
// Escape cancels; a bad value keeps the editor open with its message; the input takes the name
// "Edit <column>" from a text node
export function CellEditor(props: EditorProps) {
  const { ui, kind, value, name, check, save, onClose, holder } = props;
  const box = useRef<HTMLDivElement>(null);
  const field = useField(kind, value);
  const [choice, setChoice] = useState<unknown>(value ?? undefined);
  const [code, setCode] = useState<EditCode | null>(null);
  const ids = { name: useElementId(), message: useElementId() };
  const read = (): Read =>
    kind === "boolean" || field.current === null
      ? { after: choice }
      : readField(kind, field.current);
  const done = (how: Close) => {
    const found = save(read());
    setCode(found);
    if (found === null) onClose(how);
    return found === null;
  };
  holder.current = () => done("start");
  usePressOutside(box, () => done("press"));
  const [before, after] = tAround(ui, "edit.name", "column");
  const onInput = () => {
    if (code !== null) setCode(check(read()));
  };
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
        <Choice {...{ ui, ids, code }} choice={choice} onPick={setChoice} />
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
  kind: Exclude<InputKind, "boolean">;
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
