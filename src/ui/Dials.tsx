import { useEffect, useRef, useState } from 'preact/hooks';
import { DIALS, DRAWERS, STATION_DIALS, clampDial, getPath, type Dial, type Drawer, type FloorStation, type Settings } from '../model/settings';

export type SetDial = (path: string, value: number | boolean | string | null) => void;
interface Ctx { settings: Settings; set: SetDial; commit: () => void }

// A dial's stored value and the number shown in its box differ for shares (0.15 -> 15 %) and short times (0.75 h -> 45 min).
const scaleOf = (d: Dial) => (d.kind === 'pct' ? 100 : d.kind === 'minutes' ? 60 : 1);
const unitOf = (d: Dial) => d.unit ?? (d.kind === 'pct' ? '%' : d.kind === 'minutes' ? 'min' : d.kind === 'hours' ? 'h' : '');
const show = (d: Dial, v: number) => {
  const x = v * scaleOf(d);
  return String(Math.round(x * 100) / 100);
};

function NumberBox({ d, value, ctx, disabled, label }: { d: Dial; value: number; ctx: Ctx; disabled?: boolean; label?: string }) {
  const [text, setText] = useState(show(d, value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(show(d, value)); }, [value, d]);
  const push = (raw: string) => {
    setText(raw);
    const x = parseFloat(raw);
    if (isFinite(x)) ctx.set(d.path, clampDial(d, x / scaleOf(d)));
  };
  const unit = unitOf(d);
  return (
    <span class={`sf-num${d.kind === 'usd' ? ' is-usd' : ''}${disabled ? ' is-off' : ''}`}>
      {d.kind === 'usd' && <span class="sf-num-unit" aria-hidden="true">$</span>}
      <input
        type="number" inputMode="decimal" value={text} disabled={disabled}
        aria-label={label ?? d.label + (unit ? ` (${unit})` : d.kind === 'usd' ? ' (dollars)' : '')}
        min={(d.min ?? 0) * scaleOf(d)} max={(d.hardMax ?? d.max ?? 1e9) * scaleOf(d)} step={Math.round((d.step ?? 1) * scaleOf(d) * 1000) / 1000}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; setText(show(d, value)); }}
        onInput={(e) => push((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter') ctx.commit(); }}
      />
      {unit && <span class="sf-num-unit">{unit}</span>}
    </span>
  );
}

function Slider({ d, value, ctx, disabled }: { d: Dial; value: number; ctx: Ctx; disabled?: boolean }) {
  const min = d.min ?? 0, max = d.max ?? 1;
  const fill = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return (
    <input
      class="sf-slider" type="range" tabIndex={-1} aria-hidden="true" disabled={disabled}
      min={min} max={max} step={d.step ?? 1} value={Math.min(max, value)}
      style={{ '--fill': `${fill * 100}%` }}
      onInput={(e) => ctx.set(d.path, clampDial(d, parseFloat((e.target as HTMLInputElement).value)))}
    />
  );
}

function Toggle({ d, ctx }: { d: Dial; ctx: Ctx }) {
  const on = getPath(ctx.settings, d.path) === true;
  return (
    <button type="button" class="sf-switch" role="switch" aria-checked={on} onClick={() => ctx.set(d.path, !on)}>
      <span class="sf-switch-track"><span class="sf-switch-knob" /></span>
      <span class="sf-switch-text">{on ? 'Yes' : 'No'}</span>
    </button>
  );
}

function Choice({ d, ctx }: { d: Dial; ctx: Ctx }) {
  const v = getPath(ctx.settings, d.path);
  return (
    <span class="sf-seg" role="radiogroup" aria-label={d.label}>
      {d.options!.map((o) => (
        <button type="button" role="radio" aria-checked={o.value === v} class={o.value === v ? 'is-on' : ''} onClick={() => ctx.set(d.path, o.value)}>{o.label}</button>
      ))}
    </span>
  );
}

/** One dial: its label, an editable number and a slider (or a switch, or a choice). */
export function DialRow({ path, ctx, big }: { path: string; ctx: Ctx; big?: boolean }) {
  const d = DIALS[path];
  const raw = getPath(ctx.settings, path);
  const cls = `sf-dial${big ? ' is-big' : ''}`;
  if (d.kind === 'toggle') return <div class={cls}><span class="sf-dial-label">{d.label}</span><Toggle d={d} ctx={ctx} /></div>;
  if (d.kind === 'choice') return <div class={cls}><span class="sf-dial-label">{d.label}</span><Choice d={d} ctx={ctx} /></div>;
  const isNull = raw === null;
  const value = isNull ? (getPath(ctx.settings, 'bugRate') as number) : (raw as number);
  return (
    <div class={cls}>
      <span class="sf-dial-label">{d.label}{d.kind === 'cv' ? '' : ''}</span>
      <NumberBox d={d} value={value} ctx={ctx} disabled={isNull} />
      <Slider d={d} value={value} ctx={ctx} disabled={isNull} />
      {d.nullable && (
        <label class="sf-check"><input type="checkbox" checked={isNull} onChange={(e) => ctx.set(path, (e.target as HTMLInputElement).checked ? null : value)} /> {d.nullable}</label>
      )}
      {d.hint && <span class="sf-dial-hint">{d.hint}</span>}
    </div>
  );
}

/** Step times: one line per step, mean and variability side by side. */
function PairTable({ dials, ctx }: { dials: string[]; ctx: Ctx }) {
  const rows = [];
  for (let i = 0; i < dials.length; i += 2) rows.push([DIALS[dials[i]], DIALS[dials[i + 1]]] as const);
  return (
    <table class="sf-pairs">
      <thead><tr><th scope="col">Step</th><th scope="col">Mean</th><th scope="col">Variability</th></tr></thead>
      <tbody>
        {rows.map(([m, c]) => (
          <tr>
            <th scope="row">{m.label}</th>
            <td><NumberBox d={m} value={getPath(ctx.settings, m.path) as number} ctx={ctx} label={`${m.label} mean (${unitOf(m)})`} /></td>
            <td><NumberBox d={c} value={getPath(ctx.settings, c.path) as number} ctx={ctx} label={`${m.label} variability`} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DrawerView({ drawer, ctx, changed, open, onToggle }: { drawer: Drawer; ctx: Ctx; changed: number; open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <details class="sf-drawer" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary>
        <span class="sf-drawer-title">{drawer.title}</span>
        {changed > 0 && <span class="sf-drawer-changed">{changed} changed</span>}
      </summary>
      <div class="sf-drawer-body">
        {drawer.note && <p class="sf-note">{drawer.note}</p>}
        {drawer.pairs ? <PairTable dials={drawer.dials} ctx={ctx} /> : drawer.dials.map((p) => <DialRow path={p} ctx={ctx} />)}
      </div>
    </details>
  );
}

export function Drawers({ ctx, defaults }: { ctx: Ctx; defaults: Settings }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div class="sf-drawers">
      {DRAWERS.map((dr) => (
        <DrawerView
          drawer={dr} ctx={ctx} open={!!open[dr.id]} onToggle={(o) => setOpen((s) => (s[dr.id] === o ? s : { ...s, [dr.id]: o }))}
          changed={dr.dials.filter((p) => getPath(ctx.settings, p) !== getPath(defaults, p)).length}
        />
      ))}
    </div>
  );
}

/** The dials of the station clicked on the floor. */
export function StationCard({ station, ctx, onClose }: { station: FloorStation; ctx: Ctx; onClose: () => void }) {
  const s = STATION_DIALS[station];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [station]);
  return (
    <section class="sf-station" ref={ref} aria-label={`${s.title} dials`}>
      <header>
        <h3>{s.title}</h3>
        <button type="button" class="sf-link" onClick={onClose}>Close</button>
      </header>
      <div class="sf-station-dials">{s.dials.map((p) => <DialRow path={p} ctx={ctx} />)}</div>
    </section>
  );
}
