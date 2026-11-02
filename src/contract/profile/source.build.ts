import neutral from "./neutral.json" with { type: "json" };

// `__TV_CONFIG__` is the argument of `createCore` (vite.core.config.ts).
declare const __TV_CONFIG__: { vocabulary?: unknown };

export const source: unknown = __TV_CONFIG__.vocabulary ?? neutral;
