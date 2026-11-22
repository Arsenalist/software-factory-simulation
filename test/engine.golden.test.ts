// Golden numbers from the video's model: videos.zarar.dev/.../docs/sim/results.md (v9, 2026-11-22).
// Every expected value is copied from that file and compared at the precision its tables print.
import { describe, expect, test } from 'vitest';
import { BASE, MONEY, bill, mergeCfg, runMany, sim, pickMedianSeed, seedFor, type Overrides } from '../src/engine';

const h = (x: number) => (!isFinite(x) ? '—' : x >= 48 ? `${(x / 24).toFixed(1)} d` : `${x.toFixed(1)} h`);
const n1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;

const row = (over: Overrides) => {
  const r = runMany(over);
  return [h(r.p50), h(r.p95), n1(r.featuresPerDay), n1(r.at9), pct(r.humanUtil), pct(r.diagShare), n1(r.busyPerF), n1(r.paidPerF), n1(r.bugLivePerF), usd(r.tokensPerF), n1(r.conflictsPerDay)].join(' | ');
};
const billRow = (over: Overrides, dials: keyof typeof MONEY) => {
  const b = bill(runMany(over), MONEY[dials]);
  return [usd(b.parts.tokens), usd(b.parts.ci), usd(b.parts.people), usd(b.parts.waiting), usd(b.parts.bugs), usd(b.total), `${b.tokensRank} of 5`].join(' | ');
};

describe('baseline', () => {
  test('headline measures', () => {
    const r = runMany({});
    expect(h(r.p50)).toBe('19.2 h');
    expect(h(r.p95)).toBe('2.9 d');
    expect(pct(r.humanUtil)).toBe('76%');
    expect(n1(r.at9)).toBe('4.7');
    expect(n1(r.busyPerF)).toBe('4.2');
    expect(n1(r.paidPerF)).toBe('5.5');
    expect(n1(r.bugLivePerF)).toBe('5.9');
    expect(usd(r.tokensPerF)).toBe('$66');
  });
  test('full table row', () => {
    expect(row({})).toBe('19.2 h | 2.9 d | 3.1 | 4.7 | 76% | 4% | 4.2 | 5.5 | 5.9 | $66 | 0.3');
  });
  test('hours per feature behind the bill', () => {
    const r = runMany({});
    expect([n1(r.specPerF), n1(r.reviewPerF), n1(r.diagPerF), n1(r.waitPerF), usd(r.tokensPerWorkday)]).toEqual(['2.0', '2.1', '0.2', '21.8', '$289']);
  });
});

describe('the bill', () => {
  test('baseline at low, mid and high dials', () => {
    expect(billRow({}, 'low')).toBe('$66 | $1 | $332 | $44 | $59 | $501 | 2 of 5');
    expect(billRow({}, 'mid')).toBe('$66 | $1 | $553 | $218 | $295 | $1,132 | 4 of 5');
    expect(billRow({}, 'high')).toBe('$66 | $1 | $829 | $544 | $1,179 | $2,619 | 4 of 5');
  });
  test('4 features/day', () => {
    expect(billRow({ featuresPerDay: 4 }, 'mid')).toBe('$63 | $1 | $424 | $332 | $296 | $1,117 | 4 of 5');
  });
  test('no human review', () => {
    expect(billRow({ review: { on: false } }, 'mid')).toBe('$59 | $1 | $550 | $39 | $647 | $1,295 | 3 of 5');
  });
  test('no review on maintenance', () => {
    expect(billRow({ review: { maint: false } }, 'mid')).toBe('$65 | $1 | $553 | $184 | $452 | $1,255 | 4 of 5');
  });
  test('maintenance 5% buggy, with and without maintenance review', () => {
    expect(billRow({ maintBugRate: 0.05 }, 'mid')).toBe('$65 | $1 | $551 | $207 | $235 | $1,060 | 4 of 5');
    expect(billRow({ maintBugRate: 0.05, review: { maint: false } }, 'high')).toBe('$62 | $1 | $827 | $473 | $1,066 | $2,429 | 4 of 5');
  });
  test('StrongDM token spend: $1,000 per person per working day', () => {
    const base = runMany({});
    const strongdm = (1000 * BASE.humans * 5) / base.buildsPerWeek;
    expect(strongdm.toFixed(0)).toBe('260');
    expect(billRow({ tokensPerBuild: strongdm }, 'mid')).toBe('$687 | $1 | $553 | $218 | $295 | $1,753 | 1 of 5');
    expect(usd(runMany({ tokensPerBuild: strongdm }).tokensPerWorkday)).toBe('$3,000');
  });
});

describe('experiment rows', () => {
  const careful = { review: { mean: 1.67, catch: 0.8 }, diagnose: { mean: 1.5 } };
  const cases: [string, Overrides, string][] = [
    ['E1 2/day', { featuresPerDay: 2 }, '17.7 h | 2.8 d | 2.1 | 3.7 | 56% | 4% | 4.6 | 8.2 | 6.8 | $78 | 0.2'],
    ['E1 4.5/day', { featuresPerDay: 4.5 }, '43.6 h | 4.9 d | 4.5 | 6.3 | 106% | 4% | 4.0 | 3.8 | 5.4 | $61 | 0.5'],
    ['E1 5/day', { featuresPerDay: 5 }, '7.9 d | 10.9 d | 4.8 | 6.7 | 112% | 4% | 4.0 | 3.6 | 5.3 | $59 | 0.5'],
    ['E3 16 agents, 3 people', { featuresPerDay: 4.5, agents: 16 }, '43.6 h | 4.9 d | 4.5 | 6.3 | 106% | 4% | 4.0 | 3.8 | 5.4 | $61 | 0.5'],
    ['E3 8 agents, 4 people', { featuresPerDay: 4.5, humans: 4 }, '18.5 h | 2.9 d | 4.5 | 5.7 | 79% | 4% | 4.0 | 5.1 | 5.0 | $60 | 0.4'],
    ['E4 35% buggy', { bugRate: 0.35 }, '22.7 h | 3.1 d | 3.1 | 5.5 | 91% | 11% | 5.0 | 5.5 | 17.5 | $82 | 0.4'],
    ['E6 25% other rejections', { review: { reject: 0.25 } }, '21.1 h | 3.0 d | 3.1 | 5.2 | 83% | 3% | 4.6 | 5.5 | 4.2 | $81 | 0.3'],
    ['E7 agents read telemetry', { prod: { mode: 'agents' } }, '18.9 h | 2.9 d | 3.1 | 4.7 | 75% | 4% | 4.3 | 5.5 | 0.3 | $67 | 0.3'],
    ['E7 agents, 2 tickets/bug', { prod: { mode: 'agents', dupes: 2 } }, '19.5 h | 2.9 d | 3.1 | 4.9 | 79% | 7% | 4.4 | 5.5 | 0.1 | $70 | 0.3'],
    ['E8 tests catch 80%', { testCatch: 0.8, spec: { mean: 2.5 }, build: { mean: 0.9 } }, '20.3 h | 2.9 d | 3.1 | 5.0 | 80% | 1% | 4.5 | 5.5 | 1.7 | $67 | 0.3'],
    ['E9 careful review', careful, '26.0 h | 5.0 d | 3.1 | 5.2 | 99% | 1% | 5.6 | 5.5 | 2.1 | $67 | 0.3'],
    ['E9 careful, 25% buggy, 4 people', { ...careful, bugRate: 0.25, humans: 4 }, '19.9 h | 3.0 d | 3.1 | 5.0 | 78% | 1% | 5.7 | 7.4 | 4.1 | $75 | 0.3'],
    ['E10 no maintenance', { maintPerDay: 0 }, '17.9 h | 2.8 d | 3.1 | 2.3 | 60% | 3% | 3.4 | 5.5 | 2.3 | $40 | 0.1'],
    ['E10 4 maintenance/day', { maintPerDay: 4 }, '22.5 h | 3.7 d | 3.1 | 7.5 | 93% | 5% | 5.2 | 5.5 | 9.3 | $97 | 0.6'],
    ['E10b no review on maintenance', { review: { maint: false } }, '17.8 h | 2.9 d | 3.1 | 2.3 | 66% | 9% | 3.6 | 5.5 | 9.0 | $65 | 0.2'],
    ['E10b maintenance 5% buggy, no maintenance review', { maintBugRate: 0.05, review: { maint: false } }, '18.1 h | 2.9 d | 3.1 | 2.3 | 60% | 4% | 3.5 | 5.5 | 5.3 | $62 | 0.2'],
    ['E11 round the clock', { shift: false }, '4.6 h | 9.1 h | 3.1 | 0.0 | 18% | 4% | 4.2 | 23.2 | 7.0 | $64 | 0.1'],
    ['E12 no review', { review: { on: false } }, '3.4 h | 7.3 h | 3.1 | 0.0 | 44% | 18% | 2.5 | 5.5 | 12.9 | $59 | 0.1'],
    ['E12 no review, 1 person', { review: { on: false }, humans: 1 }, '14.2 d | 19.3 d | 2.8 | 0.0 | 117% | 19% | 2.4 | 2.0 | 14.2 | $61 | 0.0'],
    ['E12b cannot roll back', { mitigate: { mean: 24, cv: 1 } }, '19.2 h | 2.9 d | 3.1 | 4.7 | 76% | 4% | 4.2 | 5.5 | 7.8 | $66 | 0.3'],
    ['E12b no review, agents, cannot roll back', { review: { on: false }, prod: { mode: 'agents' }, mitigate: { mean: 24, cv: 1 } }, '3.4 h | 7.2 h | 3.1 | 0.0 | 45% | 16% | 2.4 | 5.5 | 4.2 | $59 | 0.1'],
    ['E14 two teams pooled', { humans: 6, agents: 16, ciRunners: 12, featuresPerDay: 6, maintPerDay: 4 }, '18.1 h | 2.9 d | 6.0 | 9.2 | 76% | 4% | 4.3 | 5.7 | 5.8 | $72 | 1.0'],
  ];
  test.each(cases)('%s', (_name, over, expected) => { expect(row(over)).toBe(expected); });

  test('E13 StrongDM bar: $687 tokens per feature', () => {
    const strongdm = (1000 * BASE.humans * 5) / runMany({}).buildsPerWeek;
    expect(usd(runMany({ tokensPerBuild: strongdm }).tokensPerF)).toBe('$687');
  });
});

describe('run-to-run spread at baseline', () => {
  test('lowest and highest of the 9 seeds', () => {
    const rs = Array.from({ length: 9 }, (_, i) => sim(BASE, seedFor(i)));
    const lo = (k: 'p50' | 'bugLivePerF') => Math.min(...rs.map((r) => r[k]));
    const hi = (k: 'p50' | 'bugLivePerF') => Math.max(...rs.map((r) => r[k]));
    expect([h(lo('p50')), h(hi('p50')), n1(lo('bugLivePerF')), n1(hi('bugLivePerF'))]).toEqual(['18.3 h', '19.9 h', '3.4', '11.3']);
  });
});

describe('trace mode', () => {
  const configs: [string, Overrides][] = [
    ['baseline', {}],
    ['no review, agents watch, 2 tickets per bug', { review: { on: false }, prod: { mode: 'agents', dupes: 2 } }],
    ['overloaded', { featuresPerDay: 5 }],
    ['round the clock', { shift: false }],
  ];
  test.each(configs)('a traced run returns the same metrics as an untraced one: %s', (_n, over) => {
    const cfg = mergeCfg(BASE, over);
    for (const seed of [seedFor(0), seedFor(4)]) {
      const traced = sim(cfg, seed, true);
      expect(traced.trace).toBeDefined();
      const { trace: _t, ...metrics } = traced;
      expect(metrics).toEqual(sim(cfg, seed));
    }
  });

  test('the seed to animate is the one whose median lead is the median of the 9', () => {
    const rs = Array.from({ length: 9 }, (_, i) => sim(BASE, seedFor(i)));
    const i = pickMedianSeed(rs);
    expect(h(rs[i].p50)).toBe('19.2 h');
    expect(rs[i].p50).toBe(runMany({}).p50);
  });

  test('the trace tells each job’s story in order', () => {
    const { trace } = sim(BASE, seedFor(0), true);
    const t = trace!;
    expect(t.visits.length).toBeGreaterThan(1000);
    for (const v of t.visits) {
      expect(v.start).toBeGreaterThanOrEqual(v.enq);
      expect(v.end).toBeGreaterThanOrEqual(v.start);
    }
    // people never start work off shift
    const onShift = (x: number) => Math.floor(x / 24) % 7 < 5 && x % 24 >= 9 && x % 24 < 17;
    for (const v of t.visits) if (['spec', 'review', 'diagnose'].includes(v.st) && isFinite(v.start)) expect(onShift(v.start)).toBe(true);
    // no pool slot serves two jobs at once
    const bySlot = new Map<string, { start: number; end: number }[]>();
    for (const v of t.visits) {
      if (!isFinite(v.start) || v.st === 'judge') continue;
      const pool = ['spec', 'review', 'diagnose'].includes(v.st) ? 'humans' : v.st;
      const k = `${pool}:${v.slot}`;
      (bySlot.get(k) ?? bySlot.set(k, []).get(k)!).push(v);
    }
    for (const [k, list] of bySlot) {
      expect(Number(k.split(':')[1])).toBeLessThan(k.startsWith('humans') ? BASE.humans : k.startsWith('build') ? BASE.agents : BASE.ciRunners);
      list.sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i++) expect(list[i].start).toBeGreaterThanOrEqual(list[i - 1].end);
    }
    // every escaped bug is found, mitigated, diagnosed and comes back as a fix
    expect(t.bugs.length).toBeGreaterThan(20);
    for (const b of t.bugs) {
      expect(b.found).toBeGreaterThan(b.merged);
      if (b.mitigated != null) {
        expect(b.mitigated).toBeGreaterThanOrEqual(b.found);
        expect(b.tickets.length).toBe(BASE.prod.dupes);
      }
    }
    const fixes = t.jobs.filter((j) => j.kind === 'fix');
    expect(fixes.length).toBeGreaterThan(20);
    for (const f of fixes) expect(t.jobs[f.parent!].kind).toBe('diag');
    // merges and escapes are recorded on the visit that led to them
    const outs = new Set(t.visits.map((v) => v.out));
    for (const o of ['next', 'caught', 'reject', 'merge', 'escape', 'conflict', 'fix']) expect(outs.has(o as never)).toBe(true);
  });
});

test('nine six-month runs take well under 2 s', () => {
  const t0 = performance.now();
  runMany({});
  expect(performance.now() - t0).toBeLessThan(2000);
});
