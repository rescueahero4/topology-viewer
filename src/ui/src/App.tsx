import type {
  Fatal,
  Lang,
  Normalized,
  warningEntries,
} from "@qdic-topology/engine";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { useElementId } from "./ids";
import type { ComponentChildren, RefObject } from "preact";
import { actionsOf, type Actions } from "./actions";
import type { CanvasModel } from "./canvas/index";
import { CanvasNotice } from "./CanvasNotice";
import { CategoryBar } from "./CategoryBar";
import { ControlBar } from "./ControlBar";
import { DataNotice } from "./DataNotice";
import { FocusPill } from "./FocusPill";
import { hiddenItems, HiddenPanel, useDock } from "./HiddenPanel";
import type { ShellHost } from "./host";
import { inspected, Inspector } from "./Inspector";
import { useEscapeKey } from "./keys";
import { useNarrow } from "./narrow";
import { noticeCase } from "./noticeCase";
import { Search } from "./Search";
import {
  canvasStyle,
  dragging,
  layoutFor,
  startSplit,
  useSplitHeight,
  useSplitKeys,
} from "./split";
import { canvasState, frontier, lastNotice, takeLanguage } from "./state";
import { UndoToast, useUndo } from "./UndoToast";
import { useRenderer } from "./useRenderer";
import { SplitHandle } from "./SplitHandle";
import { Workbench } from "./Workbench";
import "./tokens.css";
import "./shell-frame.css";
import "./shell-controls.css";
import "./shell-menus.css";
import "./shell-inspector.css";
import "./shell-relations.css";
import "./shell-panels.css";
import "./shell-workbench.css";
import "./shell-notices.css";
import "./shell-narrow.css";

type NormalizedOk = Extract<Normalized, { ok: true }>;

// why: rule 2, epic question 18 (ISSUE-005) — the caller gives the full warning list, never the
// `issues`; the shell never shows, copies or stores `fatal.path`. SA §10 guardrail 6 (ISSUE-012
// C12) — a fatal input can say that it was pasted, so its Undo gives the previous chart back
export type AppInput =
  | {
      ok: true;
      model: CanvasModel;
      warnings: ReturnType<typeof warningEntries>;
      counts: NormalizedOk["counts"];
      shaped?: NormalizedOk["shaped"];
      source: "model" | "paste";
    }
  | { ok: false; fatal: Fatal; source?: "model" | "paste" };

export type AppProps = {
  input: AppInput;
  lang: Lang;
  locale: string;
  theme: "light" | "dark";
  host: ShellHost;
  workbenchStart?: ComponentChildren;
};

type SplitProps = {
  input: AppInput;
  host: ShellHost;
  actions: Actions | null;
  workbench: string;
  start: ComponentChildren;
  children: ComponentChildren;
};

// why: STORY-004-07 rules 9-11 — the canvas and the Workbench share the split, with the handle
// between them; the keys of the split work while the App has the focus
function Split(props: SplitProps) {
  const { input, host, actions, workbench, start, children } = props;
  const split = useRef<HTMLDivElement>(null);
  useSplitKeys(split, input.ok);
  useSplitHeight(split);
  return (
    <div
      ref={split}
      class="split"
      data-layout={layoutFor(input.ok)}
      data-dragging={dragging.value ? "" : undefined}
    >
      {children}
      {input.ok && <SplitHandle controls={workbench} />}
      {input.ok && (
        <Workbench id={workbench} actions={actions} host={host} start={start} />
      )}
    </div>
  );
}

type FrameProps = {
  frame: RefObject<HTMLElement>;
  table: boolean;
  inspector: string | undefined;
  hidden: string | undefined;
  children: ComponentChildren;
};

// why: STORY-004-09 rule 1 — the canvas height of split.ts; a change of it renders only this part
function CanvasFrame({
  frame,
  table,
  inspector,
  hidden,
  children,
}: FrameProps) {
  return (
    <main
      ref={frame}
      class="canvas"
      data-inspector={inspector}
      data-hidden={hidden}
      style={canvasStyle(table)}
    >
      {children}
    </main>
  );
}

type Shell = ReturnType<typeof useRenderer>;

// why: STORY-004-08 rule 1 — the notice of the input on the canvas, over the canvas and under the
// floating controls; "Try again" makes a new canvas with the same input
function Notice(props: {
  shell: Shell;
  host: ShellHost;
  actions: Actions | null;
}) {
  const { shell, host, actions } = props;
  const { shown } = shell;
  const found = noticeCase({
    input: shown,
    failed: shell.failed,
    kind: lastNotice.value,
    state: canvasState.value,
    drawn: frontier.value,
  });
  if (found === null) return null;
  return (
    <CanvasNotice
      found={found}
      host={host}
      actions={actions}
      table={shown.ok}
      onRetry={() => shell.remake({ input: shown })}
    />
  );
}

type Toggle = {
  open: boolean;
  setOpen: (change: (now: boolean) => boolean) => void;
};

type FloatingProps = {
  actions: Actions;
  workbench: string;
  host: ShellHost;
  undo: ReturnType<typeof useUndo>;
  remake: Shell["remake"];
  card: Toggle;
  hidden: Toggle;
};

// why: P22 — the controls float on the canvas. STORY-004-08 rules 4, 6 (mockup index.html lines
// 154-161) — the DataNotice chip sits above the focus pill in the status stack, then the toast.
// STORY-004-06 rule 1 — the Hidden card shows only while the list has items
function Floating(props: FloatingProps) {
  const { actions, workbench, host, undo, remake, card, hidden } = props;
  return (
    <>
      <ControlBar actions={actions} workbench={workbench} />
      <div class="status-stack">
        <DataNotice host={host} />
        <FocusPill actions={actions} />
        <UndoToast
          snapshot={undo.snapshot}
          close={undo.close}
          remake={remake}
        />
      </div>
      <Inspector
        host={host}
        actions={actions}
        open={card.open}
        onToggle={() => card.setOpen((now) => !now)}
      />
      {hiddenItems.value.length > 0 && (
        <HiddenPanel
          actions={actions}
          open={hidden.open}
          onToggle={() => hidden.setOpen((now) => !now)}
        />
      )}
    </>
  );
}

// why: SA §10 guardrail 6 (ISSUE-012 C12) — a pasted fatal input has no canvas and no controls,
// so the Undo toast of its snapshot stands alone in the status stack
function LoneToast(props: {
  undo: ReturnType<typeof useUndo>;
  remake: Shell["remake"];
}) {
  const { snapshot, close } = props.undo;
  if (snapshot === null) return null;
  return (
    <div class="status-stack">
      <UndoToast snapshot={snapshot} close={close} remake={props.remake} />
    </div>
  );
}

// why: P22, rule 11 — the canvas takes the whole frame; the controls float on it. STORY-004-04
// rule 1 — the user's collapse choice of the inspector stays across selections (mockup
// `inspectorOpen`, app.js line 14), and the category bar makes room for the open card (line 138).
// STORY-004-06 rule 1 — the next hide after an empty list brings the chip back collapsed (app.js
// line 850). STORY-004-07 rule 11 — the App starts canvas-only and reads the stored share once.
// STORY-004-08 rules 1, 6 — the Undo snapshot is taken before the new input reaches the signals.
// STORY-004-09 rule 6 (SA §5) — the DOM order is the visual order: category bar, search card,
// canvas, control bar, status stack, inspector, Hidden card, then the handle and the Workbench
export function App(props: AppProps) {
  const { input, lang, locale, theme, host, workbenchStart } = props;
  useLayoutEffect(() => takeLanguage(lang, locale), [lang, locale]);
  useState(startSplit);
  const undo = useUndo(input);
  const shell = useRenderer(input, lang);
  const { host: graph, canvas, shown } = shell;
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLElement>(null);
  const workbench = useElementId();
  const [open, setOpen] = useState(true);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  useNarrow(root, () => setOpen(false));
  const { keep } = undo;
  const actions = useMemo(
    () => (canvas === null ? null : actionsOf(canvas, keep)),
    [canvas, keep],
  );
  const anyHidden = hiddenItems.value.length > 0;
  useLayoutEffect(() => {
    if (!anyHidden) setHiddenOpen(false);
  }, [anyHidden]);
  useEscapeKey(root, actions);
  const card =
    inspected.value === null ? "empty" : open ? "expanded" : "collapsed";
  // why: ISSUE-012 C6 — the Inspector mounts a new card element when the floating controls come or
  // go and when it changes between its empty and its filled card
  useDock(frame, [actions === null, card === "empty"]);
  return (
    <div ref={root} class="shell" data-theme={theme}>
      <Split
        {...{ input: shown, host, actions, workbench }}
        start={workbenchStart}
      >
        <CanvasFrame
          frame={frame}
          table={input.ok}
          inspector={shown.ok ? card : undefined}
          hidden={anyHidden && hiddenOpen ? "expanded" : undefined}
        >
          {actions !== null && <CategoryBar actions={actions} />}
          {actions !== null && <Search actions={actions} />}
          {shown.ok && <div class="graph" ref={graph} />}
          <Notice shell={shell} host={host} actions={actions} />
          {actions !== null && (
            <Floating
              {...{ actions, workbench, host, undo }}
              remake={shell.remake}
              card={{ open, setOpen }}
              hidden={{ open: hiddenOpen, setOpen: setHiddenOpen }}
            />
          )}
          {actions === null && <LoneToast undo={undo} remake={shell.remake} />}
        </CanvasFrame>
      </Split>
    </div>
  );
}
