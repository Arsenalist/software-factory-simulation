import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Metrics, Money, Trace } from '../engine';
import { createEngine, type Engine } from '../engine/client';
import { DEFAULTS, HEADLINE, PRESETS, activePreset, applyPreset, decodeHash, encodeHash, sameSettings, setPath, toCfg, type FloorStation, type Settings } from '../model/settings';
import { BillCard } from './Bill';
import { DialRow, Drawers, StationCard, StepTimes } from './Dials';
import { Stats } from './Stats';
import { Floor } from '../floor/Floor';

interface Result { settings: Settings; metrics: Metrics; trace: Trace | null; ms: number }
const simKey = (s: Settings) => JSON.stringify([toCfg(s), s.seeds]);
const DEBOUNCE_MS = 300;

export function App({ useHash }: { useHash: boolean }) {
  const [settings, setSettings] = useState<Settings>(() => (useHash ? decodeHash(location.hash) : null) ?? structuredClone(DEFAULTS));
  const [result, setResult] = useState<Result | null>(null);
  const [baseline, setBaseline] = useState<Metrics | null>(null);
  const [pinned, setPinned] = useState<{ settings: Settings; metrics: Metrics } | null>(null);
  const [running, setRunning] = useState(true);
  const [focus, setFocus] = useState<FloorStation | null>(null);
  const [copied, setCopied] = useState(false);

  const engine = useRef<Engine | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  const lastKey = useRef('');
  const latest = useRef(settings);
  latest.current = settings;

  const runNow = useCallback((s: Settings) => {
    clearTimeout(timer.current);
    const key = simKey(s);
    if (key === lastKey.current || !engine.current) return;
    lastKey.current = key;
    const mine = ++seq.current;
    setRunning(true);
    engine.current.run(toCfg(s), s.seeds, true).then((r) => {
      if (mine !== seq.current) return; // a newer run is on its way
      setResult({ settings: s, metrics: r.metrics, trace: r.trace, ms: r.ms });
      if (sameSettings(s, DEFAULTS)) setBaseline(r.metrics);
      setRunning(false);
    });
  }, []);

  // boot: the worker, the first run, and the video's baseline for the "change from" numbers
  useEffect(() => {
    const e = (engine.current = createEngine());
    runNow(latest.current);
    if (!sameSettings(latest.current, DEFAULTS)) e.run(toCfg(DEFAULTS), DEFAULTS.seeds, false).then((r) => setBaseline(r.metrics));
    return () => { clearTimeout(timer.current); e.dispose(); engine.current = null; };
  }, [runNow]);

  // re-run about 300 ms after the dials stop moving; keep the share link in the address bar
  useEffect(() => {
    if (simKey(settings) !== lastKey.current) { clearTimeout(timer.current); timer.current = window.setTimeout(() => runNow(latest.current), DEBOUNCE_MS); }
    if (useHash) {
      const hash = encodeHash(settings);
      if (hash !== location.hash) history.replaceState(null, '', hash || location.pathname + location.search);
    }
  }, [settings, runNow, useHash]);

  useEffect(() => {
    if (!useHash) return;
    const onHash = () => { const s = decodeHash(location.hash); if (s) setSettings(s); };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, [useHash]);

  const ctx = useMemo(() => ({
    settings,
    set: (path: string, value: number | boolean | string | null) => setSettings((s) => setPath(s, path, value)),
    commit: () => runNow(latest.current),
  }), [settings, runNow]);

  const preset = activePreset(settings);
  const isBaseline = sameSettings(settings, DEFAULTS);
  const copy = () => {
    const url = location.origin + location.pathname + location.search + encodeHash(settings);
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link', url));
    else prompt('Copy this link', url);
  };

  // the bill reprices at once when only a money dial moves; the hours come from the last finished run
  const now = result ? { settings: { ...result.settings, money: settings.money }, metrics: result.metrics } : null;

  return (
    <div class="sf" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') runNow(latest.current); }}>
      <div class="sf-main">
        <div class="sf-left">
          <Floor trace={result?.trace ?? null} settings={result?.settings ?? settings} focus={focus} onSelect={setFocus} />
          {focus && <StationCard station={focus} ctx={ctx} onClose={() => setFocus(null)} />}

          <section class="sf-headline" aria-label="Main dials">
            <div class="sf-headline-top">
              <h2>Change the <strong>numbers</strong></h2>
              <div class="sf-run">
                <label class="sf-start">Start from
                  <select value={preset?.id ?? ''} onChange={(e) => { const p = PRESETS.find((x) => x.id === (e.target as HTMLSelectElement).value); if (p) setSettings((s) => applyPreset(s, p)); }}>
                    {!preset && <option value="">Your own numbers</option>}
                    {PRESETS.map((p) => <option value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <span class="sf-run-status" aria-live="polite">{running ? 'Running…' : result ? `${result.settings.seeds} runs in ${Math.max(1, Math.round(result.ms))} ms` : ''}</span>
                <button type="button" class="sf-btn" onClick={() => { lastKey.current = ''; runNow(latest.current); }}>Run</button>
              </div>
            </div>
            <div class="sf-headline-grid">{HEADLINE.map((p) => <DialRow path={p} ctx={ctx} big />)}</div>
            <StepTimes ctx={ctx} />
          </section>

          {now && <Stats now={now.metrics} baseline={baseline} pinned={pinned?.metrics ?? null} isBaseline={isBaseline} />}
        </div>

        <aside class="sf-right">
          {now ? (
            <BillCard
              now={now} baseline={baseline} pinned={pinned} isBaseline={isBaseline} running={running}
              onMoney={(m: Money) => setSettings((s) => ({ ...s, money: m }))}
              onPin={() => setPinned({ settings: now.settings, metrics: now.metrics })} onUnpin={() => setPinned(null)}
              onCopy={copy} copied={copied}
            />
          ) : <section class="sf-bill" aria-busy="true"><header class="sf-bill-head"><h2>The bill, <strong>per feature</strong></h2><p class="sf-bill-sub">Running the factory…</p></header></section>}
        </aside>
      </div>

      <section class="sf-more">
        <div class="sf-more-head">
          <h2>Every assumption is <strong>a dial</strong></h2>
          {!isBaseline && <button type="button" class="sf-link" onClick={() => setSettings(structuredClone(DEFAULTS))}>Reset everything to the defaults</button>}
          <p>Every other parameter of the model. You can also click a station on the floor to open its dials.</p>
        </div>
        <Drawers ctx={ctx} defaults={DEFAULTS} />
      </section>
    </div>
  );
}
