import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { DrawnId, Point } from "../state/canvasState";
import type { Vocab } from "../vocab/resolve";
import type { Drawn } from "./drawn";
import { seeded } from "./random";

export type ForceConfig = {
  linkDistance: { structure: number; other: number };
  linkStrength: { structure: number; other: number };
  charge: number;
  theta: number;
  distanceMax: number;
  collidePad: { named: number; leaf: number };
  collideIterations: number;
  gravity: number;
  alphaDecay: number;
  velocityDecay: number;
  alphaMin: number;
  maxTicks: number;
};

export type Body = SimulationNodeDatum & {
  id: DrawnId;
  r: number;
  named: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type Spring = SimulationLinkDatum<Body> & { structure: boolean };

// why: mockup `opts.bigGraph` (lib/topology.js line 424)
const BIG_GRAPH = 1200;

// why: mockup `runForce` (lib/topology.js lines 1500-1506); the tick cap bounds the work of a
// hostile payload (SA §11 harm criterion 4)
export function forceConfig(n: number): ForceConfig {
  const big = n > BIG_GRAPH;
  return {
    linkDistance: { structure: 52, other: 110 },
    linkStrength: { structure: 0.8, other: 0.3 },
    charge: big ? -50 : -260,
    theta: big ? 1.2 : 0.9,
    distanceMax: big ? 300 : 700,
    collidePad: big ? { named: 6, leaf: 6 } : { named: 26, leaf: 12 },
    collideIterations: big ? 1 : 2,
    gravity: 0.03,
    alphaDecay: big ? 0.05 : 0.0228,
    velocityDecay: 0.45,
    alphaMin: 0.001,
    maxTicks: 400,
  };
}

export function forcesOf(springs: Spring[], config: ForceConfig) {
  const pick = (
    structure: boolean,
    value: { structure: number; other: number },
  ) => (structure ? value.structure : value.other);
  const link = forceLink<Body, Spring>(springs)
    .id((body) => body.id)
    .distance(
      (spring) =>
        pick(spring.structure, config.linkDistance) +
        (spring.source as Body).r +
        (spring.target as Body).r,
    )
    .strength((spring) => pick(spring.structure, config.linkStrength))
    .iterations(1);
  const charge = forceManyBody<Body>()
    .strength(config.charge)
    .theta(config.theta)
    .distanceMax(config.distanceMax);
  const collide = forceCollide<Body>(
    (body) =>
      body.r + (body.named ? config.collidePad.named : config.collidePad.leaf),
  ).iterations(config.collideIterations);
  const x = forceX<Body>(0).strength(config.gravity);
  const y = forceY<Body>(0).strength(config.gravity);
  return { link, charge, collide, x, y };
}

// why: mockup `seedPosition` (lib/topology.js line 956) — a phyllotaxis spiral by frontier index,
// with no shared counter, so the start does not depend on earlier runs
function spiral(i: number): Point {
  const angle = i * 2.39996;
  const radius = 14 * Math.sqrt(i + 1);
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

export function bodiesOf(
  drawn: Drawn,
  cache: ReadonlyMap<DrawnId, Point>,
): Body[] {
  return drawn.nodes.map((node, index) => {
    const { x, y } = cache.get(node.id) ?? spiral(index);
    return {
      id: node.id,
      r: node.r,
      named: node.named,
      index,
      x,
      y,
      vx: 0,
      vy: 0,
    };
  });
}

export function springsOf(drawn: Drawn, vocab: Vocab): Spring[] {
  return drawn.links.map((link) => ({
    source: drawn.nodes[link.subject].id,
    target: drawn.nodes[link.object].id,
    // why: lead decision D37, SA ruling S1 — the profile `layoutRole` gives the mockup family
    // `structure` (lib/topology.js line 1500)
    structure: vocab.predicates.get(link.predicate)?.layoutRole === "structure",
  }));
}

// why: SA §5 "no timers" — the d3-force simulation object starts a timer when it is made, so this
// loop is its tick (d3-force 3.0.0 src/simulation.js) and runs to the end at once (NF-8)
export function forceLayout(
  drawn: Drawn,
  vocab: Vocab,
  cache: ReadonlyMap<DrawnId, Point>,
  alpha: number,
  seed: number,
  config: ForceConfig,
): { positions: [DrawnId, Point][]; ticks: number } {
  const bodies = bodiesOf(drawn, cache);
  const { link, charge, collide, x, y } = forcesOf(
    springsOf(drawn, vocab),
    config,
  );
  const forces = [link, charge, collide, x, y];
  const random = seeded(seed);
  for (const force of forces) force.initialize(bodies, random);
  const keep = 1 - config.velocityDecay;
  let heat = alpha;
  let ticks = 0;
  while (!(heat < config.alphaMin) && ticks < config.maxTicks) {
    heat -= heat * config.alphaDecay;
    for (const force of forces) force(heat);
    for (const body of bodies) {
      body.x += body.vx *= keep;
      body.y += body.vy *= keep;
    }
    ticks++;
  }
  return {
    positions: bodies.map((body) => [body.id, { x: body.x, y: body.y }]),
    ticks,
  };
}
