// Turns a trace into "what is where at time t". Pure and stateless, so the scrubber can jump anywhere.
import type { BugRec, Station, Trace, Visit } from '../engine';

export const STATIONS: Station[] = ['spec', 'build', 'ci', 'judge', 'review', 'diagnose'];
/** How long a merged crate takes to slide from the merge point into production, in sim hours. */
export const SHIP_HOURS = 0.6;

export interface FloorState {
  t: number;
  onShift: boolean;
  /** visit indices waiting at each station, first in line first */
  queues: Record<Station, number[]>;
  /** total waiting, when `queues` was capped */
  queueLen: Record<Station, number>;
  /** visit indices being worked on right now */
  serving: number[];
  /** visit indices whose job has just merged clean and is on its way out */
  shipping: number[];
  /** bugs live in production right now, oldest first */
  liveBugs: BugRec[];
}

export interface StationStats {
  /** mean hours a job waits before work starts */
  avgWait: number;
  /** mean number waiting */
  avgQueue: number;
  /** share of the pool's available hours spent here; NaN where there is no limit */
  load: number;
  /** jobs through per day */
  perDay: number;
}

export interface Playback {
  trace: Trace;
  hours: number;
  start: number;
  at(t: number, cap?: number): FloorState;
  queueLength(st: Station, t: number): number;
  stats: Record<Station, StationStats>;
  production: { escapedPerDay: number; avgLiveHours: number; byCustomer: number };
  merge: { mergesPerDay: number; conflictsPerDay: number };
}

export const onShiftAt = (t: number, shift: boolean) => !shift || (Math.floor(t / 24) % 7 < 5 && t % 24 >= 9 && t % 24 < 17);

/** first index i in [0, n) with key(i) > t, for a non-decreasing key */
function upper(n: number, key: (i: number) => number, t: number): number {
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (key(mid) > t) hi = mid; else lo = mid + 1; }
  return lo;
}

export function createPlayback(trace: Trace, caps: { humans: number; agents: number; ciRunners: number; shift: boolean }): Playback {
  const { visits, bugs, hours, warmEnd } = trace;

  // Each station serves first-in first-out, so in arrival order both `enq` and `start` never decrease.
  // The queue at time t is then one contiguous run of that list, found by two binary searches.
  const byStation = Object.fromEntries(STATIONS.map((s) => [s, [] as number[]])) as Record<Station, number[]>;
  visits.forEach((v, i) => byStation[v.st].push(i));

  // In-service and shipping spans are short, so an hourly bucket index keeps each frame's work tiny.
  const nBuckets = Math.ceil(hours * 1.5) + 2;
  const serveB: number[][] = Array.from({ length: nBuckets }, () => []);
  const shipB: number[][] = Array.from({ length: nBuckets }, () => []);
  const put = (b: number[][], i: number, from: number, to: number) => {
    for (let h = Math.max(0, Math.floor(from)), e = Math.min(nBuckets - 1, Math.floor(to)); h <= e; h++) b[h].push(i);
  };
  visits.forEach((v, i) => {
    if (!isFinite(v.start)) return;
    put(serveB, i, v.start, v.end);
    if (v.out === 'merge') put(shipB, i, v.end, v.end + SHIP_HOURS);
  });

  const range = (st: Station, t: number): [number, number] => {
    const list = byStation[st];
    return [upper(list.length, (i) => visits[list[i]].start, t), upper(list.length, (i) => visits[list[i]].enq, t)];
  };

  const span = hours - warmEnd;
  const paid = caps.humans * span * (caps.shift ? 40 / 168 : 1);
  const avail: Record<Station, number> = { spec: paid, review: paid, diagnose: paid, build: caps.agents * span, ci: caps.ciRunners * span, judge: NaN };
  const stats = Object.fromEntries(STATIONS.map((st) => {
    let wait = 0, started = 0, queued = 0, busy = 0, n = 0;
    for (const i of byStation[st]) {
      const v: Visit = visits[i];
      if (v.enq < warmEnd || v.enq > hours) continue;
      n++;
      const s = Math.min(v.start, hours);
      queued += s - v.enq;
      if (isFinite(v.start)) { wait += v.start - v.enq; started++; if (v.start <= hours) busy += v.end - v.start; }
    }
    return [st, { avgWait: started ? wait / started : NaN, avgQueue: queued / span, load: busy / avail[st], perDay: (n / span) * 24 }];
  })) as Record<Station, StationStats>;

  const inWin = (t: number) => t >= warmEnd && t <= hours;
  const escaped = bugs.filter((b) => inWin(b.merged));
  const closed = escaped.filter((b) => b.mitigated != null);
  const production = {
    escapedPerDay: (escaped.length / span) * 24,
    avgLiveHours: closed.length ? closed.reduce((a, b) => a + (b.mitigated! - b.merged), 0) / closed.length : NaN,
    byCustomer: escaped.length ? escaped.filter((b) => b.by === 'customer').length / escaped.length : NaN,
  };
  const ends = visits.filter((v) => inWin(v.end));
  const merge = {
    mergesPerDay: (ends.filter((v) => v.out === 'merge' || v.out === 'escape').length / span) * 24,
    conflictsPerDay: (ends.filter((v) => v.out === 'conflict').length / span) * 24,
  };

  // start on the first Monday after warm-up, at 7am: the weekend's pile is waiting and people are two hours away
  const start = Math.min(hours - 24, Math.ceil(warmEnd / 168) * 168 + 7);

  return {
    trace, hours, start: Math.max(0, start), stats, production, merge,
    queueLength(st, t) { const [a, b] = range(st, t); return b - a; },
    at(t, cap = Infinity) {
      const queues = {} as Record<Station, number[]>, queueLen = {} as Record<Station, number>;
      for (const st of STATIONS) {
        const [a, b] = range(st, t), list = byStation[st];
        queueLen[st] = b - a;
        queues[st] = list.slice(a, Math.min(b, a + cap));
      }
      const h = Math.max(0, Math.min(nBuckets - 1, Math.floor(t)));
      const serving = serveB[h].filter((i) => visits[i].start <= t && t < visits[i].end);
      const shipping = shipB[h].filter((i) => visits[i].end <= t && t < visits[i].end + SHIP_HOURS);
      const liveBugs = bugs.filter((b) => b.merged <= t && t < (b.mitigated ?? Infinity));
      return { t, onShift: onShiftAt(t, caps.shift), queues, queueLen, serving, shipping, liveBugs };
    },
  };
}

// ---- what shipped, week by week ----
export type Shipped = 'feature' | 'maint' | 'fix';
export const SHIPPED: Shipped[] = ['feature', 'maint', 'fix'];
export type ShipCount = Record<Shipped, number>;
export const HOURS_PER_WEEK = 168;

export interface Tally {
  /** weeks in the run, warm-up included */
  weeks: number;
  hours: number;
  /** changes merged in each week of the run */
  perWeek: ShipCount[];
  total: ShipCount;
  /** the busiest week's total, for the chart's scale */
  peak: number;
  /** changes merged from the start of the run up to and including time t */
  upTo(t: number): ShipCount;
}
export const shipSum = (c: ShipCount) => c.feature + c.maint + c.fix;

/** Counts the changes that reached production (merged, with or without a bug), by kind and by week. */
export function createTally(trace: Trace): Tally {
  const { visits, hours } = trace;
  const times: Record<Shipped, number[]> = { feature: [], maint: [], fix: [] };
  for (const v of visits) if ((v.out === 'merge' || v.out === 'escape') && v.end <= hours && v.kind !== 'diag') times[v.kind].push(v.end);
  for (const k of SHIPPED) times[k].sort((a, b) => a - b);
  const upTo = (t: number): ShipCount => ({
    feature: upper(times.feature.length, (i) => times.feature[i], t),
    maint: upper(times.maint.length, (i) => times.maint[i], t),
    fix: upper(times.fix.length, (i) => times.fix[i], t),
  });
  const weeks = Math.max(1, Math.ceil(hours / HOURS_PER_WEEK));
  const perWeek: ShipCount[] = [];
  let before = upTo(-1);
  for (let w = 0; w < weeks; w++) {
    const now = upTo(Math.min(hours, (w + 1) * HOURS_PER_WEEK));
    perWeek.push({ feature: now.feature - before.feature, maint: now.maint - before.maint, fix: now.fix - before.fix });
    before = now;
  }
  return { weeks, hours, perWeek, total: upTo(hours), peak: Math.max(1, ...perWeek.map(shipSum)), upTo };
}
