import type { TopologyOptions } from "../../types/index";

type Parts = NonNullable<TopologyOptions["parts"]>;

function mergeParts(base?: Parts, more?: Parts): Parts | undefined {
  if (more === undefined) return base;
  if (base === undefined) return more;
  const out: Record<string, unknown> = { ...base };
  for (const [id, part] of Object.entries(more)) {
    const before = (Object.hasOwn(base, id) ? base[id] : undefined) as
      | { options?: object; on?: object }
      | undefined;
    const now = part as { options?: object; on?: object };
    out[id] =
      before === undefined
        ? part
        : {
            ...before,
            ...now,
            options: { ...before.options, ...now.options },
            on: { ...before.on, ...now.on },
          };
  }
  return out as Parts;
}

/** Later options win; `parts`, `themes` and `theme` merge by key, so a preset stays a base to extend. */
export function mergeOptions<T extends TopologyOptions>(
  ...all: readonly (Partial<T> | undefined)[]
): T {
  let out = {} as T;
  for (const next of all) {
    if (next === undefined) continue;
    const parts = mergeParts(out.parts, next.parts);
    const theme =
      out.theme === undefined && next.theme === undefined
        ? undefined
        : { ...out.theme, ...next.theme };
    const themes =
      out.themes === undefined && next.themes === undefined
        ? undefined
        : { ...out.themes, ...next.themes };
    out = {
      ...out,
      ...next,
      ...(parts === undefined ? {} : { parts }),
      ...(theme === undefined ? {} : { theme }),
      ...(themes === undefined ? {} : { themes }),
    };
  }
  return out;
}
