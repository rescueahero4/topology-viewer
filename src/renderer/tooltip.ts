import { pointer } from "d3-selection";
import { renderHooks, type TipInfo } from "./hooks";
import type { SceneEdge, SceneNode } from "./scene";
import type { RendererText } from "./text";

export type Tooltip = {
  showNode(node: SceneNode, event: MouseEvent): void;
  showEdge(
    edge: SceneEdge,
    subject: SceneNode,
    object: SceneNode,
    event: MouseEvent,
  ): void;
  hide(): void;
};

// why: mockup `hoverEdge` (lib/topology.js line 2064) — the edge tooltip sits 8 px above the
// pointer; a node tooltip sits half the node height above it (line 2040)
const EDGE_LIFT = 8;

// why: mockup `hover` (lib/topology.js lines 2032-2035) — the first line that applies, in order
function nodeSub(node: SceneNode, text: RendererText): string {
  if (node.kind === "group") return text.tipGroup(node.count, node.typeLabel);
  if (node.opened > 0) return text.tipOpened(node.sub);
  if (node.more > 0) return text.tipMore(node.sub, node.more);
  if (node.group !== null) return text.tipMember(node.sub);
  return node.sub;
}

// why: SA §11 Untrusted input, STORY-003-02 DA-1 — each line is one `div` with one text node by
// `textContent`; the tooltip is cleared by `replaceChildren()`, never by an HTML sink
export function createTooltip(
  root: HTMLDivElement,
  text: RendererText,
): Tooltip {
  const doc = root.ownerDocument;
  const tip = doc.createElement("div");
  tip.setAttribute("class", "qt-tip");
  root.appendChild(tip);
  const line = (name: string, value: string) => {
    const el = doc.createElement("div");
    el.setAttribute("class", name);
    el.textContent = value;
    return el;
  };
  const slotOf = (name: string) => {
    const slot = doc.createElement("slot");
    slot.setAttribute("name", name);
    return slot;
  };
  // A custom tooltip of the developer, or no tooltip; `null` is the default.
  const custom = (info: TipInfo) => renderHooks.tip?.(info) ?? null;
  const place = (event: MouseEvent, lift: number) => {
    const [x, y] = pointer(event, root);
    // why: STORY-003-02 DA-5 — the position takes finite numbers only
    if (Number.isFinite(x) && Number.isFinite(y - lift)) {
      tip.style.left = `${x}px`;
      tip.style.top = `${y - lift}px`;
    }
    tip.classList.add("qt-on");
  };
  const show = (main: string, sub: string, event: MouseEvent, lift: number) => {
    tip.replaceChildren(line("qt-tip-main", main), line("qt-tip-sub", sub));
    place(event, lift);
  };
  const showCustom = (found: string | false, event: MouseEvent, lift: number) => {
    if (found === false) return;
    tip.replaceChildren(slotOf(found));
    place(event, lift);
  };
  return {
    showNode(node, event) {
      const found = custom({ kind: "node", node });
      if (found !== null) return showCustom(found, event, node.h / 2);
      show(node.fullLabel, nodeSub(node, text), event, node.h / 2);
    },
    showEdge(edge, subject, object, event) {
      const found = custom({ kind: "edge", edge, subject, object });
      if (found !== null) return showCustom(found, event, EDGE_LIFT);
      const main = text.tipEdge(subject.fullLabel, object.fullLabel);
      const sub = text.tipEdgeAction(
        edge.label,
        edge.muted,
        edge.count,
        edge.retired,
      );
      show(main, sub, event, EDGE_LIFT);
    },
    hide() {
      tip.classList.remove("qt-on");
    },
  };
}
