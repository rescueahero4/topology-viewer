import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  TopologyViewerPreset,
  TopologyViewerProps,
  TopologyViewerRef,
} from "../../types/react";
import type { TopologyCommands, TopologyViewerHandle } from "../../types/index";
import { mergeOptions } from "./merge";
import { mountTopology } from "./mount";
import { contentOf, type SlotEntry } from "./slots";

export { TopologyLoadError } from "./fetchPayload";
export { defineProfile, neutralProfile } from "./profile";
export { mergeOptions } from "./merge";

const BASE = { display: "block", width: "100%", height: "100%", minHeight: 480 };

// One component for each slot, so that a hook in the function of the developer has a stable home.
function SlotBody({
  content,
  ctx,
}: {
  content: unknown;
  ctx: Readonly<Record<string, unknown>>;
}) {
  return (typeof content === "function" ? content(ctx) : content) as ReactNode;
}

export const TopologyViewer = forwardRef<TopologyViewerRef, TopologyViewerProps>(
  function TopologyViewer({ className, style, ...options }, ref) {
    const element = useRef<HTMLDivElement>(null);
    const viewer = useRef<TopologyViewerHandle | null>(null);
    const [slots, setSlots] = useState<readonly SlotEntry[]>([]);
    const latest = useRef(options);
    latest.current = options;

    useImperativeHandle(
      ref,
      () =>
        new Proxy({} as TopologyViewerRef, {
          get(_, name) {
            if (name === "reload") return () => viewer.current?.reload();
            return (...args: unknown[]) => {
              const command = viewer.current?.commands[name as keyof TopologyCommands];
              return (command as ((...a: unknown[]) => unknown) | undefined)?.(...args);
            };
          },
        }),
      [],
    );

    useEffect(() => {
      const made = mountTopology(element.current as HTMLDivElement, {
        ...latest.current,
        __renderSlots: setSlots,
      } as never);
      viewer.current = made;
      return () => {
        made.destroy();
        viewer.current = null;
        setSlots([]);
      };
    }, []);

    // Runs after each render: `update` loads again only when the source changes.
    useEffect(() => {
      viewer.current?.update(options);
    });

    // The custom content is a child of the host, in this React tree, so it keeps the React context of
    // the page. Each child shows at its place through a native slot.
    return createElement(
      "div",
      {
        ref: element,
        className,
        style: { ...BASE, ...style },
      },
      slots.map((entry) =>
        createElement(
          "div",
          { key: entry.name, slot: entry.name, style: { display: "contents" } },
          createElement(SlotBody, {
            content: contentOf(options.parts, entry.part, entry.place),
            ctx: entry.ctx,
          }),
        ),
      ),
    );
  },
);

/** A viewer with these options as its defaults, for use all through a project. */
export function createTopologyViewer(preset: TopologyViewerPreset) {
  const Preset = forwardRef<TopologyViewerRef, TopologyViewerProps>(
    function PresetViewer(props, ref) {
      return createElement(TopologyViewer, {
        ...mergeOptions<TopologyViewerProps>(preset, props),
        ref,
      });
    },
  );
  return Preset;
}
