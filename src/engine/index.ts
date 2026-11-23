// Software factory Monte Carlo (discrete-event). Time unit: hours.
// An exact TypeScript port of the video's model, factory.mjs v9 (2026-11-22): same BASE, same LCG, same lognormal
// and exponential draws in the same order, same event heap, same station priority, same warm-up, same metrics.
// Do not "improve" the model here. The golden tests in test/engine.golden.test.ts hold it to the video's numbers.
//
// Line: spec (people) -> build (agents) -> CI -> judge (AI) -> review (people, optional) -> merge -> production
// Streams in: features (need a spec; requested during working hours), maintenance (scheduled agent work, no spec,
// any hour), fixes (from production bugs, after people diagnose them).
// People are ONE shared pool doing spec, review and diagnosis (priority: diagnosis > review > spec).
//
// The one addition is trace mode: sim(cfg, seed, true) also returns an event log for the animation.
// Tracing never draws from the RNG, so a traced run returns the same metrics as an untraced one.

export interface Dist { mean: number; cv: number }
export interface Detect { p: number; mean: number; cv: number }
export type ProdMode = 'humans' | 'agents';
export interface Cfg {
  hours: number; warm: number;
  featuresPerDay: number; maintPerDay: number;
  humans: number; shift: boolean;
  agents: number; ciRunners: number;
  spec: Dist; build: Dist; ci: Dist;
  judge: Dist & { reject: number };
  /** share: the fraction of eligible changes a person reviews (1 = all, the video's model; 0 = none). */
  review: Dist & { on: boolean; maint: boolean; share: number; catch: number; reject: number };
  conflictPerMerge: number;
  bugRate: number;
  maintBugRate: number | null;
  testCatch: number;
  prod: { mode: ProdMode; dupes: number };
  detect: Record<ProdMode, Detect>;
  customerReport: Dist;
  mitigate: Dist;
  diagnose: Dist;
  tokensPerBuild: number; ciPerRun: number;
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object | null ? (T[K] extends object ? DeepPartial<T[K]> : T[K]) : T[K] };
export type Overrides = DeepPartial<Cfg>;

export const BASE: Cfg = {
  hours: 24 * 7 * 26, warm: 0.15,           // half a year
  featuresPerDay: 3, maintPerDay: 2,          // per calendar day on average; features are requested 9–17 weekdays
  humans: 3, shift: true,                     // people work 9–17 Mon–Fri; agents and CI run 24/7
  agents: 8, ciRunners: 6,
  spec:   { mean: 2.0,  cv: 0.5 },
  build:  { mean: 0.75, cv: 1.2 },          // agent run incl. its own retries
  ci:     { mean: 25 / 60, cv: 0.3 },
  judge:  { mean: 0.05, cv: 0.5, reject: 0.20 },   // Spotify: judge vetoes ~1/4
  review: { on: true, maint: true, share: 1, mean: 1.0, cv: 0.5, catch: 0.5, reject: 0.10 },
  conflictPerMerge: 0.02,   // chance per change merged while yours was in flight
  bugRate: 0.15,            // share of changes that carry a defect
  maintBugRate: null,       // maintenance changes' defect share; null = same as bugRate
  testCatch: 0.4,           // share of defects caught at CI (pre-merge)
  prod: { mode: 'humans', dupes: 1 },
  detect: { humans: { p: 0.5, mean: 24, cv: 1 }, agents: { p: 0.95, mean: 0.5, cv: 1 } },
  customerReport: { mean: 168, cv: 1 },      // bugs monitoring misses: a customer reports them, ~a week
  mitigate: { mean: 0.5, cv: 0.5 },          // rollback after detection
  diagnose: { mean: 3.0, cv: 1.0 },          // people-hours to understand a prod bug nobody read
  tokensPerBuild: 25, ciPerRun: 0.5,         // the only dollar inputs inside the line
};

export interface Metrics {
  at9: number; p50: number; p95: number;
  featuresPerDay: number; humanUtil: number; diagShare: number;
  busyPerF: number; paidPerF: number; waitPerF: number; bugLivePerF: number;
  specPerF: number; reviewPerF: number; diagPerF: number;
  tokensPerF: number; ciPerF: number;
  tokensPerWorkday: number; buildsPerWeek: number;
  escapedPerDay: number; conflictsPerDay: number;
}

// ---- trace (animation only) ----
export type Station = 'diagnose' | 'review' | 'spec' | 'build' | 'ci' | 'judge';
export type Kind = 'feature' | 'maint' | 'fix' | 'diag';
/** What happened when the job left the station. */
export type Outcome =
  | 'next'      // moved on down the line
  | 'caught'    // a bug was caught here (CI tests or review): back to build
  | 'reject'    // rejected for another reason (judge veto, review): back to build
  | 'conflict'  // merge conflict: back to build
  | 'merge'     // merged clean and shipped
  | 'escape'    // merged carrying a bug: it is now live in production
  | 'fix'       // diagnosis done: a fix job enters the line
  | 'open';     // still queued or in service when the run ended
export interface Visit { job: number; kind: Kind; st: Station; enq: number; start: number; end: number; bug: boolean; out: Outcome; slot: number }
export interface JobRec { id: number; kind: Kind; born: number; parent: number | null }
export interface BugRec { id: number; job: number; kind: Kind; merged: number; found: number; mitigated: number | null; by: 'monitor' | 'customer'; tickets: number[] }
export interface Trace { seed: number; hours: number; warmEnd: number; visits: Visit[]; jobs: JobRec[]; bugs: BugRec[] }

interface Job { id: number; v: number; kind: Kind; born: number; bug: boolean; buildStart: number; mergesAtStart: number }
interface Ev { t: number; type: 'done' | 'arrive' | 'shift' | 'bugfound'; st?: Station; job?: Job; kind?: 'feature' | 'maint'; detectDelay?: number; bugId?: number }
type Pool = 'humans' | 'agents' | 'ci' | 'ai';

export function sim(cfg: Cfg, seed: number, traced = false): Metrics & { trace?: Trace } {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const exp = (m: number) => -m * Math.log(1 - rnd());
  const ln = ({ mean, cv }: Dist) => { const sg = Math.sqrt(Math.log(1 + cv * cv)), mu = Math.log(mean) - sg * sg / 2; const u = rnd() || 1e-9, v = rnd(); return Math.exp(mu + sg * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); };
  const heap: Ev[] = [], push = (e: Ev) => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].t <= heap[i].t) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], l = heap.pop()!; if (heap.length) { heap[0] = l; let i = 0; for (;;) { let m = i; const L = 2 * i + 1, R = L + 1; if (L < heap.length && heap[L].t < heap[m].t) m = L; if (R < heap.length && heap[R].t < heap[m].t) m = R; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };

  const pools: Record<Pool, { cap: number; busy: number }> = { humans: { cap: cfg.humans, busy: 0 }, agents: { cap: cfg.agents, busy: 0 }, ci: { cap: cfg.ciRunners, busy: 0 }, ai: { cap: 1e9, busy: 0 } };
  const stations: Record<Station, { pool: Pool; d: Dist; q: Job[] }> = {
    diagnose: { pool: 'humans', d: cfg.diagnose, q: [] },
    review:   { pool: 'humans', d: cfg.review, q: [] },
    spec:     { pool: 'humans', d: cfg.spec, q: [] },
    build:    { pool: 'agents', d: cfg.build, q: [] },
    ci:       { pool: 'ci', d: cfg.ci, q: [] },
    judge:    { pool: 'ai', d: cfg.judge, q: [] },
  };
  const byPool = (p: Pool) => (Object.keys(stations) as Station[]).filter((k) => stations[k].pool === p); // priority = object order
  const T0 = cfg.hours * cfg.warm; let merges = 0, now = 0;
  const m = { done: { feature: 0, maint: 0, fix: 0, diag: 0 }, lead: [] as number[], builds: 0, ciRuns: 0, humanHours: 0, hoursAt: { diagnose: 0, review: 0, spec: 0, build: 0, ci: 0, judge: 0 }, bugLive: 0, escaped: 0, conflicts: 0, featureWait: 0 };
  const inWindow = (t: number) => t >= T0 && t <= cfg.hours;

  // trace bookkeeping: no RNG draws anywhere in here
  const tr: Trace | null = traced ? { seed, hours: cfg.hours, warmEnd: T0, visits: [], jobs: [], bugs: [] } : null;
  const freeSlots: Record<Pool, boolean[]> = { humans: [], agents: [], ci: [], ai: [] };
  let nextId = 0;
  const mkJob = (kind: Kind, born: number, bug: boolean, parent: number | null): Job => {
    const j: Job = { id: nextId++, v: -1, kind, born, bug, buildStart: 0, mergesAtStart: 0 };
    if (tr) tr.jobs.push({ id: j.id, kind, born, parent });
    return j;
  };
  const leave = (job: Job, out: Outcome) => { if (tr && job.v >= 0) tr.visits[job.v].out = out; };

  const enqueue = (st: Station, job: Job, t: number) => {
    if (tr) { job.v = tr.visits.length; tr.visits.push({ job: job.id, kind: job.kind, st, enq: t, start: Infinity, end: Infinity, bug: job.bug, out: 'open', slot: -1 }); }
    stations[st].q.push(job); dispatch(stations[st].pool, t);
  };
  const onShift = (t: number) => !cfg.shift || (Math.floor(t / 24) % 7 < 5 && (t % 24) >= 9 && (t % 24) < 17);
  function dispatch(pool: Pool, t: number) {
    const P = pools[pool];
    if (pool === 'humans' && !onShift(t)) return;
    for (const st of byPool(pool)) {
      const S = stations[st];
      while (P.busy < P.cap && S.q.length) {
        const job = S.q.shift()!; P.busy++;
        const d = ln(S.d);
        if (pool === 'humans' && inWindow(t)) { m.humanHours += d; m.hoursAt[st] += d; }
        if (st === 'build' && inWindow(t)) m.builds++;
        if (st === 'ci' && inWindow(t)) m.ciRuns++;
        if (tr) {
          const v = tr.visits[job.v], free = freeSlots[pool];
          let k = 0; while (free[k]) k++;
          free[k] = true; v.slot = k; v.start = t; v.end = t + d;
        }
        push({ t: t + d, type: 'done', st, job });
      }
    }
  }
  const bugP = (kind: Kind) => kind === 'maint' && cfg.maintBugRate != null ? cfg.maintBugRate : cfg.bugRate;
  const newJob = (kind: Kind, t: number, parent: number | null = null) => mkJob(kind, t, rnd() < bugP(kind), parent);

  // arrivals: features during working hours (people ask for them), maintenance any hour (scheduled)
  const workHours = cfg.shift ? 40 : 168;
  const fRate = cfg.featuresPerDay * 7 / workHours; // per working hour
  const toReal = (sh: number) => { if (!cfg.shift) return sh; const w = Math.floor(sh / 40), r = sh % 40, d = Math.floor(r / 8); return w * 168 + d * 24 + 9 + (r % 8); };
  for (let sh = exp(1 / fRate); toReal(sh) < cfg.hours; sh += exp(1 / fRate)) push({ t: toReal(sh), type: 'arrive', kind: 'feature' });
  const mph = cfg.maintPerDay / 24;
  if (mph > 0) for (let t = exp(1 / mph); t < cfg.hours; t += exp(1 / mph)) push({ t, type: 'arrive', kind: 'maint' });
  if (cfg.shift) for (let d = 0; d * 24 < cfg.hours; d++) if (d % 7 < 5) push({ t: d * 24 + 9, type: 'shift' });
  const reviewAt9: number[] = [];

  const merge = (job: Job, t: number) => {
    const k = merges - job.mergesAtStart; // conflict chance grows with merges while in flight
    if (rnd() < 1 - Math.pow(1 - cfg.conflictPerMerge, k)) { if (inWindow(t)) m.conflicts++; job.mergesAtStart = merges; leave(job, 'conflict'); enqueue('build', job, t); return; }
    merges++;
    if (inWindow(t)) { m.done[job.kind]++; if (job.kind === 'feature') { m.lead.push(t - job.born); m.featureWait += t - job.born; } }
    leave(job, job.bug ? 'escape' : 'merge');
    if (job.bug) {
      if (inWindow(t)) m.escaped++;
      const D = cfg.detect[cfg.prod.mode];
      const monitored = rnd() < D.p;
      const d = monitored ? ln(D) : ln(cfg.customerReport);
      let bugId: number | undefined;
      if (tr) { bugId = tr.bugs.length; tr.bugs.push({ id: bugId, job: job.id, kind: job.kind, merged: t, found: t + d, mitigated: null, by: monitored ? 'monitor' : 'customer', tickets: [] }); }
      push({ t: t + d, type: 'bugfound', detectDelay: d, bugId });
    }
  };
  // Addition to v9: people can review a share of changes. At 100% (and 0%) no random number is drawn,
  // so those two ends reproduce the video's model exactly; in between, each change is picked at random.
  const sampled = () => cfg.review.share >= 1 || (cfg.review.share > 0 && rnd() < cfg.review.share);
  const rebuild = (job: Job, t: number, why: Outcome) => { if (job.bug) job.bug = rnd() < bugP(job.kind); leave(job, why); enqueue('build', job, t); };

  while (heap.length) {
    const e = pop(); now = e.t; if (now > cfg.hours * 1.5) break;
    if (e.type === 'shift') { if (inWindow(now)) reviewAt9.push(stations.review.q.length); dispatch('humans', now); continue; }
    if (e.type === 'arrive') { const j = newJob(e.kind!, now); enqueue(e.kind === 'feature' ? 'spec' : 'build', j, now); continue; }
    if (e.type === 'bugfound') {
      const mit = ln(cfg.mitigate), live = e.detectDelay! + mit; if (inWindow(now)) m.bugLive += live;
      const rec = tr && e.bugId != null ? tr.bugs[e.bugId] : null;
      if (rec) rec.mitigated = now + mit;
      for (let c = 0; c < cfg.prod.dupes; c++) { const tk = mkJob('diag', now, false, rec ? rec.id : null); if (rec) rec.tickets.push(tk.id); enqueue('diagnose', tk, now); }
      continue;
    }
    const st = e.st!, job = e.job!; const P = pools[stations[st].pool];
    P.busy--;
    if (tr) freeSlots[stations[st].pool][tr.visits[job.v].slot] = false;
    switch (st) {
      case 'spec': job.buildStart = now; job.mergesAtStart = merges; leave(job, 'next'); enqueue('build', job, now); break;
      case 'diagnose': leave(job, 'fix'); enqueue('build', newJob('fix', now, job.id), now); break;
      case 'build': if (!job.buildStart) { job.buildStart = now; job.mergesAtStart = merges; } leave(job, 'next'); enqueue('ci', job, now); break;
      case 'ci': if (job.bug && rnd() < cfg.testCatch) rebuild(job, now, 'caught'); else { leave(job, 'next'); enqueue('judge', job, now); } break;
      case 'judge': if (rnd() < cfg.judge.reject) rebuild(job, now, 'reject'); else if (cfg.review.on && (cfg.review.maint || job.kind !== 'maint') && sampled()) { leave(job, 'next'); enqueue('review', job, now); } else merge(job, now); break;
      case 'review': {
        const caught = job.bug && rnd() < cfg.review.catch; // same draw order as (bug && rnd() < catch) || rnd() < reject
        if (caught || rnd() < cfg.review.reject) rebuild(job, now, caught ? 'caught' : 'reject');
        else merge(job, now);
        break;
      }
    }
    dispatch(stations[st].pool, now);
  }
  const span = cfg.hours - T0, F = Math.max(1, m.done.feature), L = m.lead.sort((a, b) => a - b), q = (x: number) => L.length ? L[Math.floor(x * (L.length - 1))] : NaN;
  const paidHours = cfg.humans * span * (cfg.shift ? 40 / 168 : 1);
  const out: Metrics & { trace?: Trace } = {
    at9: reviewAt9.reduce((a, b) => a + b, 0) / Math.max(1, reviewAt9.length), p50: q(0.5), p95: q(0.95),
    featuresPerDay: m.done.feature / span * 24, humanUtil: m.humanHours / paidHours, diagShare: m.hoursAt.diagnose / Math.max(1e-9, m.humanHours),
    busyPerF: m.humanHours / F, paidPerF: paidHours / F, waitPerF: m.featureWait / F, bugLivePerF: m.bugLive / F,
    specPerF: m.hoursAt.spec / F, reviewPerF: m.hoursAt.review / F, diagPerF: m.hoursAt.diagnose / F,
    tokensPerF: m.builds * cfg.tokensPerBuild / F, ciPerF: m.ciRuns * cfg.ciPerRun / F,
    tokensPerWorkday: m.builds * cfg.tokensPerBuild / (span / 168 * 5), buildsPerWeek: m.builds / (span / 168),
    escapedPerDay: m.escaped / span * 24, conflictsPerDay: m.conflicts / span * 24,
  };
  if (tr) out.trace = tr;
  return out;
}

/** Overrides merge one level deep, like the model's mergeCfg, and one more for `detect.humans` / `detect.agents`. */
export function mergeCfg(a: Cfg, b: Overrides): Cfg {
  const merge = (x: any, y: any): any => {
    const o = structuredClone(x);
    for (const [k, v] of Object.entries(y)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? merge(o[k], v) : v;
    return o;
  };
  return merge(a, b);
}

export const seedFor = (i: number) => 1000 + i * 7919;
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
export const METRIC_KEYS = ['at9', 'p50', 'p95', 'featuresPerDay', 'humanUtil', 'diagShare', 'busyPerF', 'paidPerF', 'waitPerF', 'bugLivePerF', 'specPerF', 'reviewPerF', 'diagPerF', 'tokensPerF', 'ciPerF', 'tokensPerWorkday', 'buildsPerWeek', 'escapedPerDay', 'conflictsPerDay'] as const satisfies readonly (keyof Metrics)[];

/** Median per metric across runs (each metric's own median, as the video's tables do). */
export function medianOf(rs: Metrics[]): Metrics {
  return Object.fromEntries(METRIC_KEYS.map((k) => [k, med(rs.map((r) => r[k]))])) as unknown as Metrics;
}
export function runSeeds(cfg: Cfg, seeds = 9): Metrics[] {
  return Array.from({ length: seeds }, (_, i) => sim(cfg, seedFor(i)));
}
export function runMany(over: Overrides, seeds = 9): Metrics {
  return medianOf(runSeeds(mergeCfg(BASE, over), seeds));
}
/** Index of the run to animate: the one whose median lead is the median of the runs. */
export function pickMedianSeed(rs: Metrics[]): number {
  const target = med(rs.map((r) => r.p50));
  const i = rs.findIndex((r) => r.p50 === target);
  return i < 0 ? 0 : i;
}

// ---- the bill: hours first, then money from dials ----
export interface Money { salary: number; delay: number; bug: number }
export const MONEY = {
  low: { salary: 60, delay: 2, bug: 10 },
  mid: { salary: 100, delay: 10, bug: 50 },
  high: { salary: 150, delay: 25, bug: 200 },
} as const satisfies Record<string, Money>;
export const BILL_LINES = ['tokens', 'ci', 'people', 'waiting', 'bugs'] as const;
export type BillLine = (typeof BILL_LINES)[number];
export interface Bill { parts: Record<BillLine, number>; total: number; tokensRank: number }
export function bill(r: Metrics, d: Money): Bill {
  const parts = { tokens: r.tokensPerF, ci: r.ciPerF, people: r.paidPerF * d.salary, waiting: r.waitPerF * d.delay, bugs: r.bugLivePerF * d.bug };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  const tokensRank = Object.values(parts).filter((v) => v > parts.tokens).length + 1;
  return { parts, total, tokensRank };
}
