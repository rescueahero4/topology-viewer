// This must be the first import: it changes zod before the other modules make their schemas.
import "./zodConfig";
import { profile } from "#contract";
import { entityOfDrawnId, type Hex, type Lang, type Selection } from "#engine";
import {
  App,
  commands,
  customFilters,
  display,
  installPartHook,
  langOf,
  linkOf,
  live,
  overrideStrings,
  partsOnPath,
  dispatch,
  setCustom,
  setEventPath,
  setFamilyLooks,
  setKeyScope,
  setSlotHost,
  syncCanvasCustom,
  type AppInput,
  type Commands,
  type Custom,
  type FamilyLook,
  type ShellHost,
  type SlotHost,
} from "#ui";
import { effect, untracked } from "@preact/signals";
import { h, render } from "preact";
import type {
  TopologyLoadError,
  TopologyOptions,
  TopologySelection,
} from "../../types/index";
import { layout as tableLayout } from "../ui/split";
import {
  canvasState,
  editedGraph,
  editHistory,
  saveState,
  selection,
} from "../ui/state";
import { Status } from "./Status";
import { layered, NO_TYPES_RULE, styleText } from "./styles";
import { toInput } from "./toInput";

// The class and the style of a developer reach every element through this one hook.
installPartHook();

const noTypes = Object.keys(profile.nodeTypes).length === 0;
// A profile with no node types makes every type "custom", so that group name says nothing.
const DEFAULT_STRINGS: Record<string, string> = noTypes
  ? { "group.Custom": "" }
  : {};

export type CoreView =
  | { state: "loading" | "empty" }
  | {
      state: "failed";
      kind: TopologyLoadError["kind"];
      status?: number;
      onRetry: () => void;
    }
  | { state: "data"; payload: unknown };

export type CoreProps = TopologyOptions & {
  view: CoreView;
  /** The colour of the canvas in the theme, for the contrast check of the node colours. */
  canvas?: string | undefined;
  /** The name of the theme that shows. */
  mode?: string | undefined;
};

export type CoreViewer = {
  show(props: CoreProps): void;
  commands: Commands;
  destroy(): void;
};

export type CoreApi = {
  styleText: string;
  familyCss(looks: Readonly<Record<string, FamilyLook>>): string;
  createViewer(
    mountPoint: HTMLElement,
    hostElement: HTMLElement,
    variant: "widget" | "page",
    slots: SlotHost,
  ): CoreViewer;
};

function nodeOf(drawn: string): TopologySelection {
  const id = entityOfDrawnId(drawn);
  if (id === null) return { kind: "group", id: drawn };
  const graph = editedGraph.peek();
  const entity = graph?.entities.find((one) => one.id === id);
  const record = graph?.records.find((one) => one.id === entity?.records[0]);
  return {
    kind: "node",
    id,
    label: entity?.label ?? id,
    ...(entity?.type === undefined ? {} : { type: entity.type }),
    attrs: { ...record?.attrs },
  };
}

function selectionOf(selection: Selection): TopologySelection {
  if (selection === null) return null;
  if ("node" in selection) return nodeOf(selection.node);
  const [subject, predicate, object] = JSON.parse(selection.edge) as [
    string,
    string,
    string,
  ];
  return {
    kind: "edge",
    subject: entityOfDrawnId(subject) ?? subject,
    predicate,
    object: entityOfDrawnId(object) ?? object,
  };
}

type Mode = "inline" | "fullscreen";

// The page behind a full view does not scroll. This writes one style of the page, and gives it back.
function pageLock(doc: Document) {
  let before: string | null = null;
  return (on: boolean) => {
    const root = doc.documentElement;
    if (on && before === null) {
      before = root.style.overflow;
      root.style.overflow = "hidden";
    } else if (!on && before !== null) {
      root.style.overflow = before;
      before = null;
    }
  };
}

function customOf(props: CoreProps): Custom {
  return {
    parts: (props.parts ?? {}) as Custom["parts"],
    onAction: props.onAction as Custom["onAction"],
    onSave: props.onSave as Custom["onSave"],
    keyboard: props.keyboard,
    layouts: props.layouts as Custom["layouts"],
  };
}

function createViewer(
  mountPoint: HTMLElement,
  element: HTMLElement,
  variant: "widget" | "page",
  slots: SlotHost,
): CoreViewer {
  const doc = element.ownerDocument;
  const embedded = variant === "widget";
  const lock = pageLock(doc);
  let last: CoreProps | null = null;
  let payload: unknown;
  let input: AppInput | null = null;
  let inputCanvas: string | undefined;
  let start: { state: never; camera: never } | undefined;
  let settled: { state: unknown; camera: unknown } | undefined;
  let mode: Mode = "inline";
  let returnFocus: HTMLElement | null = null;

  setSlotHost(slots);

  // A shortcut works only while the pointer or the focus is in the viewer.
  setKeyScope(
    (event) => event.composedPath().includes(element) || element.matches(":hover"),
  );

  const strategy = () => last?.fullscreen ?? "viewport";

  // A parent with `transform`, `filter` or `contain` makes a fixed element fill the parent and not the
  // view. The viewer cannot change a parent, so it says so.
  const warnWhenTrapped = () => {
    const box = mountPoint.getBoundingClientRect();
    const view = doc.defaultView;
    if (view === null) return;
    const fills =
      Math.abs(box.left) < 2 &&
      Math.abs(box.top) < 2 &&
      Math.abs(box.width - view.innerWidth) < 2 &&
      Math.abs(box.height - view.innerHeight) < 2;
    if (!fills) {
      console.warn(
        'topology-viewer: the full view does not fill the browser view. A parent element has transform, filter or contain. Use fullscreen="native", or your own { enter, exit }.',
      );
      return;
    }
    // A parent with `isolation` or its own `z-index` keeps the view under what is above that parent,
    // such as a sticky header. The element at a point is the host for all that is in the Shadow DOM.
    const covered = [
      [view.innerWidth / 2, 4],
      [4, view.innerHeight / 2],
    ].some(([x, y]) => {
      const top = doc.elementFromPoint(x as number, y as number);
      return top !== null && top !== element && !element.contains(top);
    });
    if (covered)
      console.warn(
        'topology-viewer: something on the page covers the full view. A parent element has isolation or its own z-index, or something is above --tv-fullscreen-z. Use fullscreen="native", or your own { enter, exit }.',
      );
  };

  const showViewport = (on: boolean) => {
    const root = mountPoint.getRootNode() as ShadowRoot | Document;
    if (on) returnFocus = root.activeElement as HTMLElement | null;
    mountPoint.toggleAttribute("data-tv-full", on);
    lock(on && last?.lockPageScroll !== false);
    if (on) warnWhenTrapped();
    if (!on) {
      returnFocus?.focus?.();
      returnFocus = null;
    }
  };

  // Moves the viewer to a display mode by the chosen strategy, and then shows the new mode.
  const apply = async (next: Mode): Promise<void> => {
    const how = strategy();
    if (how === false || next === mode) return;
    if (how === "native") {
      if (next === "fullscreen") await element.requestFullscreen();
      else if (doc.fullscreenElement === element) await doc.exitFullscreen();
      return;
    }
    if (how === "viewport") showViewport(next === "fullscreen");
    else await (next === "fullscreen" ? how.enter : how.exit)({ element });
    mode = next;
    draw();
  };

  const host: ShellHost = {
    copyForAi: (text) => {
      const given = last?.copyForAi;
      if (given !== undefined) return given(text).then(() => "sent" as const, () => "failed" as const);
      return navigator.clipboard.writeText(text).then(
        () => "sent" as const,
        () => "failed" as const,
      );
    },
    async openLink(url) {
      const href = linkOf(url);
      if (href === null) return;
      const given = last?.openLink;
      if (given !== undefined) await given(href);
      else window.open(href, "_blank", "noopener,noreferrer");
    },
    async requestDisplayMode(next) {
      if (!dispatch("displayMode", [next], { value: next }, ["fullscreen-button"]))
        return;
      // A display mode that the developer controls changes only by the prop.
      if (last?.displayMode !== undefined) {
        last.onDisplayModeChange?.(next);
        return;
      }
      await apply(next);
      last?.onDisplayModeChange?.(next);
    },
  };

  display.get = () => mode;
  display.set = (next) => void host.requestDisplayMode(next).catch(() => undefined);
  live.exitOnEscape = () => {
    if (mode !== "fullscreen" || strategy() === "native") return false;
    void host.requestDisplayMode("inline").catch(() => undefined);
    return true;
  };

  // The source of an action is the parts around the element of the input event.
  let clearPath: ReturnType<typeof setTimeout> | undefined;
  const onInputEvent = (event: Event) => {
    const path = event.composedPath();
    const names = partsOnPath(path);
    setEventPath(names, path[0] ?? null);
    clearTimeout(clearPath);
    clearPath = setTimeout(() => setEventPath([], null), 0);
    if (event.type !== "click") return;
    if (!dispatch("press", [], { element: path[0] ?? null }, names)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const INPUT_EVENTS = ["click", "pointerdown", "keydown"] as const;
  for (const name of INPUT_EVENTS)
    mountPoint.addEventListener(name, onInputEvent, true);

  let lastState = "";
  let lastFilters = "";
  let lastDirty = false;
  const stopState = effect(() => {
    void canvasState.value;
    void selection.value;
    void tableLayout.value;
    void editHistory.value;
    void saveState.value;
    void customFilters.value;
    untracked(() => {
      if (last === null) return;
      const state = commands.getState();
      const text = JSON.stringify(state);
      if (text === lastState) return;
      lastState = text;
      last.onStateChange?.(state as never);
      const filters = JSON.stringify([state.filters, state.customFilters]);
      if (filters !== lastFilters) {
        const first = lastFilters === "";
        lastFilters = filters;
        if (!first)
          last.onFiltersChange?.({
            ...(state.filters as object),
            custom: state.customFilters,
          } as never);
      }
      if (state.edits.dirty !== lastDirty) {
        lastDirty = state.edits.dirty;
        last.onDirtyChange?.(lastDirty);
      }
    });
  });

  const draw = () => {
    if (last === null) return;
    const { view } = last;
    const lang: Lang = last.lang ?? langOf(navigator.language);
    const theme = last.mode ?? "light";
    if (view.state !== "data") {
      input = null;
      render(h(Status, { ...view, lang, embedded, theme }), mountPoint);
      return;
    }
    if (input === null || view.payload !== payload || last.canvas !== inputCanvas) {
      // A new theme keeps the chart as it is; new data starts it again.
      start =
        input !== null && view.payload === payload
          ? (settled as typeof start)
          : undefined;
      input = toInput(view.payload, last.canvas);
      inputCanvas = last.canvas;
      payload = view.payload;
    }
    const how = strategy();
    const canFull =
      how === false ? false : how === "native" ? doc.fullscreenEnabled : true;
    render(
      h(App, {
        input,
        lang,
        locale: lang,
        theme: theme as "light",
        host,
        onSelect: (picked: Selection) => last?.onSelect?.(selectionOf(picked)),
        onSettle: (state: unknown, camera: unknown) => {
          settled = { state, camera };
        },
        ...(start === undefined ? {} : { start }),
        embedded,
        displayMode: mode,
        availableDisplayModes: canFull ? ["inline", "fullscreen"] : ["inline"],
      } as never),
      mountPoint,
    );
  };

  const onNative = () => {
    if (strategy() !== "native") return;
    mode = doc.fullscreenElement === element ? "fullscreen" : "inline";
    draw();
  };
  doc.addEventListener("fullscreenchange", onNative);

  return {
    commands,
    show(props) {
      overrideStrings(props.lang ?? langOf(navigator.language), {
        ...DEFAULT_STRINGS,
        ...props.strings,
      });
      setCustom(customOf(props));
      setFamilyLooks(props.familyLooks);
      syncCanvasCustom();
      last = props;
      draw();
      if (props.displayMode !== undefined && props.displayMode !== mode)
        void apply(props.displayMode).catch(() => undefined);
    },
    destroy() {
      doc.removeEventListener("fullscreenchange", onNative);
      for (const name of INPUT_EVENTS)
        mountPoint.removeEventListener(name, onInputEvent, true);
      clearTimeout(clearPath);
      stopState();
      lock(false);
      if (doc.fullscreenElement === element) void doc.exitFullscreen();
      render(null, mountPoint);
      setSlotHost(null);
      live.exitOnEscape = null;
    },
  };
}

function familyCss(looks: Readonly<Record<string, FamilyLook>>): string {
  return setFamilyLooks(looks);
}

export const api: CoreApi = {
  styleText: layered(noTypes ? `${styleText}\n${NO_TYPES_RULE}` : styleText),
  familyCss,
  createViewer,
};

export type { Hex };
