import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Station, Trace } from '../engine';
import { STATION_DIALS, type FloorStation, type Settings } from '../model/settings';
import { clock, fmtHours, n1, pct } from '../ui/format';
import { createPlayback, type FloorState, type Playback } from './playback';
import type { FloorScene, Palette } from './scene';
import { Diagram } from './Diagram';

export interface FloorProps { trace: Trace | null; settings: Settings; focus: FloorStation | null; onSelect: (s: FloorStation | null) => void; force2d?: boolean }

/** One sim week plays in about 60 s at 1×. */
const HOURS_PER_SECOND = 168 / 60;
const SPEEDS = [1, 4, 16];
const LABELS: Record<FloorStation, string> = { spec: 'Spec', build: 'Build', ci: 'CI', judge: 'Judge', review: 'Review', merge: 'Merge', production: 'Production', diagnose: 'Diagnosis' };
const QUEUED: FloorStation[] = ['spec', 'build', 'ci', 'review', 'diagnose'];

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el), v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return { paper: v('--sf-paper', '#f2f5f2'), card: v('--sf-card', '#ffffff'), ink: v('--sf-ink', '#17241f'), pine: v('--sf-pine', '#1f6b5a'), rust: v('--sf-rust', '#8a3f1f'), rule: v('--sf-rule', '#c9d3cd'), muted: v('--sf-muted', '#586660') };
}
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export function Floor({ trace, settings, focus, onSelect, force2d }: FloorProps) {
  const root = useRef<HTMLElement>(null), stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const labelEls = useRef<Partial<Record<FloorStation, HTMLDivElement>>>({});
  const clockEl = useRef<HTMLDivElement>(null), scrubEl = useRef<HTMLInputElement>(null), pileEl = useRef<HTMLDivElement>(null), weekEl = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<'3d' | '2d'>(() => (force2d || !hasWebGL() ? '2d' : '3d'));
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [speed, setSpeed] = useState(1);
  const [hover, setHover] = useState<{ id: FloorStation; x: number; y: number } | null>(null);

  const pb = useMemo<Playback | null>(() => (trace ? createPlayback(trace, { humans: settings.humans, agents: settings.agents, ciRunners: settings.ciRunners, shift: settings.shift }) : null), [trace, settings]);

  // everything the animation loop reads lives in refs, so playback never re-renders the component
  const live = useRef({ pb, settings, playing, speed, t: -1, snap: true, state: null as FloorState | null, scene: null as FloorScene | null, visible: true, focus, hoverId: null as FloorStation | null });
  live.current.playing = playing; live.current.speed = speed; live.current.focus = focus;
  if (live.current.pb !== pb) { live.current.pb = pb; live.current.settings = settings; live.current.snap = true; if (pb && (live.current.t < 0 || live.current.t > pb.hours)) live.current.t = pb.start; if (pb) live.current.scene?.setFactory(pb, settings); }

  useEffect(() => {
    if (mode !== '3d') return;
    let dead = false, raf = 0, last = performance.now(), scene: FloorScene | null = null, pileShown = -1;
    const L = live.current;
    const phone = matchMedia('(max-width: 700px), (pointer: coarse)').matches;

    import('./scene').then(({ createFloorScene }) => {
      if (dead) return;
      try { scene = createFloorScene(canvas.current!, readPalette(root.current!), { phone }); }
      catch { setMode('2d'); return; }
      L.scene = scene;
      scene.resize();
      if (L.pb) scene.setFactory(L.pb, L.settings);
      scene.setHot(null, L.focus);
      raf = requestAnimationFrame(loop);
    });

    const paint = (st: FloorState, pbk: Playback) => {
      const c = clock(st.t);
      if (clockEl.current) {
        const [time, day, shift] = clockEl.current.children as unknown as HTMLElement[];
        time.textContent = `${c.day} ${c.time}`;
        day.textContent = `Week ${c.week} of ${Math.round(pbk.hours / 168)}`;
        shift.textContent = !L.settings.shift ? 'People on shift, round the clock' : st.onShift ? 'People at work' : c.weekend ? 'Weekend: only agents and CI are running' : 'Night: only agents and CI are running';
        shift.classList.toggle('is-off', !st.onShift);
      }
      root.current?.classList.toggle('is-night', !st.onShift);
      if (scrubEl.current && document.activeElement !== scrubEl.current) scrubEl.current.value = String(st.t);
      if (weekEl.current) weekEl.current.textContent = `${c.day} ${c.time}, week ${c.week}`;
      const a = scene!.anchors();
      for (const id of Object.keys(LABELS) as FloorStation[]) {
        const el = labelEls.current[id]; if (!el) continue;
        el.style.transform = `translate(${a[id].x.toFixed(1)}px, ${a[id].y.toFixed(1)}px)`;
        const small = el.querySelector('small') as HTMLElement;
        if (id === 'production') { small.textContent = st.liveBugs.length ? `${st.liveBugs.length} bug${st.liveBugs.length > 1 ? 's' : ''} live` : 'no bugs live'; el.classList.toggle('is-piled', st.liveBugs.length > 0); }
        else if (id === 'review' && L.settings.review.share <= 0) { small.textContent = 'nobody reviews'; el.classList.remove('is-piled'); }
        else if (QUEUED.includes(id)) { const q = st.queueLen[id as Station]; small.textContent = q ? `${q} waiting` : id === 'diagnose' ? 'no tickets' : 'clear'; el.classList.toggle('is-piled', q >= (id === 'review' ? 4 : 6)); }
        el.classList.toggle('is-hot', L.hoverId === id || L.focus === id);
      }
      // the 9am note: what was waiting for review when people walked in
      if (pileEl.current) {
        const day = Math.floor(st.t / 24), since9 = st.t - (day * 24 + 9), show = L.settings.shift && day % 7 < 5 && since9 >= 0 && since9 < 2.2 && L.settings.review.share > 0;
        if (show && pileShown !== day) { pileShown = day; (pileEl.current.firstElementChild as HTMLElement).textContent = String(pbk.queueLength('review', day * 24 + 9 - 1e-6)); }
        pileEl.current.classList.toggle('is-on', show);
      }
    };

    const loop = (nowMs: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
      const pbk = L.pb;
      if (!scene || !pbk || !L.visible) return;
      if (L.playing) { L.t += dt * L.speed * HOURS_PER_SECOND; if (L.t >= pbk.hours) { L.t = pbk.start; L.snap = true; } }
      const st = pbk.at(L.t, phone ? 20 : 44);
      L.state = st;
      scene.frame(st, dt, L.speed, L.snap);
      L.snap = false;
      paint(st, pbk);
    };

    const ro = new ResizeObserver(() => { scene?.resize(); L.snap = true; });
    ro.observe(stage.current!);
    const io = new IntersectionObserver(([e]) => { L.visible = e.isIntersecting; last = performance.now(); });
    io.observe(stage.current!);

    // pointer: drag orbits, wheel or pinch zooms, hover reads a station, click opens its dials
    const el = stage.current!;
    const ptrs = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch = 0, engaged = false;
    const down = (e: PointerEvent) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; engaged = true; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } };
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId);
      if (!p) {
        if (e.pointerType !== 'mouse' || !scene) return;
        const id = scene.pick(e.clientX, e.clientY), r = el.getBoundingClientRect();
        L.hoverId = id; scene.setHot(id, L.focus);
        el.classList.toggle('is-pointing', !!id);
        setHover((h) => (id ? { id, x: e.clientX - r.left, y: e.clientY - r.top } : h ? null : h));
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) scene?.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
      } else if (moved > 4) {
        if (e.pointerType === 'mouse') el.setPointerCapture(e.pointerId);
        el.classList.add('is-dragging'); setHover(null);
        scene?.orbit(dx, e.pointerType === 'mouse' ? dy : 0); // on touch, vertical swipes scroll the page
      }
    };
    const upP = (e: PointerEvent) => {
      const had = ptrs.delete(e.pointerId); pinch = 0;
      el.classList.remove('is-dragging');
      if (had && moved <= 4 && e.type === 'pointerup' && scene) { const id = scene.pick(e.clientX, e.clientY); onSelectRef.current(id); }
    };
    const leave = () => { L.hoverId = null; scene?.setHot(null, L.focus); el.classList.remove('is-pointing'); setHover(null); engaged = false; };
    // The wheel zooms once you have touched the floor (or with ctrl/cmd, which is also a trackpad pinch); otherwise it scrolls the page.
    const wheel = (e: WheelEvent) => { if (!scene || !(engaged || e.ctrlKey || e.metaKey)) return; e.preventDefault(); scene.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX, e.clientY); };
    const dbl = () => scene?.resetView();
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', upP); el.addEventListener('pointercancel', upP);
    el.addEventListener('pointerleave', leave); el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('dblclick', dbl);

    return () => {
      dead = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', upP); el.removeEventListener('pointercancel', upP);
      el.removeEventListener('pointerleave', leave); el.removeEventListener('wheel', wheel); el.removeEventListener('dblclick', dbl);
      scene?.dispose(); L.scene = null;
    };
  }, [mode]);

  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;
  useEffect(() => { live.current.scene?.setHot(live.current.hoverId, focus); }, [focus]);

  if (mode === '2d') return <section class="sf-floor is-flat" ref={root} aria-label="The factory line"><Diagram pb={pb} settings={settings} focus={focus} onSelect={onSelect} /></section>;

  const L = live.current;
  const scrub = (e: Event) => { L.t = parseFloat((e.target as HTMLInputElement).value); L.snap = true; };
  return (
    <section class="sf-floor" ref={root} aria-label="The factory floor">
      <div class="sf-floor-stage" ref={stage}>
        <canvas ref={canvas} role="img" aria-label="An animated factory floor: feature crates move from spec desks through build bays, CI, the judge gate and review desks to production. At night the people leave and crates pile up in front of the review desks." />
        <div class="sf-floor-labels" aria-hidden="true">
          {(Object.keys(LABELS) as FloorStation[]).map((id) => (
            <div class="sf-label" ref={(el) => { if (el) labelEls.current[id] = el; }}><span><b>{LABELS[id]}</b><small /></span></div>
          ))}
        </div>
        <div class="sf-clock" ref={clockEl} aria-hidden="true"><span class="sf-clock-time">Mon 07:00</span><span>Week 1</span><span class="sf-clock-shift" /></div>
        <div class="sf-pile-note" ref={pileEl} aria-hidden="true">9am: <b>0</b> waiting for review</div>
        {hover && pb && <Tip id={hover.id} x={hover.x} y={hover.y} pb={pb} state={L.state} settings={settings} width={stage.current?.clientWidth ?? 800} />}
      </div>
      <div class="sf-play">
        <button type="button" class="sf-btn" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? 'Pause' : 'Play'}</button>
        <span class="sf-seg" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => <button type="button" class={speed === s ? 'is-on' : ''} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
        </span>
        <label class="sf-scrub">
          <span class="sf-scrub-meta"><span>Scrub the run</span><span ref={weekEl} /></span>
          <input class="sf-slider" ref={scrubEl} type="range" min={0} max={pb?.hours ?? 4368} step={0.25} defaultValue={String(pb?.start ?? 0)} onInput={scrub} aria-label="Position in the run, in hours" />
        </label>
      </div>
      <ul class="sf-legend" aria-label="What the shapes are">
        <li><i class="is-feature" /> feature</li><li><i class="is-maint" /> maintenance</li><li><i class="is-fix" /> fix</li><li><i class="is-bug" /> carries a bug</li>
        <li><i class="is-person" /> person</li><li><i class="is-agent" /> agent</li>
        <li class="sf-legend-hint">Drag to turn, pinch or scroll to zoom, click a station for its dials.</li>
      </ul>
    </section>
  );
}

/** What hovering a station tells you: its queue now, its load and its average wait over the run. */
export function stationFacts(id: FloorStation, pb: Playback, state: FloorState | null, s: Settings): { rows: [string, string][]; note?: string } {
  if (id === 'merge') return { rows: [['Merged a day', n1(pb.merge.mergesPerDay)], ['Conflicts a day', n1(pb.merge.conflictsPerDay)]], note: 'A conflict sends the change back for a rebuild.' };
  if (id === 'production') return {
    rows: [['Bugs live now', String(state?.liveBugs.length ?? 0)], ['Bugs escaping a day', n1(pb.production.escapedPerDay)], ['Average time live', fmtHours(pb.production.avgLiveHours)], ['Found by a customer', pct(pb.production.byCustomer)]],
    note: s.prod.mode === 'agents' ? 'Agents read the telemetry.' : 'People watch the alerts.',
  };
  const st = pb.stats[id as Station];
  const rows: [string, string][] = [['Waiting now', String(state?.queueLen[id as Station] ?? 0)], ['Average queue', n1(st.avgQueue)], ['Average wait', fmtHours(st.avgWait)]];
  if (id === 'judge') rows.push(['Load', 'no limit']);
  else rows.push([id === 'build' || id === 'ci' ? 'Load' : 'Share of people’s paid hours', pct(st.load)]);
  const note = id === 'review' && s.review.share <= 0 ? 'Nobody reviews: changes merge straight after the judge.' : id === 'review' && s.review.share < 1 ? `People review ${Math.round(s.review.share * 100)}% of changes. The rest merge straight after the judge.` : id === 'spec' || id === 'review' || id === 'diagnose' ? 'The same people write specs, review and diagnose. Diagnosis goes first, then review, then specs.' : undefined;
  return { rows, note };
}

function Tip({ id, x, y, pb, state, settings, width }: { id: FloorStation; x: number; y: number; pb: Playback; state: FloorState | null; settings: Settings; width: number }) {
  const f = stationFacts(id, pb, state, settings);
  const left = Math.min(Math.max(8, x + 16), width - 250), top = Math.max(8, y - 20);
  return (
    <div class="sf-tip" style={{ transform: `translate(${left}px, ${top}px)` }} role="status">
      <h3>{STATION_DIALS[id].title}</h3>
      <dl>{f.rows.map(([k, v]) => <><dt>{k}</dt><dd>{v}</dd></>)}</dl>
      {f.note && <p>{f.note}</p>}
    </div>
  );
}
