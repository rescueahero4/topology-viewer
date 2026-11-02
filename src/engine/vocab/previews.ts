import type { Hex } from "./colors";
import { visualsOf, type Visual, type VisualSpec } from "./visual";

type Rules = {
  spec: (name: string | null) => VisualSpec;
  claimed: string[];
  canvas: Hex;
};

// why: the Kind list marks a profile type that the data does not use by the canvas rules, as if
// the type came after the types of the data; a second run keeps the visuals of the data unchanged
export function previewsOf(
  order: readonly (string | null)[],
  names: readonly string[],
  { spec, claimed, canvas }: Rules,
): Map<string, Visual> {
  const spare = names.filter((name) => !order.includes(name));
  const all = [...order, ...spare].map(spec);
  const { visuals } = visualsOf(all, claimed, canvas);
  return new Map(spare.map((name, i) => [name, visuals[order.length + i]]));
}
