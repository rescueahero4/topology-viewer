import type {
  TopologyLoadErrorKind,
  TopologyOptions,
} from "../../types/index";

export class TopologyLoadError extends Error {
  readonly kind: TopologyLoadErrorKind;
  readonly status?: number;

  constructor(kind: TopologyLoadErrorKind, message: string, status?: number) {
    super(message);
    this.name = "TopologyLoadError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

type Source = Pick<TopologyOptions, "url" | "requestInit" | "load" | "select">;

// The server text never goes into the message: the viewer shows only the kind and the status.
async function fromUrl(
  url: string,
  init: RequestInit | undefined,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, { ...init, signal }).catch(
    (cause: unknown) => {
      if (signal.aborted) throw cause;
      throw new TopologyLoadError("network", "The server cannot be reached.");
    },
  );
  if (!response.ok)
    throw new TopologyLoadError(
      "http",
      `The server answered with status ${response.status}.`,
      response.status,
    );
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TopologyLoadError("parse", "The server answer is not JSON.");
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
    throw new TopologyLoadError("load", "The load function failed.");
  }
}

/** Gets one payload from the source. The caller makes sure that a source exists. */
export async function fetchPayload(
  source: Source,
  signal: AbortSignal,
): Promise<unknown> {
  const { url, requestInit, load, select } = source;
  const raw =
    url !== undefined
      ? await fromUrl(url, requestInit, signal)
      : await fromLoad(load as NonNullable<Source["load"]>, signal);
  if (select === undefined) return raw;
  try {
    return select(raw);
  } catch {
    throw new TopologyLoadError("select", "The select function failed.");
  }
}
