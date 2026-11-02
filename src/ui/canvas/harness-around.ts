import type { AroundInfo } from "#engine";
import type { Canvas } from "./index";

// why: S18 — the harness part of Group around root for the QA browser checks; never exported or
// bundled. Security build-time item s4 — it imports no fixture and no contract: `harness.ts`
// gives it the canvases. Its labels are dev text, not product text (P4-1)
export type AroundHost = {
  bar: HTMLElement;
  canvas(): Canvas | null;
  grouped(): boolean;
  fresh(fixture: string): Canvas | null;
};

// why: Security notes "Harness", S21 (c) — `id`, `label` and `type` are model strings, so they go
// into one element by `textContent` only: no child element, no attribute, no `innerHTML`
export function showAround(el: HTMLElement, info: AroundInfo | null): void {
  el.textContent =
    info === null
      ? ""
      : `grouped around ${info.id}; label ${info.label ?? "none"}; type ${info.type ?? "none"}; shown ${info.shown}, total ${info.total}`;
}

type Exit = {
  name: string;
  root?: string;
  given?: (c: Canvas) => void;
  call: (c: Canvas, host: AroundHost) => void;
};

const ROOT = "e:t_FCT_REVENUE";
const OFF = (type: string) =>
  ({ kind: "toggleType", type, on: false }) as const;

// why: S18 — one button per exit with its Given on `s-access` (S5, S6 S17, S7)
const EXITS: Exit[] = [
  { name: "1 toggle", call: (c) => c.groupAroundRoot(false) },
  { name: "2 pill", call: (c) => c.groupAroundRoot(false) },
  { name: "3 focus ug_exec", call: (c) => c.focus("ug_exec") },
  {
    name: "4 type user_group off",
    call: (c) => c.setFilters(OFF("user_group")),
  },
  {
    name: "5 Show all types",
    given: (c) => c.setFilters(OFF("user")),
    call: (c) => c.setFilters({ kind: "showAllTypes" }),
  },
  {
    name: "6 Grouping 5",
    call: (c) => c.setFilters({ kind: "grouping", grouping: 5 }),
  },
  {
    name: "7 restore e:u_7",
    given: (c) => c.hide(["e:u_7"]),
    call: (c) => c.restore(["e:u_7"]),
  },
  { name: "8 bulk Show ds_snow", call: (c) => c.reveal(["ds_snow"]) },
  { name: "9 hide the root", call: (c) => c.hide([ROOT]) },
  {
    name: "10 root leaves",
    root: "e:t_FCT_PIPELINE",
    given: (c) => c.expand("e:ug_fin_admin"),
    call: (c) => c.collapse("e:ug_fin_admin"),
  },
  { name: "11 layout Atomic", call: (c) => c.setLayout("atomic") },
  { name: "12 new data", call: (_c, host) => host.fresh("s-lineage") },
];

function button(bar: HTMLElement, text: string, click: () => void) {
  const b = bar.ownerDocument.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", click);
  bar.appendChild(b);
  return b;
}

// why: S18 — the first click of an exit button makes its Given (a new `s-access` canvas, the
// set-up calls, the grouping); the second click runs the exit
export function mountAround(host: AroundHost): void {
  const { bar } = host;
  button(bar, "Group around root", () =>
    host.canvas()?.groupAroundRoot(!host.grouped()),
  );
  let ready: { exit: Exit; b: HTMLButtonElement } | null = null;
  const clear = () => {
    if (ready !== null) ready.b.textContent = `exit ${ready.exit.name}`;
    ready = null;
  };
  for (const exit of EXITS) {
    const b = button(bar, `exit ${exit.name}`, () => {
      const open = host.canvas();
      const run = ready?.exit === exit && open !== null;
      clear();
      if (run) return exit.call(open, host);
      const c = host.fresh("s-access");
      if (c === null) return;
      exit.given?.(c);
      c.select(exit.root ?? ROOT);
      c.groupAroundRoot(true);
      ready = { exit, b };
      b.textContent = `exit ${exit.name}: Given ready, click to run`;
    });
  }
}
