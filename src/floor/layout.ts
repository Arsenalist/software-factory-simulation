// Where everything stands on the floor. World units: a crate is about 0.42 across; x runs down the line,
// z comes toward the viewer, y is up. The line reads left to right like the video's diagram:
// inbox -> spec desks -> build bays -> CI conveyor -> judge gate -> review desks -> merge -> production.
import type { FloorStation } from '../model/settings';

export interface P { x: number; z: number }
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Layout {
  humans: number; agents: number; lanes: number;
  inbox: P; maintChute: P; door: P;
  specQueue: P; specDesks: P[];
  buildQueue: P; bays: P[];
  ciQueue: P; ci: { x0: number; x1: number; laneZ: number[] };
  judge: P;
  reviewQueue: P; reviewDesks: P[];
  merge: P;
  prod: Rect; prodSlots: P[];
  tickets: P; diagSpots: P[];
  watcher: P;
  rects: Record<FloorStation, Rect>;
  labels: Record<FloorStation, { x: number; y: number; z: number }>;
  bounds: Rect;
}

export const MAX_PEOPLE = 24, MAX_AGENTS = 48, MAX_LANES = 8;

function grid(n: number, rows: number, dx: number, dz: number, x: number): { pts: P[]; width: number; depth: number } {
  const r = Math.min(rows, n), cols = Math.ceil(n / r), pts: P[] = [];
  for (let i = 0; i < n; i++) { const c = Math.floor(i / r), k = i % r; pts.push({ x: x + c * dx, z: (k - (r - 1) / 2) * dz }); }
  return { pts, width: (cols - 1) * dx, depth: (r - 1) * dz };
}
const around = (pts: P[], padX: number, padZ: number): Rect => ({
  x0: Math.min(...pts.map((p) => p.x)) - padX, x1: Math.max(...pts.map((p) => p.x)) + padX,
  z0: Math.min(...pts.map((p) => p.z)) - padZ, z1: Math.max(...pts.map((p) => p.z)) + padZ,
});

export function makeLayout(humansIn: number, agentsIn: number, runnersIn: number): Layout {
  const humans = Math.min(MAX_PEOPLE, humansIn), agents = Math.min(MAX_AGENTS, agentsIn), lanes = Math.min(MAX_LANES, runnersIn);
  const deskRows = humans > 12 ? 6 : humans > 4 ? 4 : humans;
  const bayRows = agents > 24 ? 6 : 4;
  let x = 0;
  const inbox = { x, z: 0 }; x += 1.25;
  const specQueue = { x, z: 0 }; x += 1.45;
  const spec = grid(humans, deskRows, 2.0, 1.35, x + 0.5); x += spec.width + 2.1;
  const buildQueue = { x, z: 0 }; x += 1.35;
  const bays = grid(agents, bayRows, 1.05, 1.05, x); x += bays.width + 1.5;
  const ciQueue = { x, z: 0 }; x += 1.1;
  const ci = { x0: x, x1: x + 2.6, laneZ: Array.from({ length: lanes }, (_, i) => (i - (lanes - 1) / 2) * 0.5) }; x = ci.x1 + 1.0;
  const judge = { x, z: 0 }; x += 1.6;
  const reviewQueue = { x, z: 0 }; x += 1.45;
  const review = grid(humans, deskRows, 2.0, 1.35, x + 0.5); x += review.width + 2.0;
  const merge = { x, z: 0 }; x += 1.35;
  const prodCols = 4;
  const prod: Rect = { x0: x, x1: x + 3.1, z0: -1.75, z1: 1.75 };
  const prodSlots: P[] = Array.from({ length: 24 }, (_, i) => ({ x: prod.x0 + 0.55 + (i % prodCols) * 0.66, z: prod.z0 + 1.25 + (Math.floor(i / prodCols) % 4) * 0.6 }));
  const diag = grid(humans, 1, 0.7, 0, 0);
  const diagX = (prod.x0 + prod.x1) / 2 - ((humans - 1) * 0.7) / 2 + 0.3;
  const diagSpots = diag.pts.map((_, i) => ({ x: diagX + i * 0.7, z: prod.z1 + 0.75 }));
  const tickets = { x: prod.x0 - 0.1, z: prod.z1 + 0.75 };
  const watcher = { x: prod.x1 - 0.5, z: prod.z0 + 0.45 };
  const depth = Math.max(spec.depth, bays.depth, 3.8);
  const maintChute = { x: buildQueue.x - 0.35, z: -(bays.depth / 2 + 1.7) };
  const door = { x: inbox.x + 0.2, z: -(depth / 2 + 1.5) };

  const rects: Record<FloorStation, Rect> = {
    spec: { ...around(spec.pts, 0.75, 0.85), x0: specQueue.x - 0.6 },
    build: { ...around(bays.pts, 0.65, 0.65), x0: buildQueue.x - 0.6 },
    ci: { x0: ciQueue.x - 0.55, x1: ci.x1 + 0.2, z0: Math.min(-0.7, ci.laneZ[0] - 0.45), z1: Math.max(0.7, ci.laneZ[lanes - 1] + 0.45) },
    judge: { x0: judge.x - 0.55, x1: judge.x + 0.55, z0: -1.15, z1: 1.15 },
    review: { ...around(review.pts, 0.75, 0.85), x0: reviewQueue.x - 0.6 },
    merge: { x0: merge.x - 0.8, x1: merge.x + 0.8, z0: -0.8, z1: 0.8 },
    production: { x0: prod.x0 - 0.15, x1: prod.x1 + 0.15, z0: prod.z0 - 0.15, z1: prod.z1 + 0.15 },
    diagnose: { x0: tickets.x - 0.45, x1: Math.max(prod.x1, diagSpots[humans - 1].x + 0.4), z0: prod.z1 + 0.3, z1: prod.z1 + 1.25 },
  };
  const top = (r: Rect, y: number) => ({ x: (r.x0 + r.x1) / 2, y, z: r.z0 });
  const labels: Layout['labels'] = {
    spec: { ...top(rects.spec, 1.5), x: spec.pts[0].x + spec.width / 2 }, build: { ...top(rects.build, 1.5), x: bays.pts[0].x + bays.width / 2 + 0.2 }, ci: top(rects.ci, 1.1), judge: { x: judge.x, y: 2.15, z: 0 },
    review: { ...top(rects.review, 1.5), x: review.pts[0].x + review.width / 2 }, merge: top(rects.merge, 0.8), production: top(rects.production, 1.9),
    diagnose: { x: (rects.diagnose.x0 + rects.diagnose.x1) / 2, y: 0.1, z: rects.diagnose.z1 + 0.5 },
  };
  const all = Object.values(rects);
  const bounds: Rect = {
    x0: inbox.x - 0.9, x1: Math.max(...all.map((r) => r.x1)) + 0.6,
    z0: Math.min(door.z - 0.3, ...all.map((r) => r.z0)), z1: Math.max(...all.map((r) => r.z1)) + 0.4,
  };

  // recentre on the origin so the camera can orbit the middle of the floor
  const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2;
  const sp = (p: P) => { p.x -= cx; p.z -= cz; };
  const sr = (r: Rect) => { r.x0 -= cx; r.x1 -= cx; r.z0 -= cz; r.z1 -= cz; };
  [inbox, maintChute, door, specQueue, buildQueue, ciQueue, judge, reviewQueue, merge, tickets, watcher, ...spec.pts, ...bays.pts, ...review.pts, ...prodSlots, ...diagSpots].forEach(sp);
  [prod, bounds, ...all].forEach(sr);
  ci.x0 -= cx; ci.x1 -= cx; ci.laneZ = ci.laneZ.map((z) => z - cz);
  for (const l of Object.values(labels)) { l.x -= cx; l.z -= cz; }

  return { humans, agents, lanes, inbox, maintChute, door, specQueue, specDesks: spec.pts, buildQueue, bays: bays.pts, ciQueue, ci, judge, reviewQueue, reviewDesks: review.pts, merge, prod, prodSlots, tickets, diagSpots, watcher, rects, labels, bounds };
}
