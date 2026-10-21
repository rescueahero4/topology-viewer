import type {
  Fatal,
  Lang,
  Normalized,
  warningEntries,
} from "@qdic-topology/engine";
import { useLayoutEffect } from "preact/hooks";
import type { CanvasModel } from "./canvas/index";
import type { ShellHost } from "./host";
import { takeLanguage } from "./state";
import { useRenderer } from "./useRenderer";
import "./tokens.css";
import "./shell-frame.css";

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

// why: P22, rule 11 — the canvas takes the whole frame; later stories float their controls on it
export function App({ input, lang, locale, theme }: AppProps) {
  useLayoutEffect(() => takeLanguage(lang, locale), [lang, locale]);
  const { host } = useRenderer(input, lang);
  return (
    <div class="shell" data-theme={theme}>
      <main class="canvas">{input.ok && <div class="graph" ref={host} />}</main>
    </div>
  );
}
