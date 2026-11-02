import type {
  TopologyOptions,
  TopologyViewerHandle,
} from "../../types/index";
import type { CoreView } from "./core";
import { createCore } from "./core-bundle.js";
import { fetchPayload, TopologyLoadError } from "./fetchPayload";

export function mountTopology(
  element: HTMLElement,
  first: TopologyOptions,
): TopologyViewerHandle {
  // Each viewer has its own core, so that two viewers on one page share no state.
  const core = createCore(first.profile ?? {});
  const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(core.styleText);
  root.adoptedStyleSheets = [sheet];
  const mountPoint = element.ownerDocument.createElement("div");
  mountPoint.className = "tv-mount";
  root.replaceChildren(mountPoint);
  const viewer = core.createViewer(
    mountPoint,
    element,
    first.variant ?? "widget",
  );

  let options = first;
  let view: CoreView = { state: "loading" };
  let controller: AbortController | null = null;

  const paint = () => viewer.show({ ...options, view });
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

  load();

  return {
    update(next) {
      const reload = next.data !== options.data || next.url !== options.url;
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
