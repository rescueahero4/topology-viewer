import {
  canvasNotice,
  stats,
  type CanvasState,
  type Frontier,
  type Info,
} from "@qdic-topology/engine";
import type { AppInput } from "./App";
import type { NoticeKind } from "./canvas/index";

export type NoticeCase = { code: string; info: Info; retry: boolean };

type Seen = {
  input: AppInput;
  failed: boolean;
  kind: NoticeKind | null;
  state: CanvasState | null;
  drawn: Frontier | null;
};

const FALLBACK = "error-fallback";

type Shown = Extract<AppInput, { ok: true }>;

// why: rule 1 (c) (mockup `emptyCase`, app.js lines 159-165) — the counts of the input, the type
// rows of the state of the last `settle`
function emptyCase(
  input: Shown,
  state: CanvasState | null,
  drawn: Frontier | null,
): NoticeCase | null {
  if (state === null || drawn === null || drawn.nodes.length > 0) return null;
  const { types } = stats(input.model.vocab, state);
  const { records, edgeRecords, skipped } = input.counts;
  const found = canvasNotice({
    rawNodes: records,
    rawEdges: edgeRecords + skipped["dangling-edge"],
    drawn: 0,
    typesTotal: types.length,
    typesOff: types.filter((row) => !row.on).length,
  });
  return found === null ? null : { ...found, retry: false };
}

// why: rule 1, FR-HOST-9, epic questions 19 and 21 — a fatal input, a canvas that could not start
// and an engine error show the fallback; only the transient `zero-size` cause offers "Try again";
// `last-drawn` shows nothing. The engine `noticeText` turns an unknown code into the fallback
export function noticeCase(seen: Seen): NoticeCase | null {
  const { input } = seen;
  if (!input.ok) {
    const info = "info" in input.fatal ? input.fatal.info : undefined;
    return { code: input.fatal.code, info: info ?? {}, retry: false };
  }
  if (seen.failed || seen.kind === "error")
    return { code: FALLBACK, info: {}, retry: false };
  if (seen.kind === "zero-size")
    return { code: FALLBACK, info: {}, retry: true };
  return emptyCase(input, seen.state, seen.drawn);
}
