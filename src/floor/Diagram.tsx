// The floor without WebGL: a static line diagram of the same stations, with each one's average queue and wait.
import type { FloorStation, Settings } from '../model/settings';
import { fmtHours, n1 } from '../ui/format';
import type { Playback } from './playback';
import type { Station } from '../engine';

const LINE: { id: FloorStation; label: string; who: 'people' | 'agents' | 'machine' }[] = [
  { id: 'spec', label: 'Spec', who: 'people' }, { id: 'build', label: 'Build', who: 'agents' }, { id: 'ci', label: 'CI', who: 'machine' },
  { id: 'judge', label: 'Judge', who: 'agents' }, { id: 'review', label: 'Review', who: 'people' }, { id: 'merge', label: 'Merge', who: 'machine' }, { id: 'production', label: 'Production', who: 'machine' },
];

export function Diagram({ pb, settings, focus, onSelect }: { pb: Playback | null; settings: Settings; focus: FloorStation | null; onSelect: (s: FloorStation | null) => void }) {
  const W = 980, bw = 112, gap = (W - 20 - LINE.length * bw) / (LINE.length - 1), y = 54, bh = 78;
  const x = (i: number) => 10 + i * (bw + gap);
  const fact = (id: FloorStation): string[] => {
    if (!pb) return ['', ''];
    if (id === 'merge') return [`${n1(pb.merge.conflictsPerDay)} conflicts/day`, ''];
    if (id === 'production') return [`${n1(pb.production.escapedPerDay)} bugs/day`, `live ${fmtHours(pb.production.avgLiveHours)}`];
    if (id === 'review' && !settings.review.on) return ['switched off', ''];
    const s = pb.stats[id as Station];
    return [`${n1(s.avgQueue)} waiting`, `wait ${fmtHours(s.avgWait)}`];
  };
  const diag = pb?.stats.diagnose;
  return (
    <div class="sf-diagram">
      <svg viewBox={`0 0 ${W} 250`} role="img" aria-label="The factory line: spec, build, CI, judge, review, merge, production, with a loop from production back through diagnosis to build.">
        <defs><marker id="sf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--sf-ink)" /></marker></defs>
        <text x={x(0)} y="22" font-size="13" fill="var(--sf-muted)">features, 9 to 5</text>
        <text x={x(1)} y="22" font-size="13" fill="var(--sf-muted)">maintenance, any hour ↓</text>
        {LINE.map((s, i) => {
          const f = fact(s.id), on = focus === s.id, people = s.who === 'people', dark = s.who !== 'people' && s.id !== 'production' && s.id !== 'merge';
          return (
            <g style="cursor:pointer" onClick={() => onSelect(s.id)}>
              {i > 0 && <line x1={x(i - 1) + bw + 3} y1={y + bh / 2} x2={x(i) - 4} y2={y + bh / 2} stroke="var(--sf-ink)" stroke-width="2" marker-end="url(#sf-arrow)" />}
              <rect x={x(i)} y={y} width={bw} height={bh} rx="4" fill={dark ? 'var(--sf-ink)' : people ? 'var(--sf-pine-wash)' : 'var(--sf-card)'} stroke={on ? 'var(--sf-pine)' : 'var(--sf-ink)'} stroke-width={on ? 4 : 2} />
              <text x={x(i) + bw / 2} y={y + 26} text-anchor="middle" font-size="17" font-weight="700" fill={dark ? 'var(--sf-paper)' : 'var(--sf-ink)'}>{s.label}</text>
              <text x={x(i) + bw / 2} y={y + 47} text-anchor="middle" font-size="12.5" font-family="var(--sf-mono)" fill={dark ? 'var(--sf-rule)' : 'var(--sf-muted)'}>{f[0]}</text>
              <text x={x(i) + bw / 2} y={y + 64} text-anchor="middle" font-size="12.5" font-family="var(--sf-mono)" fill={dark ? 'var(--sf-rule)' : 'var(--sf-muted)'}>{f[1]}</text>
            </g>
          );
        })}
        {/* bugs come back: production -> diagnosis (people) -> a fix into build */}
        <g style="cursor:pointer" onClick={() => onSelect('diagnose')}>
          <path d={`M${x(6) + bw / 2} ${y + bh + 3} V 196 H ${x(4) + bw + 6}`} fill="none" stroke="var(--sf-rust)" stroke-width="2" marker-end="url(#sf-arrow)" />
          <rect x={x(4)} y="166" width={bw} height="60" rx="4" fill="var(--sf-pine-wash)" stroke={focus === 'diagnose' ? 'var(--sf-pine)' : 'var(--sf-ink)'} stroke-width={focus === 'diagnose' ? 4 : 2} />
          <text x={x(4) + bw / 2} y="190" text-anchor="middle" font-size="17" font-weight="700" fill="var(--sf-ink)">Diagnosis</text>
          <text x={x(4) + bw / 2} y="210" text-anchor="middle" font-size="12.5" font-family="var(--sf-mono)" fill="var(--sf-muted)">{diag ? `wait ${fmtHours(diag.avgWait)}` : ''}</text>
          <path d={`M${x(4) - 3} 196 H ${x(1) + bw / 2} V ${y + bh + 6}`} fill="none" stroke="var(--sf-rust)" stroke-width="2" marker-end="url(#sf-arrow)" />
          <text x={(x(1) + x(4)) / 2 + bw / 2} y="188" text-anchor="middle" font-size="13" fill="var(--sf-rust)">fixes go back to build</text>
        </g>
      </svg>
      <p>Your browser has no WebGL, so this is the line as a drawing. The numbers are averages over the run. Click a station for its dials.</p>
    </div>
  );
}
