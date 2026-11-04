import type {
  TopologyOptions,
  TopologyViewerHandle,
} from "../../types/index";
import type { CoreView } from "./core";
import { createCore } from "./core-bundle.js";
import { fetchPayload, TopologyLoadError } from "./fetchPayload";
import { resolveProfile } from "./profile";
import { createSlots, type SlotEntry } from "./slots";
import { followPageStyles } from "./pageStyles";
import { canvasOf, themeCss, themeOf, useSystemMode } from "./theme";

// Only for the React entry: it renders the custom content of the parts itself.
export type MountInternals = {
  __renderSlots?: (entries: readonly SlotEntry[]) => void;
};

const sheetOf = (text: string) => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
};

function extraSheets(given: TopologyOptions["styles"]): CSSStyleSheet[] {
  if (given === undefined) return [];
  return (Array.isArray(given) ? given : [given]).map((one) =>
    typeof one === "string" ? sheetOf(one) : one,
  );
}

export function mountTopology(
  element: HTMLElement,
  first: TopologyOptions & MountInternals,
): TopologyViewerHandle {
  // Each viewer has its own core, so that two viewers on one page share no state.
  const core = createCore(resolveProfile(first.profile) ?? {});
  const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
  const coreSheet = sheetOf(core.styleText);
  const themeSheet = new CSSStyleSheet();
  const mountPoint = element.ownerDocument.createElement("div");
  mountPoint.className = "tv-mount";
  root.replaceChildren(mountPoint);

  let options = first;
  let pageSheets: readonly CSSStyleSheet[] = [];
  let stylesGiven: TopologyOptions["styles"] = undefined;
  let stylesMade: CSSStyleSheet[] = [];

  const adopt = () => {
    root.adoptedStyleSheets = [coreSheet, ...pageSheets, themeSheet, ...stylesMade];
  };
  const stopPage = followPageStyles(
    element,
    root,
    () => options.pageStyles === true,
    (sheets) => {
      pageSheets = sheets;
      adopt();
    },
  );

  const slots = createSlots(element, () => options);
  const viewer = core.createViewer(
    mountPoint,
    element,
    options.variant ?? "page",
    slots,
  );
  const stopSystem = useSystemMode(element.ownerDocument, () => {
    syncTheme();
    paint();
  });

  let themeText = "";
  function syncTheme() {
    const text = [
      themeCss(themeOf(options, element.ownerDocument)),
      core.familyCss(options.familyLooks ?? {}),
    ].join("\n");
    if (text !== themeText) {
      themeText = text;
      themeSheet.replaceSync(text);
    }
    if (options.styles !== stylesGiven) {
      stylesGiven = options.styles;
      stylesMade = extraSheets(stylesGiven);
      adopt();
    }
  }

  let view: CoreView = { state: "loading" };
  let controller: AbortController | null = null;

  function paint() {
    const theme = themeOf(options, element.ownerDocument);
    viewer.show({
      ...options,
      view,
      canvas: canvasOf(theme.tokens, element),
      mode: theme.name,
    });
  }
  const show = (next: CoreView) => {
    view = next;
    paint();
  };

  const load = () => {
    controller?.abort();
    if (options.data !== undefined)
      return show({ state: "data", payload: options.data });
    if (options.url === undefined && options.load === undefined)
      return show({ state: "empty" });
    const own = new AbortController();
    controller = own;
    // A new load keeps the current chart on the screen until the new payload is there.
    if (view.state !== "data") show({ state: "loading" });
    fetchPayload(options, own.signal).then(
      (payload) => {
        if (!own.signal.aborted) show({ state: "data", payload });
      },
      (cause: unknown) => {
        if (own.signal.aborted) return;
        const error =
          cause instanceof TopologyLoadError
            ? cause
            : new TopologyLoadError("load");
        show({
          state: "failed",
          kind: error.kind,
          ...(error.status === undefined ? {} : { status: error.status }),
          onRetry: load,
        });
        options.onError?.(error);
      },
    );
  };

  syncTheme();
  adopt();
  load();

  return {
    commands: viewer.commands,
    update(next) {
      const reload = next.data !== options.data || next.url !== options.url;
      options = { ...next, ...internalsOf(first, next as MountInternals) };
      syncTheme();
      if (reload) load();
      else paint();
    },
    reload: load,
    destroy() {
      controller?.abort();
      stopPage();
      stopSystem();
      viewer.destroy();
      slots.destroy();
      root.replaceChildren();
      root.adoptedStyleSheets = [];
    },
  };
}

const internalsOf = (
  first: MountInternals,
  next: MountInternals,
): MountInternals => {
  const renderSlots = next.__renderSlots ?? first.__renderSlots;
  return renderSlots === undefined ? {} : { __renderSlots: renderSlots };
};
