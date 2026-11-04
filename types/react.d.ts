import type {
  CSSProperties,
  ForwardRefExoticComponent,
  RefAttributes,
} from "react";
import type {
  TopologyCommands,
  TopologyOptions,
  TopologyProfile,
  TopologyProfileInput,
} from "./index";

export type * from "./index";

export type TopologyViewerProps = TopologyOptions & {
  className?: string;
  style?: CSSProperties;
};

export type TopologyViewerRef = { reload(): void } & TopologyCommands;

export type TopologyViewerPreset = Partial<TopologyViewerProps>;

export declare const TopologyViewer: ForwardRefExoticComponent<
  TopologyViewerProps & RefAttributes<TopologyViewerRef>
>;

/** A viewer with these options as its defaults, for use all through a project. Props win. */
export declare function createTopologyViewer(
  preset: TopologyViewerPreset,
): ForwardRefExoticComponent<TopologyViewerProps & RefAttributes<TopologyViewerRef>>;

export declare function defineProfile(input: TopologyProfileInput): TopologyProfile;
export declare const neutralProfile: TopologyProfile;
export declare function mergeOptions<T extends TopologyOptions>(
  ...all: readonly (Partial<T> | undefined)[]
): T;
