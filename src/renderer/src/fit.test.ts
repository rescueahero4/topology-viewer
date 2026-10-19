import { describe, expect, it } from "vitest";
import {
  fitTransform,
  revealPlan,
  validCamera,
  type Box,
  type Camera,
} from "./fit";

// The s-access first view (Force) of the story test plan: positions and r.
const ACCESS: Box[] = [
  { x: -48.590028148380426, y: -38.70905611789809, r: 12 },
  { x: -56.11842596815778, y: 84.51946977642233, r: 19 },
  { x: -1.292443038387929, y: -141.97237624849413, r: 19 },
  { x: 153.96759045969137, y: 122.89474754067382, r: 19 },
  { x: -151.9682659935887, y: -54.226699423306556, r: 10 },
  { x: 82.52211957710705, y: -26.327277612904272, r: 10 },
  { x: 47.36711968161223, y: 28.30413223054887, r: 10 },
];

function near(c: Camera | null, k: number, x: number, y: number, eps = 1e-9) {
  expect(c).not.toBeNull();
  const v = c as Camera;
  expect(Math.abs(v.k - k)).toBeLessThan(eps);
  expect(Math.abs(v.x - x)).toBeLessThan(eps);
  expect(Math.abs(v.y - y)).toBeLessThan(eps);
}

describe("S1 fitTransform", () => {
  it("fits the s-access boxes at 800 × 600", () => {
    near(
      fitTransform(ACCESS, 800, 600, 40, 0),
      1.476959788076312,
      391.8772200337812,
      303.74972671011625,
    );
  });

  it("fits the s-access boxes at 1,000 × 700", () => {
    near(
      fitTransform(ACCESS, 1000, 700, 40, 0),
      1.7609905165525257,
      490.3151469633545,
      354.4708280005232,
    );
  });

  it("uses the floor of 50 px for a free area below it (60 × 60)", () => {
    near(
      fitTransform(ACCESS, 60, 60, 40, 0),
      0.1343540834251558,
      29.261097921530443,
      30.34110007550623,
    );
  });

  it("clamps a minK of 8 to the zoom limit 6", () => {
    near(
      fitTransform(ACCESS, 800, 600, 40, 8),
      6,
      367.00202660169197,
      315.23288612346096,
    );
  });

  it("gives at most zoom 2 for one box", () => {
    near(
      fitTransform([ACCESS[0]], 800, 600, 40, 0),
      2,
      497.1800562967609,
      363.4181122357962,
    );
  });

  it("gives null for no boxes and for a 0 × 0 container", () => {
    expect(fitTransform([], 800, 600, 40, 0)).toBeNull();
    expect(fitTransform(ACCESS, 0, 0, 40, 0)).toBeNull();
    expect(fitTransform(ACCESS, 800, 0, 40, 0)).toBeNull();
  });

  it("gives null, not a value that is not finite, for a box that is not finite", () => {
    expect(fitTransform([{ x: NaN, y: 0, r: 1 }], 800, 600, 40, 0)).toBeNull();
  });
});

describe("S2 revealPlan built cases", () => {
  const t = fitTransform(ACCESS, 800, 600, 40, 0) as Camera;
  const box = (x: number, y: number): Box => ({ x, y, r: 10 });

  it("(a) gives null for an anchor outside the viewport", () => {
    const a = { s: { x: -5, y: 300 }, p: { x: 0, y: 0 } };
    expect(revealPlan(t, 800, 600, a, [box(0, 0)], [])).toBeNull();
  });

  it("(b) floors the zoom at 0.05 on the must-only branch", () => {
    const a = { s: { x: 400, y: 300 }, p: { x: 0, y: 0 } };
    const plan = revealPlan(t, 800, 600, a, [box(0, 0), box(100000, 0)], []);
    expect(plan).toEqual({ k: 0.05, x: 400, y: 300 });
  });

  it("(c) gives null for a 0 × 0 container", () => {
    const a = { s: { x: 0, y: 0 }, p: { x: 0, y: 0 } };
    expect(revealPlan(t, 0, 0, a, [box(0, 0)], [])).toBeNull();
  });

  it("gives null when everything fits and the anchor did not move", () => {
    const p = { x: ACCESS[0].x, y: ACCESS[0].y };
    const s = { x: t.x + t.k * p.x, y: t.y + t.k * p.y };
    expect(revealPlan(t, 800, 600, { s, p }, [ACCESS[0]], [])).toBeNull();
  });

  it("pans with no zoom change when the anchor moved and everything fits", () => {
    const old = { x: ACCESS[0].x, y: ACCESS[0].y };
    const s = { x: t.x + t.k * old.x, y: t.y + t.k * old.y };
    const p = { x: old.x + 20, y: old.y };
    const plan = revealPlan(t, 800, 600, { s, p }, [{ ...p, r: 12 }], []);
    expect(plan?.k).toBe(t.k);
    expect((plan as Camera).x + t.k * p.x).toBeCloseTo(s.x, 9);
  });
});

describe("validCamera", () => {
  it.each([
    [{ k: 0.5, x: 10, y: 20 }, true],
    [{ k: 0.05, x: 0, y: 0 }, true],
    [{ k: 6, x: 0, y: 0 }, true],
    [{ k: NaN, x: 0, y: 0 }, false],
    [{ k: 10, x: 0, y: 0 }, false],
    [{ k: 0.01, x: 0, y: 0 }, false],
    [{ k: 0.5, x: Infinity, y: 0 }, false],
    [{ k: 0.5, x: 0, y: -Infinity }, false],
  ])("%o is valid: %s", (c, ok) => {
    expect(validCamera(c)).toBe(ok);
  });
});
