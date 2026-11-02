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
  TopologyCellChange,
  TopologyLoadError,
  TopologyOptions,
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

export type CoreView =
  | { state: "loading" | "empty" }
  | {
      state: "failed";
      kind: TopologyLoadError["kind"];
      status?: number;
      onRetry: () => void;
    }
  | { state: "data"; payload: unknown };

export type CoreProps = Pick<
  TopologyOptions,
  "lang" | "strings" | "onSelect" | "onSave"
> & { view: CoreView };

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

function hostOf(element: HTMLElement): ShellHost {
  const doc = element.ownerDocument;
  return {
    copyForAi: (text) =>
      navigator.clipboard.writeText(text).then(
        () => "sent" as const,
        () => "failed" as const,
      ),
    async openLink(url) {
      const href = linkOf(url);
      if (href !== null) window.open(href, "_blank", "noopener,noreferrer");
    },
    async requestDisplayMode(mode) {
      if (mode === "fullscreen") await element.requestFullscreen();
      else if (doc.fullscreenElement === element) await doc.exitFullscreen();
    },
  };
}

function createViewer(
  mountPoint: HTMLElement,
  element: HTMLElement,
  variant: "widget" | "page",
): CoreViewer {
  const doc = element.ownerDocument;
  const embedded = variant === "widget";
  const host = hostOf(element);
  let last: CoreProps | null = null;
  let payload: unknown;
  let input: AppInput | null = null;

  // A shortcut works only while the pointer or the focus is in the viewer.
  setKeyScope(
    (event) => event.composedPath().includes(element) || element.matches(":hover"),
  );

  const stopEdits = effect(() => {
    if (editStep.value?.kind !== "saved") return;
    const changes = editHistory
      .peek()
      .history.active()
      .flatMap((edit) => edit.changes);
    last?.onSave?.(changes as readonly TopologyCellChange[]);
  });

  const draw = () => {
    if (last === null) return;
    const { view } = last;
    const lang: Lang = last.lang ?? langOf(navigator.language);
    if (view.state !== "data") {
      input = null;
      render(h(Status, { ...view, lang, embedded }), mountPoint);
      return;
    }
    if (input === null || view.payload !== payload) {
      input = toInput(view.payload);
      payload = view.payload;
    }
    const full = doc.fullscreenElement === element;
    render(
      h(App, {
        input,
        lang,
        locale: lang,
        theme: "light",
        host,
        onSelect: (selection: Selection) =>
          last?.onSelect?.(selectionOf(selection)),
        embedded,
        displayMode: full ? "fullscreen" : "inline",
        availableDisplayModes: doc.fullscreenEnabled
          ? ["inline", "fullscreen"]
          : ["inline"],
      }),
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
      if (doc.fullscreenElement === element) void doc.exitFullscreen();
      render(null, mountPoint);
    },
  };
}

export const api: CoreApi = {
  styleText: noTypes ? `${styleText}\n${NO_TYPES_RULE}` : styleText,
  createViewer,
};
