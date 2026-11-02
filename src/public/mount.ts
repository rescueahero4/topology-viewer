import type {
  TopologyOptions,
  TopologyViewerHandle,
} from "../../types/index";
import { createCore } from "./core-bundle.js";
import { fetchPayload, TopologyLoadError } from "./fetchPayload";

function attachStyles(root: ShadowRoot, text: string) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  root.adoptedStyleSheets = [sheet];
}

function sourceKey(o: TopologyOptions) {
  return o.data !== undefined ? ["data", o.data] : ["url", o.url];
}

const sameSource = (a: TopologyOptions, b: TopologyOptions) => {
  const [kindA, valueA] = sourceKey(a);
  const [kindB, valueB] = sourceKey(b);
  return kindA === kindB && valueA === valueB && a.reloadKey === b.reloadKey;
};

export function mountTopology(
  element: HTMLElement,
  first: TopologyOptions,
): TopologyViewerHandle {
  // Each viewer has its own core, so that two viewers on one page share no state.
  const core = createCore(
    first.profile === undefined ? {} : { profile: first.profile },
  );
  const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
  root.replaceChildren();
  attachStyles(root, core.styleText);
  const mountPoint = element.ownerDocument.createElement("div");
  mountPoint.className = "tv-mount";
  root.append(mountPoint);
  const viewer = core.createViewer(
    mountPoint,
    element,
    first.variant ?? "widget",
  );

  let options = first;
  let controller: AbortController | null = null;
  let hasPayload = false;
  type View = Parameters<typeof viewer.show>[0]["view"];
  let view: View = { state: "loading" };

  const paint = () => {
    const { lang, strings, onSelect, onEditsChange, onEditsSave } = options;
    const { onOpenLink, onCopyDetails } = options;
    viewer.show({
      view,
      ...(lang === undefined ? {} : { lang }),
      ...(strings === undefined ? {} : { strings }),
      callbacks: {
        ...(onSelect && { onSelect }),
        ...(onEditsChange && { onEditsChange }),
        ...(onEditsSave && { onEditsSave }),
        ...(onOpenLink && { onOpenLink }),
        ...(onCopyDetails && { onCopyDetails }),
      },
    });
  };

  const showPayload = (payload: unknown) => {
    hasPayload = true;
    view = { state: "data", payload };
    paint();
  };

  const load = () => {
    controller?.abort();
    controller = null;
    if (options.data !== undefined) return showPayload(options.data);
    if (options.url === undefined && options.load === undefined) {
      hasPayload = false;
      view = { state: "empty" };
      return paint();
    }
    const own = new AbortController();
    controller = own;
    // A new load keeps the current chart on the screen until the new payload is there.
    if (!hasPayload) {
      view = { state: "loading" };
      paint();
    }
    options.onLoadStart?.();
    fetchPayload(options, own.signal).then(
      (payload) => {
        if (own.signal.aborted) return;
        showPayload(payload);
        options.onLoad?.(payload);
      },
      (cause: unknown) => {
        if (own.signal.aborted) return;
        const error =
          cause instanceof TopologyLoadError
            ? cause
            : new TopologyLoadError("load", "The load failed.");
        hasPayload = false;
        view = {
          state: "failed",
          kind: error.kind,
          ...(error.status === undefined ? {} : { status: error.status }),
          onRetry: load,
        };
        paint();
        options.onError?.(error);
      },
    );
  };

  load();

  return {
    update(next) {
      const reload = !sameSource(options, next);
      options = next;
      if (reload) load();
      else paint();
    },
    reload: load,
    destroy() {
      controller?.abort();
      viewer.destroy();
      root.replaceChildren();
    },
  };
}
