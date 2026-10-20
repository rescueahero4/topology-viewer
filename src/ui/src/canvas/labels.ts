import { LABEL_CHARS } from "@qdic-topology/engine";

// why: TL-13 — the PRD example `ANALYTICS.PR…_DAILY` keeps head and tail at 2 : 1, so the 21
// clusters next to the "…" split 14 : 7
const HEAD = 14;
const TAIL = LABEL_CHARS - 1 - HEAD;

// why: NF-10 — extended grapheme clusters (UAX #29) do not depend on the locale
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// why: PRD FR-CANVAS-19, TL-13 — a canvas name of more than 22 grapheme clusters keeps its first
// 14 and its last 7 clusters, so no cut splits a surrogate pair, a ZWJ sequence or a letter and its
// mark (NF-10); a text of at most 22 UTF-16 units has at most 22 clusters. "…" is a symbol, not UI
// text (it replaces the end cut of mockup `truncate`, lib/topology.js lines 322-325)
export function middleCut(label: string): string {
  if (label.length <= LABEL_CHARS) return label;
  const clusters = Array.from(graphemes.segment(label), (s) => s.segment);
  if (clusters.length <= LABEL_CHARS) return label;
  return `${clusters.slice(0, HEAD).join("")}…${clusters.slice(-TAIL).join("")}`;
}
