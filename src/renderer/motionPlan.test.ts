import { easeCubicIn, easeCubicOut } from "d3-ease";
import { describe, expect, it } from "vitest";
import {
  layoutMs,
  layoutTracks,
  localMs,
  localTracks,
  pointAt,
  retractTracks,
  RETRACT_MS,
  staggerOf,
  type Track,
} from "./motionPlan";

const at = (id: string, x: number, y: number) => ({ id, x, y });
const spots = (...list: [string, number, number][]) =>
  new Map(list.map(([id, x, y]) => [id, { x, y }]));

describe("S12 durations and delays (mockup finishLocal, tween, retract)", () => {
  it.each([
    [0, 520],
    [1000, 820],
    [1300, 900],
    [3000, 900],
    [374, 632],
    [200, 580],
  ])("d %d gives %d ms", (d, ms) => {
    expect(localMs(d)).toBe(ms);
  });

  it.each([
    [1, 0],
    [13, 168],
    [14, 180],
    [20, 180],
  ])("%d newcomers give a last delay of %d ms", (count, last) => {
    const delays = staggerOf(Array.from({ length: count }, (_, i) => i));
    expect(Math.max(...delays)).toBe(last);
  });

  it("ranks the trips nearest first, ties in input order", () => {
    expect(staggerOf([300, 0, 100, 0])).toEqual([42, 0, 28, 14]);
  });

  it("layout 450 ms, 520 ms with newcomers; collapse adds 280 ms", () => {
    expect(layoutMs(false)).toBe(450);
    expect(layoutMs(true)).toBe(520);
    const drawn = spots(["a", 0, 0], ["b", 10, 0]);
    expect(layoutTracks(drawn, [at("a", 5, 0)]).length).toBe(450);
    expect(layoutTracks(drawn, [at("a", 5, 0), at("c", 0, 0)]).length).toBe(
      520,
    );
    const retract = retractTracks(drawn, spots(["b", 0, 0]));
    expect(retract.map((t) => t.length)).toEqual([RETRACT_MS]);
    expect(RETRACT_MS).toBe(280);
  });
});

describe("local tracks (Context Renderer motion)", () => {
  it("takes the longest trip with the newcomer trips, and the delays", () => {
    const drawn = spots(["a", 0, 0]);
    const plan = localTracks(
      drawn,
      [at("a", 200, 0), at("n1", 0, 374), at("n2", 0, 100), at("n3", 0, 0)],
      spots(["n1", 0, 0], ["n2", 0, 0]),
    );
    expect(plan.duration).toBe(632);
    expect(plan.length).toBe(632 + 28);
    expect(plan.newcomers).toEqual(["n1", "n2", "n3"]);
    expect(plan.tracks.map((t) => [t.id, t.delay])).toEqual([
      ["a", 0],
      ["n1", 28],
      ["n2", 14],
    ]);
  });

  it("starts a newcomer with no entry, or with a start that is not finite, at its end", () => {
    const plan = localTracks(
      spots(),
      [at("n1", 5, 5), at("n2", 7, 7), at("n3", 9, 9)],
      new Map([
        ["n2", { x: NaN, y: 0 }],
        ["n3", { x: 0, y: Infinity }],
      ]),
    );
    expect(plan.tracks).toEqual([]);
    expect(plan.duration).toBe(520);
  });
});

describe("pointAt", () => {
  const track: Track = {
    id: "a",
    from: { x: 0, y: 0 },
    to: { x: 300, y: -40 },
    delay: 28,
    length: 610,
  };

  it("stays at the start before its delay and gives the end point at its end", () => {
    expect(pointAt(track, 0, easeCubicOut)).toEqual({ x: 0, y: 0 });
    expect(pointAt(track, 638, easeCubicOut)).toBe(track.to);
    expect(pointAt(track, Infinity, easeCubicOut)).toBe(track.to);
  });

  it("never passes the end in 1,000 samples with each motion ease", () => {
    for (const ease of [easeCubicOut, easeCubicIn])
      for (let i = 0; i <= 1000; i++) {
        const p = pointAt(track, (638 * i) / 1000, ease);
        const u = p.x / 300;
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(p.y / -40).toBeCloseTo(u, 12);
      }
  });

  it("gives the end for an ease that is not finite", () => {
    expect(pointAt(track, 300, () => NaN)).toBe(track.to);
  });
});
