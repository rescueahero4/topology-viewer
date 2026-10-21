import { batch, signal } from "@preact/signals";
import type {
  CanvasState,
  Counts,
  Frontier,
  Lang,
  Selection,
  Shaped,
  warningEntries,
} from "@qdic-topology/engine";
import type { AppInput } from "./App";
import type {
  Camera,
  CanvasEvent,
  CanvasModel,
  NoticeKind,
} from "./canvas/index";

// why: SA §5 UI, rule 4 — the shell state that the engine feeds, set only from the props and the
// canvas events. View state (an open menu or panel) stays in the module that owns it (reading d4)
export const model = signal<CanvasModel | null>(null);
export const warnings = signal<ReturnType<typeof warningEntries>>([]);
export const counts = signal<Counts | null>(null);
export const shaped = signal<Shaped | undefined>(undefined);
export const source = signal<"model" | "paste" | null>(null);
export const lang = signal<Lang>("en");
export const locale = signal("");
export const canvasState = signal<CanvasState | null>(null);
export const frontier = signal<Frontier | null>(null);
export const camera = signal<Camera | null>(null);
export const selection = signal<Selection>(null);
export const lastNotice = signal<NoticeKind | null>(null);

// why: owner decision H8 — a new input is a new canvas, so the state of the old canvas goes; the
// model is kept by reference only and never serialised (EPIC-002 hand-off items 1, 2)
export function takeInput(input: AppInput): void {
  batch(() => {
    model.value = input.ok ? input.model : null;
    warnings.value = input.ok ? input.warnings : [];
    counts.value = input.ok ? input.counts : null;
    shaped.value = input.ok ? input.shaped : undefined;
    source.value = input.ok ? input.source : null;
    canvasState.value = null;
    frontier.value = null;
    camera.value = null;
    selection.value = null;
    lastNotice.value = null;
  });
}

export function takeLanguage(next: Lang, nextLocale: string): void {
  batch(() => {
    lang.value = next;
    locale.value = nextLocale;
  });
}

type Feed = { readonly [K in keyof CanvasEvent]: (e: CanvasEvent[K]) => void };

// why: P4-3, EPIC-003 report `settle` fact 5 — each of `select`, `explore`, `drag-end` and `settle`
// carries the state; a method during a drag gives `drag-end` and no `settle`
export const feed: Feed = {
  select: (e) => {
    batch(() => {
      canvasState.value = e.state;
      selection.value = e.selection;
    });
  },
  explore: (e) => {
    canvasState.value = e.state;
  },
  "drag-end": (e) => {
    canvasState.value = e.state;
  },
  settle: (e) => {
    batch(() => {
      canvasState.value = e.state;
      frontier.value = e.frontier;
      camera.value = e.camera;
    });
  },
  notice: (e) => {
    lastNotice.value = e.kind;
  },
};
