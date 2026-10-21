import type {
  Fatal,
  Lang,
  Normalized,
  warningEntries,
} from "@qdic-topology/engine";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { ComponentChildren } from "preact";
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
import { noticeCase } from "./noticeCase";
import { Search } from "./Search";
import {
  dragging,
  grows,
  layout,
  ratio,
  startSplit,
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

type NormalizedOk = Extract<Normalized, { ok: true }>;

// why: rule 2, epic question 18 (ISSUE-005) — the caller gives the full warning list, never the
// `issues`; the shell never shows, copies or stores `fatal.path`
export type AppInput =
  | {
      ok: true;
      model: CanvasModel;
      warnings: ReturnType<typeof warningEntries>;
      counts: NormalizedOk["counts"];
      shaped?: NormalizedOk["shaped"];
      source: "model" | "paste";
    }
  | { ok: false; fatal: Fatal };

export type AppProps = {
  input: AppInput;
  lang: Lang;
  locale: string;
  theme: "light" | "dark";
  host: ShellHost;
};

type SplitProps = {
  input: AppInput;
  host: ShellHost;
  actions: Actions | null;
  workbench: string;
  children: ComponentChildren;
};

// why: STORY-004-07 rules 9-11 — the canvas and the Workbench share the split, with the handle
// between them; the keys of the split work while the App has the focus
function Split({ input, host, actions, workbench, children }: SplitProps) {
  const split = useRef<HTMLDivElement>(null);
  useSplitKeys(split);
  return (
    <div
      ref={split}
      class="split"
      data-layout={layout.value}
      data-dragging={dragging.value ? "" : undefined}
    >
      {children}
      {input.ok && <SplitHandle controls={workbench} />}
      {input.ok && <Workbench id={workbench} actions={actions} host={host} />}
    </div>
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

type FloatingProps = {
  actions: Actions;
  workbench: string;
  host: ShellHost;
  undo: ReturnType<typeof useUndo>;
  remake: Shell["remake"];
};

// why: P22 — the controls float on the canvas; STORY-004-08 rules 4, 6 (mockup index.html lines
// 154-161) — the DataNotice chip sits above the focus pill in the status stack, then the toast
function Floating({ actions, workbench, host, undo, remake }: FloatingProps) {
  return (
    <>
      <CategoryBar actions={actions} />
      <Search actions={actions} />
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
    </>
  );
}

// why: P22, rule 11 — the canvas takes the whole frame; the controls float on it. STORY-004-04
// rule 1 — the user's collapse choice of the inspector stays across selections (mockup
// `inspectorOpen`, app.js line 14), and the category bar makes room for the open card (line 138).
// STORY-004-06 rule 1 — the Hidden card shows only while the list has items, and the next hide
// after an empty list brings the chip back collapsed (app.js line 850). STORY-004-07 rule 11 — the
// App starts canvas-only and reads the stored share once, before the first render of the split.
// STORY-004-08 rules 1, 6 — the Undo snapshot is taken before the new input reaches the signals
export function App({ input, lang, locale, theme, host }: AppProps) {
  useLayoutEffect(() => takeLanguage(lang, locale), [lang, locale]);
  useState(startSplit);
  const undo = useUndo(input);
  const shell = useRenderer(input, lang);
  const { host: graph, canvas, shown } = shell;
  const frame = useRef<HTMLElement>(null);
  const workbench = useId();
  const [open, setOpen] = useState(true);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const { keep } = undo;
  const actions = useMemo(
    () => (canvas === null ? null : actionsOf(canvas, keep)),
    [canvas, keep],
  );
  const anyHidden = hiddenItems.value.length > 0;
  useLayoutEffect(() => {
    if (!anyHidden) setHiddenOpen(false);
  }, [anyHidden]);
  useDock(frame);
  const card =
    inspected.value === null ? "empty" : open ? "expanded" : "collapsed";
  return (
    <div class="shell" data-theme={theme}>
      <Split {...{ input: shown, host, actions, workbench }}>
        <main
          ref={frame}
          class="canvas"
          data-inspector={shown.ok ? card : undefined}
          data-hidden={anyHidden && hiddenOpen ? "expanded" : undefined}
          style={{ flexGrow: String(grows(layout.value, ratio.value).canvas) }}
        >
          {shown.ok && <div class="graph" ref={graph} />}
          <Notice shell={shell} host={host} actions={actions} />
          {actions !== null && (
            <Floating
              {...{ actions, workbench, host, undo }}
              remake={shell.remake}
            />
          )}
          {actions !== null && (
            <Inspector
              host={host}
              actions={actions}
              open={open}
              onToggle={() => setOpen((now) => !now)}
            />
          )}
          {actions !== null && anyHidden && (
            <HiddenPanel
              actions={actions}
              open={hiddenOpen}
              onToggle={() => setHiddenOpen((now) => !now)}
            />
          )}
        </main>
      </Split>
    </div>
  );
}
