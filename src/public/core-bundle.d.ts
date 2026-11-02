import type { CoreApi } from "./core";
import type { TopologyProfile } from "../../types/index";

/** Each call makes a new copy of the module state: signals, Preact and the profile. */
export declare function createCore(config: Partial<TopologyProfile>): CoreApi;
