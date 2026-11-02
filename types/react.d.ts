import type {
  CSSProperties,
  ForwardRefExoticComponent,
  RefAttributes,
} from "react";
import type { TopologyOptions } from "./index";

export type * from "./index";

export type TopologyViewerProps = TopologyOptions & {
  className?: string;
  style?: CSSProperties;
};

export type TopologyViewerRef = { reload(): void };

export declare const TopologyViewer: ForwardRefExoticComponent<
  TopologyViewerProps & RefAttributes<TopologyViewerRef>
>;
