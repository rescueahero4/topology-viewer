// This must be the first import: it changes zod before the other modules make their schemas.
import "./zodConfig";
import { profile } from "#contract";
import { entityOfDrawnId, type Lang, type Selection } from "#engine";
import {
  App,
  langOf,
  linkOf,
  overrideStrings,
  setKeyScope,
  type AppInput,
  type ShellHost,
} from "#ui";
import { effect } from "@preact/signals";
import { h, render } from "preact";
import type {
  TopologyEdits,
  TopologyLoadErrorKind,
  TopologySelection,
} from "../../types/index";
import { editedGraph, editHistory, editStep } from "../ui/state";
import { Status } from "./Status";
import { NO_TYPES_RULE, styleText } from "./styles";
import { toInput } from "./toInput";

const noTypes = Object.keys(profile.nodeTypes).length === 0;
// A profile with no node types makes every type "custom", so that group name says nothing.
const DEFAULT_STRINGS: Record<string, string> = noTypes
  ? { "group.Custom": "" }
  : {};

export type CoreConfig = { profile?: unknown };

export type CoreCallbacks = {
  onSelect?: (selection: TopologySelection) => void;
  onEditsChange?: (edits: TopologyEdits) => void;
  onEditsSave?: (edits: TopologyEdits) => void;
  onOpenLink?: (url: string) => void;
  onCopyDetails?: (text: string) => void | boolean | Promise<void | boolean>;
};

export type CoreView =
  | { state: "loading" }
  | { state: "empty" }
  | {
      state: "failed";
      kind: TopologyLoadErrorKind;
      status?: number;
      onRetry: () => void;
    }
  | { state: "data"; payload: unknown };

export type CoreProps = {
  view: CoreView;
  lang?: "en" | "ja";
  strings?: Record<string, string>;
  callbacks: CoreCallbacks;
};

export type CoreViewer = {
  show(props: CoreProps): void;
  destroy(): void;
};

export type CoreApi = {
  styleText: string;
  createViewer(
    mountPoint: HTMLElement,
    hostElement: HTMLElement,
    variant: "widget" | "page",
  ): CoreViewer;
};

// The kinds of the engine are plain strings of the same shape as the public types.
function changesOf(): TopologyEdits {
  const { history } = editHistory.peek();
  return {
    changes: history
      .active()
      .flatMap((edit) => edit.changes) as TopologyEdits["changes"],
    unsaved: history.dirty(),
  };
}

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

async function copyText(text: string): Promise<"sent" | "failed"> {
  try {
    await navigator.clipboard.writeText(text);
    return "sent";
  } catch {
    return "failed";
  }
}

function hostOf(
  hostElement: HTMLElement,
  callbacks: () => CoreCallbacks,
): ShellHost {
  return {
    async copyForAi(text) {
      const own = callbacks().onCopyDetails;
      if (own === undefined) return copyText(text);
      return (await own(text)) === false ? "failed" : "sent";
    },
    async openLink(url) {
      const href = linkOf(url);
      if (href === null) return;
      const own = callbacks().onOpenLink;
      if (own !== undefined) own(href);
      else window.open(href, "_blank", "noopener,noreferrer");
    },
    async requestDisplayMode(mode) {
      const doc = hostElement.ownerDocument;
      if (mode === "fullscreen") await hostElement.requestFullscreen();
      else if (doc.fullscreenElement === hostElement)
        await doc.exitFullscreen();
    },
  };
}

function viewerApi(
  mountPoint: HTMLElement,
  hostElement: HTMLElement,
  variant: "widget" | "page",
): CoreViewer {
  const doc = hostElement.ownerDocument;
  const embedded = variant === "widget";
  let last: CoreProps | null = null;
  let shownPayload: unknown;
  let input: AppInput | null = null;
  const callbacks = () => last?.callbacks ?? {};
  const host = hostOf(hostElement, callbacks);

  // A shortcut of the viewer works only while the pointer or the focus is in the viewer. The page
  // around it keeps its own keys.
  setKeyScope(
    (event) =>
      event.composedPath().includes(hostElement) ||
      hostElement.matches(":hover"),
  );

  const stopEdits = effect(() => {
    const step = editStep.value;
    if (step === null) return;
    const edits = changesOf();
    callbacks().onEditsChange?.(edits);
    if (step.kind === "saved") callbacks().onEditsSave?.(edits);
  });

  const draw = () => {
    if (last === null) return;
    const { view } = last;
    const lang: Lang = last.lang ?? langOf(navigator.language);
    if (view.state !== "data") {
      input = null;
      shownPayload = undefined;
      render(h(Status, { ...view, lang, embedded }), mountPoint);
      return;
    }
    if (input === null || view.payload !== shownPayload) {
      input = toInput(view.payload);
      shownPayload = view.payload;
    }
    const full = doc.fullscreenElement === hostElement;
    render(
      h(App, {
        input,
        lang,
        locale: lang,
        theme: "light",
        host,
        onSelect: (selection: Selection) =>
          callbacks().onSelect?.(selectionOf(selection)),
        ...(embedded
          ? {
              embedded: true,
              displayMode: full ? "fullscreen" : "inline",
              availableDisplayModes: doc.fullscreenEnabled
                ? ["inline", "fullscreen"]
                : ["inline"],
            }
          : {}),
      } as Parameters<typeof App>[0]),
      mountPoint,
    );
  };

  doc.addEventListener("fullscreenchange", draw);

  return {
    show(props) {
      overrideStrings(props.lang ?? langOf(navigator.language), {
        ...DEFAULT_STRINGS,
        ...props.strings,
      });
      last = props;
      draw();
    },
    destroy() {
      doc.removeEventListener("fullscreenchange", draw);
      stopEdits();
      if (doc.fullscreenElement === hostElement) void doc.exitFullscreen();
      render(null, mountPoint);
    },
  };
}

export const api: CoreApi = {
  styleText: noTypes ? `${styleText}\n${NO_TYPES_RULE}` : styleText,
  createViewer: viewerApi,
};
