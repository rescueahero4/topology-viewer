import { effect } from "@preact/signals";
import type { ComponentChildren, ComponentType, VNode } from "preact";
import { Component, h } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { commands } from "./commands";
import { custom, partConfig, peekConfig, type PartItem } from "./custom";

// The custom content of a part lives outside the Shadow DOM, as a child of the host element, and
// shows through a native `<slot>` at its place in the shell. So the CSS of the page and the context
// of the framework of the developer still reach it.

export type SlotEntry = {
  name: string;
  part: string;
  place: string;
  ctx: Readonly<Record<string, unknown>>;
};

export type SlotHost = {
  publish(entry: SlotEntry): void;
  remove(name: string): void;
};

let slotHost: SlotHost | null = null;
let made = 0;

export function setSlotHost(next: SlotHost | null): void {
  slotHost = next;
}

export const newSlotName = () => `tv-slot-${++made}`;

/** For the parts that the renderer draws: the same bridge, with no component. */
export function publishSlot(entry: SlotEntry): void {
  slotHost?.publish(entry);
}

export function removeSlot(name: string): void {
  slotHost?.remove(name);
}

type SlotProps = { part: string; place: string; ctx: Record<string, unknown> };

/** Takes no room of its own: a `<slot>` has `display: contents`. */
export function Slot({ part, place, ctx }: SlotProps): VNode<any> {
  const [name] = useState(newSlotName);
  useLayoutEffect(() => {
    slotHost?.publish({
      name,
      part,
      place,
      ctx: { ...ctx, commands },
    });
  });
  useLayoutEffect(() => () => slotHost?.remove(name), [name]);
  return h("slot", { name });
}

/**
 * Makes a component a public part: `hidden`, `before`, `after` and `render` work on it. With no
 * customization for the part, this adds no element.
 *
 * This is a class that reads no signal in its render. `@preact/signals` skips a component that read a
 * signal or has hook state when its props are the same, and the shell measures its elements right
 * after the render of a parent, so a wrapper must always render with its parent. A new customization
 * reaches it by the subscription instead.
 */
export function extendable<P extends object>(
  id: string,
  View: ComponentType<P>,
  ctxOf?: (props: P) => Record<string, unknown>,
): ComponentType<P> {
  return class Wrapped extends Component<P> {
    static override displayName = id;
    stop: (() => void) | undefined;

    override componentDidMount() {
      let first = true;
      this.stop = effect(() => {
        void custom.value;
        if (first) first = false;
        else this.forceUpdate();
      });
    }

    override componentWillUnmount() {
      this.stop?.();
    }

    override render(props: P) {
      const config = peekConfig(id);
      if (config === undefined) return h(View, props);
      if (config.hidden === true) return null;
      const { before, after, render: given, match } = config;
      if (before === undefined && after === undefined && given === undefined)
        return h(View, props);
      const ctx = ctxOf?.(props) ?? {};
      const render = match === undefined || match(ctx) ? given : undefined;
      return (
        <>
          {before !== undefined && <Slot part={id} place="before" ctx={ctx} />}
          {render === undefined ? (
            h(View, props)
          ) : (
            <Slot part={id} place="render" ctx={ctx} />
          )}
          {after !== undefined && <Slot part={id} place="after" ctx={ctx} />}
        </>
      );
    }
  };
}

type ContentProps = {
  part: string;
  ctx: () => Record<string, unknown>;
  children?: ComponentChildren;
};

/**
 * The same, for a part that must keep its element, such as a table cell or a list row: the custom
 * content goes inside the element.
 */
export function Content({ part, ctx, children }: ContentProps) {
  const config = partConfig(part);
  if (config === undefined) return <>{children}</>;
  const { before, after, render: given, match } = config;
  if (before === undefined && after === undefined && given === undefined)
    return <>{children}</>;
  const data = ctx();
  const render = match === undefined || match(data) ? given : undefined;
  return (
    <>
      {before !== undefined && <Slot part={part} place="before" ctx={data} />}
      {render === undefined ? (
        children
      ) : (
        <Slot part={part} place="render" ctx={data} />
      )}
      {after !== undefined && <Slot part={part} place="after" ctx={data} />}
    </>
  );
}

export type DefaultItem = { id: string; node: ComponentChildren };

const itemId = (item: PartItem) => (typeof item === "string" ? item : item.id);

/**
 * The children of a container part: the default order, or the `items` of the developer, which can
 * reorder them, leave some out, and add new ones.
 */
export function itemsOf(
  part: string,
  defaults: readonly DefaultItem[],
  ctx: Record<string, unknown> = {},
): ComponentChildren[] {
  const items = partConfig(part)?.items;
  if (items === undefined)
    return defaults
      .filter((item) => partConfig(item.id)?.hidden !== true)
      .map((item) => item.node);
  return items.map((item) => {
    if (typeof item === "string")
      return defaults.find((one) => one.id === item)?.node ?? null;
    return (
      <Slot
        key={itemId(item)}
        part={part}
        place={`item:${item.id}`}
        ctx={ctx}
      />
    );
  });
}
