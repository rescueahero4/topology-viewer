// `__TV_CONFIG__` is the argument of `createCore` (vite.core.config.ts). The icons of a vocabulary
// come with its preset, so that the core has none.
declare const __TV_CONFIG__: { sprite?: unknown };

export default __TV_CONFIG__.sprite ?? {};
