// @vitest-environment jsdom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it } from "vitest";
import { useKeptOrder } from "./workbenchOrder";

type Step = { version: number; settled: { version: number } | null };

// why: STORY-008-04 (found by QA of STORY-008-02 and 03) — the kept order through a list of
// renders; each new list counts one `fresh` call
function renders(steps: Step[]): number[] {
  const root = document.createElement("div");
  const made: number[] = [];
  let count = 0;
  const inputs = ["base"];
  function Probe(step: Step) {
    useKeptOrder(inputs, step, () => {
      count += 1;
      return [];
    });
    return null;
  }
  for (const step of steps) {
    void act(() => render(h(Probe, step), root));
    made.push(count);
  }
  return made;
}

const stamp = (version: number) => ({ version });

describe("the kept row order and the settle of the newest edit step", () => {
  it("ends two quick edits with the one settle of the second edit", () => {
    const first = stamp(0);
    const own = stamp(2);
    const later = stamp(2);
    expect(
      renders([
        { version: 0, settled: first },
        { version: 1, settled: first },
        { version: 2, settled: first },
        { version: 2, settled: own },
        { version: 2, settled: later },
      ]),
    ).toEqual([1, 1, 1, 1, 2]);
  });

  it("keeps the order through an older settle and a settle in the same render", () => {
    const first = stamp(0);
    const old = stamp(0);
    const own = stamp(1);
    const later = stamp(1);
    expect(
      renders([
        { version: 0, settled: first },
        { version: 1, settled: old },
        { version: 1, settled: own },
        { version: 1, settled: later },
      ]),
    ).toEqual([1, 1, 1, 2]);
    expect(
      renders([
        { version: 0, settled: first },
        { version: 1, settled: own },
        { version: 1, settled: later },
      ]),
    ).toEqual([1, 1, 2]);
  });
});
