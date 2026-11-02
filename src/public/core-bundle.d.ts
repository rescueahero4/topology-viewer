import type { CoreApi, CoreConfig } from "./core";

/**
 * `dist/core-bundle.js`: all of the UI in one function. Each call makes a new copy of the module
 * state (signals, Preact, the profile), so that two viewers on one page share nothing.
 */
export declare function createCore(config: CoreConfig): CoreApi;
