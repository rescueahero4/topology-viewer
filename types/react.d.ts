import type { CSSProperties, ForwardRefExoticComponent, RefAttributes } from "react";
import type { TopologyOptions } from "./index";

export type * from "./index";

export type TopologyViewerProps = TopologyOptions & {
  className?: string;
  /** Default: `width: 100%`, `height: 100%`, `min-height: 480px`. */
  style?: CSSProperties;
};

export type TopologyViewerRef = {
  /** Loads again from the current source. */
  reload(): void;
};

export declare const TopologyViewer: ForwardRefExoticComponent<
  TopologyViewerProps & RefAttributes<TopologyViewerRef>
>;
