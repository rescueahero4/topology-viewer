import type {
  Fatal,
  Lang,
  Normalized,
  warningEntries,
} from "@qdic-topology/engine";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { actionsOf } from "./actions";
import type { CanvasModel } from "./canvas/index";
import { CategoryBar } from "./CategoryBar";
import { ControlBar } from "./ControlBar";
import { FocusPill } from "./FocusPill";
import { hiddenItems, HiddenPanel, useDock } from "./HiddenPanel";
import type { ShellHost } from "./host";
import { inspected, Inspector } from "./Inspector";
import { Search } from "./Search";
import { takeLanguage } from "./state";
import { useRenderer } from "./useRenderer";
import "./tokens.css";
import "./shell-frame.css";
import "./shell-controls.css";
import "./shell-menus.css";
import "./shell-inspector.css";
import "./shell-relations.css";
import "./shell-panels.css";

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

// why: P22, rule 11 — the canvas takes the whole frame; the controls float on it. STORY-004-04
// rule 1 — the user's collapse choice of the inspector stays across selections (mockup
// `inspectorOpen`, app.js line 14), and the category bar makes room for the open card (line 138).
// STORY-004-06 rule 1 — the Hidden card shows only while the list has items, and the next hide
// after an empty list brings the chip back collapsed (app.js line 850)
export function App({ input, lang, locale, theme, host }: AppProps) {
  useLayoutEffect(() => takeLanguage(lang, locale), [lang, locale]);
  const { host: graph, canvas } = useRenderer(input, lang);
  const frame = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(true);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const actions = useMemo(
    () => (canvas === null ? null : actionsOf(canvas)),
    [canvas],
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
      <main
        ref={frame}
        class="canvas"
        data-inspector={input.ok ? card : undefined}
        data-hidden={anyHidden && hiddenOpen ? "expanded" : undefined}
      >
        {input.ok && <div class="graph" ref={graph} />}
        {actions !== null && <CategoryBar actions={actions} />}
        {actions !== null && <Search actions={actions} />}
        {actions !== null && <ControlBar actions={actions} />}
        {actions !== null && (
          <div class="status-stack">
            <FocusPill actions={actions} />
          </div>
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
    </div>
  );
}
