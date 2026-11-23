import { describe, expect, test } from 'vitest';
import { BASE, mergeCfg, seedFor, sim, type Station } from '../src/engine';
import { createPlayback, STATIONS } from '../src/floor/playback';

const caps = { humans: BASE.humans, agents: BASE.agents, ciRunners: BASE.ciRunners, shift: true };
const run = sim(BASE, seedFor(0), true);
const pb = createPlayback(run.trace!, caps);
const { visits } = run.trace!;

describe('playback of the baseline', () => {
  test('queues and work in progress match a brute-force reading of the trace', () => {
    for (const t of [700.3, 849, 1000.5, 2345.67, 4000.01]) {
      const s = pb.at(t);
      for (const st of STATIONS) {
        const expected = visits.map((v, i) => [v, i] as const).filter(([v]) => v.st === st && v.enq <= t && t < v.start).map(([, i]) => i);
        expect(s.queues[st], `${st} @ ${t}`).toEqual(expected);
        expect(s.queueLen[st]).toBe(expected.length);
      }
      const serving = visits.map((v, i) => [v, i] as const).filter(([v]) => v.start <= t && t < v.end).map(([, i]) => i);
      expect([...s.serving].sort((a, b) => a - b)).toEqual(serving);
    }
  });

  test('the review pile grows overnight and is waiting at 9am', () => {
    // mean pile at 5pm vs the next working morning, across the measured weeks
    let evening = 0, morning = 0, n = 0;
    for (let day = Math.ceil(run.trace!.warmEnd / 24); day * 24 + 33 < pb.hours; day++) {
      if (day % 7 >= 4) continue; // Mon–Thu evenings, so the next morning is a working day
      evening += pb.queueLength('review', day * 24 + 17);
      morning += pb.queueLength('review', day * 24 + 33 - 1e-6);
      n++;
    }
    expect(morning / n).toBeGreaterThan(evening / n + 1);
    // and that 9am pile is the model's own "9am review pile" for this seed
    let at9 = 0, days = 0;
    for (let day = 0; day * 24 < pb.hours; day++) {
      const t = day * 24 + 9;
      if (day % 7 >= 5 || t < run.trace!.warmEnd || t > pb.hours) continue;
      at9 += pb.queueLength('review', t - 1e-6); days++;
    }
    expect(at9 / days).toBeCloseTo(run.at9, 6);
  });

  test('nobody works off shift unless they are finishing something', () => {
    const s = pb.at(pb.start + 24 * 5 + 3); // Saturday 10:00
    expect(s.onShift).toBe(false);
    const people: Station[] = ['spec', 'review', 'diagnose'];
    expect(s.serving.filter((i) => people.includes(visits[i].st)).length).toBe(0);
  });

  test('bugs go live in production and stay until mitigated', () => {
    const b = run.trace!.bugs.find((x) => x.mitigated != null && x.mitigated - x.merged > 5 && x.merged > pb.start)!;
    expect(pb.at(b.merged + 1).liveBugs).toContain(b);
    expect(pb.at(b.mitigated! + 0.01).liveBugs).not.toContain(b);
  });

  test('station stats agree with the model’s metrics', () => {
    const people = pb.stats.spec.load + pb.stats.review.load + pb.stats.diagnose.load;
    expect(people).toBeCloseTo(run.humanUtil, 1);
    expect(pb.merge.conflictsPerDay).toBeCloseTo(run.conflictsPerDay, 1);
    expect(pb.production.escapedPerDay).toBeCloseTo(run.escapedPerDay, 6);
  });

  test('playback opens on a Monday morning before people arrive', () => {
    expect(pb.start % 168).toBe(7);
    expect(pb.start).toBeGreaterThanOrEqual(run.trace!.warmEnd);
  });
});

test('an overloaded factory still plays back (queues that never drain)', () => {
  const cfg = mergeCfg(BASE, { featuresPerDay: 8 });
  const r = sim(cfg, seedFor(0), true);
  const p = createPlayback(r.trace!, caps);
  const s = p.at(p.hours - 1, 40);
  expect(s.queueLen.spec + s.queueLen.review).toBeGreaterThan(100);
  expect(s.queues.spec.length).toBeLessThanOrEqual(40);
});
