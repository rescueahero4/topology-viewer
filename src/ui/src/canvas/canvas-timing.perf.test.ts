// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { Hex } from "@qdic-topology/engine";
import { describe, expect, it, vi } from "vitest";
import type { Canvas, CanvasEvent } from "./index";

// why: S28 is a manual measurement with no gate (EPIC-005 owns NF-1); it runs only on request,
// alone after the unit tests (LEARNINGS 24): `CANVAS_TIMING=1 pnpm vitest run --project timing`
const RUN = process.env.CANVAS_TIMING === "1";

// why: STORY-003-04 "Fake clock", build-time item B11 — the motion clock is fake, so each frame
// runs at once; the work of the frames is read from the process clock, which is not faked
vi.useFakeTimers({
  toFake: [
    "performance",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "Date",
  ],
});
vi.resetModules();
const engine = await import("@qdic-topology/engine");
const { profile } = await import("@qdic-topology/contract");
const { generate } = await import("@qdic-topology/fixtures");
const { createCanvas } = await import("./index");

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
HTMLElement.prototype.getBoundingClientRect = () =>
  ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;

const LIGHT = engine.canvasColor("#F4F4F5") as Hex;
const TEXT = {
  groupLabel: (typeLabel: string, count: number) => `${count} ${typeLabel}`,
  collapsed: "Collapsed",
  unknownType: "Unknown",
  canvasName: "Topology canvas",
} as Parameters<typeof createCanvas>[1]["text"];
const RUNS = 10;
const now = () => Number(process.hrtime.bigint()) / 1e6;
const median = (list: number[]) =>
  [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

function modelOf(nodes: number, edges: number, layout?: string) {
  const g = generate.random(nodes, edges, 1);
  const view = { budget: "all", ...(layout === undefined ? {} : { layout }) };
  const r = engine.normalize({ ...g, view }, { now: "2026-10-19" });
  if (!r.ok) throw new Error("fatal");
  const { vocab } = engine.resolveVocab(r.graph, r.payload, profile, LIGHT);
  return {
    graph: r.graph,
    payload: r.payload,
    hash: r.hash,
    vocab,
    canvas: LIGHT,
  };
}

type Times = { first: number; settle: number };
// why: call to the first frame = the call plus the first motion frame; call to settle = the call
// plus every frame until the `settle` event (idle time between frames is not counted)
function timed(canvas: Canvas, call: () => void): Times {
  let settled = false;
  const off = canvas.on("settle", () => (settled = true));
  const start = now();
  call();
  vi.advanceTimersToNextFrame();
  const first = now() - start;
  for (let i = 0; i < 200 && !settled; i++) vi.advanceTimersToNextFrame();
  const settle = now() - start;
  off();
  return { first, settle };
}

const rows: string[] = [];
const report = (name: string, list: Times[]) =>
  rows.push(
    `| ${name} | ${median(list.map((t) => t.first)).toFixed(1)} | ${median(list.map((t) => t.settle)).toFixed(1)} |`,
  );

describe.runIf(RUN)("S28 timing in jsdom (no gate)", () => {
  it.each([
    ["force", undefined],
    ["atomic", "atomic"],
  ])(
    "createCanvas at 500 drawn nodes, %s",
    (name, layout) => {
      const model = modelOf(500, 1000, layout);
      const list: Times[] = [];
      for (let i = 0; i < RUNS; i++) {
        const div = document.createElement("div");
        document.body.appendChild(div);
        const start = now();
        createCanvas(div, { text: TEXT, model });
        const ms = now() - start;
        list.push({ first: ms, settle: ms });
        expect(div.querySelectorAll("g.qt-node")).toHaveLength(500);
        div.remove();
      }
      report(`createCanvas, 500 drawn, ${name}`, list);
    },
    600_000,
  );

  it("steps at 1,999 drawn nodes", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const model = modelOf(2000, 4000);
    const canvas = createCanvas(div, { text: TEXT, model });
    const settles: CanvasEvent["settle"][] = [];
    canvas.on("settle", (e) => settles.push(e));
    await Promise.resolve();
    const ids = settles[0].frontier.nodes
      .filter((n) => "entity" in n)
      .slice(0, 10)
      .map((n) => n.id);
    expect(settles[0].frontier.nodes).toHaveLength(1999);
    const steps: Record<string, Times[]> = {
      hide: [],
      reveal: [],
      restore: [],
      family: [],
    };
    const family = model.vocab.families[0].key;
    for (let i = 0; i < RUNS; i++) {
      steps.hide.push(timed(canvas, () => canvas.hide(ids)));
      steps.reveal.push(
        timed(canvas, () => canvas.reveal(ids.map((id) => id.slice(2)))),
      );
      canvas.hide([ids[0]]);
      vi.advanceTimersByTime(3000);
      steps.restore.push(timed(canvas, () => canvas.restore([ids[0]])));
      const on = i % 2 === 1;
      steps.family.push(
        timed(canvas, () =>
          canvas.setFilters({ kind: "toggleFamily", family, on }),
        ),
      );
    }
    report("hide of 10 ids (1,989 drawn)", steps.hide);
    report("reveal of 10 ids (bulk Show, 1,999 drawn)", steps.reveal);
    report("restore of 1 key (local step)", steps.restore);
    report("toggleFamily", steps.family);
    process.stdout.write(
      `\n| Step | Call to first frame (ms) | Call to settle (ms) |\n|---|---|---|\n${rows.join("\n")}\n`,
    );
  }, 600_000);
});
