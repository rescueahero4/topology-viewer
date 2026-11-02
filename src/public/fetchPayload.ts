import type { TopologyOptions } from "../../types/index";

export class TopologyLoadError extends Error {
  readonly kind: "network" | "http" | "parse" | "load";
  readonly status?: number;

  constructor(kind: TopologyLoadError["kind"], status?: number) {
    super(status === undefined ? kind : `${kind} ${status}`);
    this.name = "TopologyLoadError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

// The server text never goes into the error: a server answer stays out of the interface.
async function fromUrl(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal }).catch((cause: unknown) => {
    if (signal.aborted) throw cause;
    throw new TopologyLoadError("network");
  });
  if (!response.ok) throw new TopologyLoadError("http", response.status);
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TopologyLoadError("parse");
  }
}

async function fromLoad(
  load: NonNullable<TopologyOptions["load"]>,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    return await load(signal);
  } catch (cause) {
    if (signal.aborted || cause instanceof TopologyLoadError) throw cause;
    throw new TopologyLoadError("load");
  }
}

export function fetchPayload(
  { url, load }: Pick<TopologyOptions, "url" | "load">,
  signal: AbortSignal,
): Promise<unknown> {
  return url !== undefined
    ? fromUrl(url, signal)
    : fromLoad(load as NonNullable<TopologyOptions["load"]>, signal);
}
