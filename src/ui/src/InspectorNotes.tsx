import type { DrawnNode, Vocab } from "@qdic-topology/engine";
import type { ComponentChildren } from "preact";
import type { Actions } from "./actions";
import { endName, isGroup } from "./relations";
import { lang } from "./state";
import { t, type Key } from "./strings/index";

type Note = {
  chip?: ComponentChildren;
  text: string;
  button: Key;
  onPress: () => void;
};

function NoteRow({ note }: { note: Note }) {
  return (
    <div
      class={note.chip === undefined ? "bucket-note" : "bucket-note more-note"}
    >
      {note.chip}
      <span>{note.text}</span>
      <button type="button" class="btn small" onClick={note.onPress}>
        {t(lang.value, note.button)}
      </button>
    </div>
  );
}

// why: FR-CANVAS-1, FR-CANVAS-6, rule 7 (mockup app.js lines 782-785) — the member note, the solid
// − note, the dashed +N note, and the note of a group node, each with its one canvas method
function notesOf(actions: Actions, vocab: Vocab, node: DrawnNode): Note[] {
  const ui = lang.value;
  if (isGroup(node)) {
    const type = endName(ui, vocab, node).toLowerCase();
    return [
      {
        text: t(ui, "notes.group", { count: node.count, type }),
        button: "notes.expand",
        onPress: () => actions.expand(node.id),
      },
    ];
  }
  const notes: Note[] = [];
  const group = node.group;
  if (group !== null)
    notes.push({
      text: t(ui, "notes.member"),
      button: "notes.collapse",
      onPress: () => actions.collapse(group),
    });
  if (node.opened > 0)
    notes.push({
      chip: <span class="more-chip open">{t(ui, "notes.openedChip")}</span>,
      text: t(ui, "notes.opened"),
      button: "notes.collapse",
      onPress: () => actions.collapse(node.id),
    });
  else if (node.more > 0)
    notes.push({
      chip: (
        <span class="more-chip">
          {t(ui, "notes.moreChip", { count: node.more })}
        </span>
      ),
      text: t(ui, "notes.more", { count: node.more }),
      button: "notes.show",
      onPress: () => actions.expand(node.id),
    });
  return notes;
}

export function InspectorNotes(props: {
  actions: Actions;
  vocab: Vocab;
  node: DrawnNode | undefined;
}) {
  const { actions, vocab, node } = props;
  if (node === undefined) return null;
  return (
    <>
      {notesOf(actions, vocab, node).map((note) => (
        <NoteRow key={note.button + note.text} note={note} />
      ))}
    </>
  );
}
