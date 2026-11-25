// What shipped, week by week: one thin column per week, so the chart is the same height for 4 weeks or 104.
// While the floor plays, the columns fill in up to the clock; with the floor hidden it shows the whole run.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Trace } from '../engine';
import { n1 } from '../ui/format';
import { createTally, HOURS_PER_WEEK, SHIPPED, shipSum, type ShipCount, type Shipped } from './playback';

export interface TallyHandle { paint: ((t: number) => void) | null }
export interface TallyProps { trace: Trace | null; live: boolean; handle: TallyHandle; floorShown: boolean; onToggleFloor: () => void }

const NAMES: Record<Shipped, [string, string]> = { feature: ['feature', 'features'], maint: ['maintenance', 'maintenance'], fix: ['fix', 'fixes'] };
const spell = (c: ShipCount) => SHIPPED.map((k) => `${c[k]} ${NAMES[k][c[k] === 1 ? 0 : 1]}`).join(', ');
const minus = (a: ShipCount, b: ShipCount): ShipCount => ({ feature: a.feature - b.feature, maint: a.maint - b.maint, fix: a.fix - b.fix });

export function Tally({ trace, live, handle, floorShown, onToggleFloor }: TallyProps) {
  const tally = useMemo(() => (trace ? createTally(trace) : null), [trace]);
  // `cut` is the clock: everything merged up to it is drawn. Infinity means the whole run.
  const [cut, setCut] = useState(Infinity);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!live || !tally) { handle.paint = null; setCut(Infinity); return; }
    let key = '';
    // called every frame by the floor; only a new merge or a new week re-renders
    handle.paint = (t) => {
      const c = tally.upTo(t), k = `${Math.floor(t / HOURS_PER_WEEK)}|${c.feature}|${c.maint}|${c.fix}`;
      if (k !== key) { key = k; setCut(t); }
    };
    return () => { handle.paint = null; };
  }, [live, tally, handle]);

  const toggle = <button type="button" class="sf-link" onClick={onToggleFloor} aria-pressed={!floorShown}>{floorShown ? 'Hide the factory floor' : 'Show the factory floor'}</button>;
  if (!tally) return <section class="sf-tally" aria-label="Shipped each week"><header class="sf-tally-head"><h2>Shipped, <strong>week by week</strong></h2>{toggle}</header></section>;

  const whole = cut >= tally.hours;
  const nowWeek = whole ? tally.weeks - 1 : Math.max(0, Math.min(tally.weeks - 1, Math.floor(cut / HOURS_PER_WEEK)));
  const soFar = whole ? tally.total : tally.upTo(cut);
  const weekCount = (w: number): ShipCount => (whole || w < nowWeek ? tally.perWeek[w] : w > nowWeek ? { feature: 0, maint: 0, fix: 0 } : minus(soFar, tally.upTo(w * HOURS_PER_WEEK)));

  const shown = hover != null && hover < tally.weeks ? hover : null;
  const scope = shown != null ? weekCount(shown) : soFar;
  const scopeName = shown != null ? `Week ${shown + 1}` : whole ? 'Whole run' : 'So far';
  const step = tally.weeks <= 12 ? 1 : tally.weeks <= 30 ? 5 : tally.weeks <= 60 ? 10 : 20;
  const tight = tally.weeks > 52;

  return (
    <section class="sf-tally" aria-label="Shipped each week">
      <header class="sf-tally-head">
        <h2>Shipped, <strong>week by week</strong></h2>
        {toggle}
      </header>
      <div class="sf-tally-read">
        <p class="sf-tally-figs">
          {!whole && <span>Week {nowWeek + 1} <b>{shipSum(weekCount(nowWeek))}</b></span>}
          {!whole && <span>So far <b>{shipSum(soFar)}</b></span>}
          <span>Whole run <b>{shipSum(tally.total)}</b></span>
          <span>A week, on average <b>{n1(shipSum(tally.total) / (tally.hours / HOURS_PER_WEEK))}</b></span>
        </p>
        <p class="sf-tally-kinds">
          <span class="sf-tally-scope">{scopeName}:</span>
          {SHIPPED.map((k) => <span><i class={`is-${k}`} /><b>{scope[k]}</b> {NAMES[k][scope[k] === 1 ? 0 : 1]}</span>)}
        </p>
      </div>
      <div class={`sf-tally-chart${tight ? ' is-tight' : ''}`} role="img" aria-label={`Changes that reached production in each of ${tally.weeks} weeks. Whole run: ${spell(tally.total)}.`} onMouseLeave={() => setHover(null)}>
        {tally.perWeek.map((full, w) => {
          const c = weekCount(w);
          return (
            <div class={`sf-tally-col${!whole && w === nowWeek ? ' is-now' : ''}${shown === w ? ' is-hot' : ''}`} title={`Week ${w + 1}: ${spell(c)}${!whole && w >= nowWeek ? (w === nowWeek ? ' so far' : '') : ''}`} onMouseEnter={() => setHover(w)}>
              {SHIPPED.map((k) => <i class={`is-${k}`} style={{ height: `${(c[k] / tally.peak) * 100}%` }} />)}
              {!whole && w > nowWeek && shipSum(full) > 0 && <i class="is-ahead" />}
            </div>
          );
        })}
      </div>
      <div class={`sf-tally-axis${tight ? ' is-tight' : ''}`} aria-hidden="true">
        {tally.perWeek.map((_, w) => <span>{w === 0 || (w + 1) % step === 0 ? <em>{w + 1}</em> : null}</span>)}
      </div>
      <p class="sf-tally-note">Changes that reached production in the run {floorShown ? 'playing on the floor' : 'behind these numbers'}, one column a week. The first weeks start from an empty factory.</p>
    </section>
  );
}
