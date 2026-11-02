import type { RendererText } from "#renderer";
import { createCanvas, type Canvas, type CanvasModel } from "./index";

// why: S29 (browser, pending-human, TL-6) — the S28 steps on the dev harness; never exported or
// bundled. Only this file and `harness.ts` read `performance.now()` (Security notes "Harness")
export type Models = {
  force: CanvasModel;
  atomic: CanvasModel;
  big: CanvasModel;
};

const RUNS = 10;

const median = (list: number[]) =>
  [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

// why: the first motion frame is in the DOM when the call returns (frame 0), so "call to return"
// is the work before the browser can paint it; "call to settle" also holds the motion time
type Times = [ret: number, settle: number];

function settled(canvas: Canvas): Promise<number> {
  return new Promise((resolve) => {
    const off = canvas.on("settle", () => {
      off();
      resolve(performance.now());
    });
  });
}

async function timed(canvas: Canvas, call: () => void): Promise<Times> {
  const done = settled(canvas);
  const start = performance.now();
  call();
  const ret = performance.now() - start;
  return [ret, (await done) - start];
}

function row(name: string, list: Times[]): string {
  const ret = median(list.map((t) => t[0])).toFixed(1);
  const settle = median(list.map((t) => t[1])).toFixed(1);
  return `| ${name} | ${ret} | ${settle} |`;
}

async function first(
  host: HTMLElement,
  text: RendererText,
  model: CanvasModel,
) {
  const list: Times[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const canvas = createCanvas(host, { text, model });
    const ret = performance.now() - start;
    list.push([ret, (await settled(canvas)) - start]);
  }
  return list;
}

async function steps(
  host: HTMLElement,
  text: RendererText,
  model: CanvasModel,
) {
  const canvas = createCanvas(host, { text, model });
  const boot = await new Promise<string[]>((resolve) => {
    const off = canvas.on("settle", (e) => {
      off();
      resolve(e.frontier.nodes.filter((n) => "entity" in n).map((n) => n.id));
    });
  });
  const ids = boot.slice(0, 10);
  const family = model.vocab.families[0].key;
  const out: Record<string, Times[]> = {
    hide: [],
    reveal: [],
    restore: [],
    family: [],
  };
  for (let i = 0; i < RUNS; i++) {
    out.hide.push(await timed(canvas, () => canvas.hide(ids)));
    const path = ids.map((id) => id.slice(2));
    out.reveal.push(await timed(canvas, () => canvas.reveal(path)));
    await timed(canvas, () => canvas.hide([ids[0]]));
    out.restore.push(await timed(canvas, () => canvas.restore([ids[0]])));
    const on = i % 2 === 1;
    const toggle = { kind: "toggleFamily", family, on } as const;
    out.family.push(await timed(canvas, () => canvas.setFilters(toggle)));
  }
  return out;
}

export async function measure(
  host: HTMLElement,
  text: RendererText,
  models: Models,
  line: (text: string) => void,
): Promise<void> {
  line("| Step | Call to return (ms) | Call to settle (ms) |");
  line(
    row(
      "createCanvas, 500 drawn, force",
      await first(host, text, models.force),
    ),
  );
  line(
    row(
      "createCanvas, 500 drawn, atomic",
      await first(host, text, models.atomic),
    ),
  );
  const big = await steps(host, text, models.big);
  line(row("hide of 10 ids (1,989 drawn)", big.hide));
  line(row("reveal of 10 ids (bulk Show, 1,999 drawn)", big.reveal));
  line(row("restore of 1 key (local step)", big.restore));
  line(row("toggleFamily", big.family));
}
