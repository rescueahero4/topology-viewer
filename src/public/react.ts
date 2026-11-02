import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type {
  TopologyViewerProps,
  TopologyViewerRef,
} from "../../types/react";
import type { TopologyViewerHandle } from "../../types/index";
import { mountTopology } from "./mount";

export { TopologyLoadError } from "./fetchPayload";

const BASE = { display: "block", width: "100%", height: "100%", minHeight: 480 };

export const TopologyViewer = forwardRef<TopologyViewerRef, TopologyViewerProps>(
  function TopologyViewer({ className, style, ...options }, ref) {
    const element = useRef<HTMLDivElement>(null);
    const viewer = useRef<TopologyViewerHandle | null>(null);
    const latest = useRef(options);
    latest.current = options;

    useImperativeHandle(ref, () => ({ reload: () => viewer.current?.reload() }), []);

    useEffect(() => {
      const made = mountTopology(element.current as HTMLDivElement, latest.current);
      viewer.current = made;
      return () => {
        made.destroy();
        viewer.current = null;
      };
    }, []);

    // Runs after each render: `update` loads again only when the source changes.
    useEffect(() => {
      viewer.current?.update(options);
    });

    return createElement("div", {
      ref: element,
      className,
      style: { ...BASE, ...style },
    });
  },
);
