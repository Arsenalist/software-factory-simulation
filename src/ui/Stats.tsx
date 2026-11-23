import type { Metrics } from '../engine';
import { Diff } from './Bill';
import { delta, fmtHours, n1, pct, usd } from './format';

type Fmt = (x: number) => string;
type Del = (a: number, b: number) => string | null;
interface Stat { key: keyof Metrics; label: string; fmt: Fmt; del: Del; note: string; higherIsBetter?: boolean }

const STATS: Stat[] = [
  { key: 'p50', label: 'Median lead time', fmt: fmtHours, del: delta.hours, note: 'Request to production, for the typical feature.' },
  { key: 'p95', label: 'Slowest 1 in 20', fmt: fmtHours, del: delta.hours, note: '95th percentile lead time.' },
  { key: 'featuresPerDay', label: 'Shipped a day', fmt: n1, del: delta.n1, note: 'Features that reached production.', higherIsBetter: true },
  { key: 'humanUtil', label: 'People load', fmt: pct, del: delta.pts, note: 'Busy hours over paid hours. Past 80% the queues grow fast.' },
  { key: 'diagShare', label: 'Diagnosis share', fmt: pct, del: delta.pts, note: 'Of people’s busy hours, the part spent on production bugs.' },
  { key: 'at9', label: '9am review pile', fmt: n1, del: delta.n1, note: 'Changes waiting for review when people walk in.' },
  { key: 'bugLivePerF', label: 'Bug-hours live', fmt: (x) => `${n1(x)} h`, del: delta.hours, note: 'Per feature shipped.' },
  { key: 'conflictsPerDay', label: 'Merge conflicts a day', fmt: n1, del: delta.n1, note: 'Each one goes back for a rebuild.' },
  { key: 'tokensPerWorkday', label: 'Tokens a working day', fmt: usd, del: delta.usd, note: 'For the whole team.' },
];

function LoadMeter({ load }: { load: number }) {
  return (
    <span class="sf-meter" aria-hidden="true">
      <span class={`sf-meter-fill${load > 0.8 ? ' is-over' : ''}`} style={{ width: `${Math.min(1.25, load) / 1.25 * 100}%` }} />
      <span class="sf-meter-mark" style={{ left: `${(0.8 / 1.25) * 100}%` }} />
    </span>
  );
}

export function Stats({ now, baseline, pinned, isBaseline }: { now: Metrics; baseline: Metrics | null; pinned: Metrics | null; isBaseline: boolean }) {
  const ref = pinned ?? (isBaseline ? null : baseline);
  return (
    <section class="sf-stats" aria-label="How the factory ran">
      <p class="sf-stats-key">{pinned ? 'Changes are B (now) against A (pinned).' : isBaseline ? 'Change a dial and each number shows how far it moved.' : 'Changes are against the default factory.'}</p>
      <dl>
        {STATS.map((s) => {
          const v = now[s.key], r = ref?.[s.key];
          const d = r == null ? null : s.del(v, r);
          const worse = r != null && (s.higherIsBetter ? v < r : v > r);
          return (
            <div class="sf-stat" title={s.note}>
              <dt>{s.label}</dt>
              <dd>
                <span class="sf-stat-value">{s.fmt(v)}</span>
                {s.key === 'humanUtil' && <LoadMeter load={v} />}
                {ref && <span class="sf-stat-diff">{d ? <Diff text={d} worse={worse} /> : <span class="sf-diff is-same">same</span>}{pinned && <span class="sf-stat-a"> A: {s.fmt(r!)}</span>}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
