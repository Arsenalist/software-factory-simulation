import { useState } from 'preact/hooks';
import { MONEY, bill as priceBill, type Bill, type BillLine, type Metrics, type Money } from '../engine';
import { MONEY_PRESETS, activeMoney, type Settings } from '../model/settings';
import { delta, n1, usd, usdFine } from './format';

export interface Priced { settings: Settings; metrics: Metrics }
const LABEL: Record<BillLine, string> = { people: 'People', bugs: 'Bugs live', waiting: 'Waiting', tokens: 'Tokens', ci: 'CI' };
const ORDINAL = ['', 'biggest', '2nd biggest', '3rd biggest', '2nd smallest', 'smallest'];

/** How each line was arrived at: hours from the model, times a dollar dial. */
function working(line: BillLine, m: Metrics, s: Settings): string {
  switch (line) {
    case 'people': return `${n1(m.paidPerF)} paid h × ${usd(s.money.salary)}`;
    case 'waiting': return `${n1(m.waitPerF)} h in the line × ${usdFine(s.money.delay)}`;
    case 'bugs': return `${n1(m.bugLivePerF)} live h × ${usdFine(s.money.bug)}`;
    case 'tokens': return `${n1(m.tokensPerF / Math.max(1e-9, s.tokensPerBuild))} agent runs × ${usdFine(s.tokensPerBuild)}`;
    case 'ci': return `${n1(m.ciPerF / Math.max(1e-9, s.ciPerRun))} runs × ${usdFine(s.ciPerRun)}`;
  }
}

function Bar({ b, hot, setHot }: { b: Bill; hot: BillLine | null; setHot: (l: BillLine | null) => void }) {
  const order = (Object.keys(b.parts) as BillLine[]).sort((x, y) => b.parts[y] - b.parts[x]);
  return (
    <div class="sf-bar" role="img" aria-label={`Bill per feature: ${order.map((l) => `${LABEL[l]} ${usd(b.parts[l])}`).join(', ')}`}>
      {order.map((l) => (
        <span
          class={`sf-bar-seg is-${l}${hot && hot !== l ? ' is-dim' : ''}`}
          style={{ flexGrow: Math.max(b.parts[l], 0.0001) }}
          title={`${LABEL[l]}: ${usd(b.parts[l])} (${Math.round((b.parts[l] / b.total) * 100)}%)`}
          onMouseEnter={() => setHot(l)} onMouseLeave={() => setHot(null)}
        />
      ))}
    </div>
  );
}

interface Props {
  now: Priced; baseline: Metrics | null; pinned: Priced | null; isBaseline: boolean; running: boolean;
  onMoney: (m: Money) => void; onPin: () => void; onUnpin: () => void; onCopy: () => void; copied: boolean;
}

export function BillCard({ now, baseline, pinned, isBaseline, running, onMoney, onPin, onUnpin, onCopy, copied }: Props) {
  const [hot, setHot] = useState<BillLine | null>(null);
  const b = priceBill(now.metrics, now.settings.money);
  const a = pinned ? priceBill(pinned.metrics, pinned.settings.money) : null;
  const video = baseline ? priceBill(baseline, MONEY.mid) : null;
  const order = (Object.keys(b.parts) as BillLine[]).sort((x, y) => b.parts[y] - b.parts[x]);
  const money = activeMoney(now.settings);
  const vsVideo = video && !isBaseline ? delta.usd(b.total, video.total) : null;
  const perDay = b.total * now.metrics.featuresPerDay;

  return (
    <section class={`sf-bill${running ? ' is-running' : ''}`} aria-label="The bill per feature">
      <header class="sf-bill-head">
        <h2>The bill, <strong>per feature</strong></h2>
        <p class="sf-bill-sub">What it costs to ship one feature: everything the factory spends, plus what waiting and live bugs cost you, divided by the features shipped.</p>
      </header>

      {a ? (
        <div class="sf-bill-ab">
          <div><span class="sf-tag">A, pinned</span><span class="sf-bill-total is-small">{usd(a.total)}</span></div>
          <div><span class="sf-tag is-now">B, now</span><span class="sf-bill-total is-small">{usd(b.total)}</span></div>
          <Diff text={delta.usd(b.total, a.total)} worse={b.total > a.total} suffix="B against A" />
        </div>
      ) : (
        <div class="sf-bill-hero">
          <span class="sf-bill-total" aria-live="polite">{usd(b.total)}</span>
          {isBaseline ? <span class="sf-bill-vs">per feature shipped</span> : <Diff text={vsVideo} worse={!!video && b.total > video.total} suffix={`against the default ${video ? usd(video.total) : ''}`} />}
        </div>
      )}

      <Bar b={b} hot={hot} setHot={setHot} />

      <table class="sf-lines">
        <caption class="sf-vh">Bill lines, largest first</caption>
        {a && <thead><tr><th scope="col"><span class="sf-vh">Line</span></th><th scope="col">A</th><th scope="col">B</th></tr></thead>}
        <tbody>
          {order.map((l) => (
            <tr class={`${hot === l ? 'is-hot' : ''}${l === 'tokens' ? ' is-tokens' : ''}`} onMouseEnter={() => setHot(l)} onMouseLeave={() => setHot(null)}>
              <th scope="row">
                <span class={`sf-swatch is-${l}`} aria-hidden="true" />
                <span class="sf-line-name">{LABEL[l]}</span>
                <span class="sf-line-work">{working(l, now.metrics, now.settings)}</span>
              </th>
              {a && <td class="is-a">{usd(a.parts[l])}</td>}
              <td>
                {usd(b.parts[l])}
                {a
                  ? <Diff text={delta.usd(b.parts[l], a.parts[l])} worse={b.parts[l] > a.parts[l]} />
                  : <span class="sf-line-share">{Math.round((b.parts[l] / b.total) * 100)}%</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p class="sf-rank">
        <span class="sf-rank-n">Tokens rank {b.tokensRank} of 5.</span>{' '}
        {b.tokensRank === 1 ? 'At this spend they are the biggest line on the bill.' : `They are the ${ORDINAL[b.tokensRank]} line: ${Math.round((b.parts.tokens / b.total) * 100)}% of what a feature costs.`}
        {a && a.tokensRank !== b.tokensRank ? ` In A they rank ${a.tokensRank}.` : ''}
      </p>
      <p class="sf-bill-day">At {n1(now.metrics.featuresPerDay)} features shipped a day, that is about <b>{usd(perDay)}</b> a day, or <b>{usd(perDay * 365 / 12)}</b> a month.</p>
      <p class="sf-bill-foot">Median of {now.settings.seeds} runs of {now.settings.weeks} weeks.</p>

      <div class="sf-priced">
        <span id="sf-priced-label">Priced at</span>
        <span class="sf-seg" role="group" aria-labelledby="sf-priced-label">
          {MONEY_PRESETS.map((p) => (
            <button type="button" class={money === p.id ? 'is-on' : ''} aria-pressed={money === p.id} onClick={() => onMoney({ ...MONEY[p.id] })} title={`$${MONEY[p.id].salary} a paid hour, $${MONEY[p.id].delay} an hour waiting, $${MONEY[p.id].bug} a live bug hour`}>{p.label}</button>
          ))}
        </span>
        <span class="sf-priced-note">{money ? '' : 'your own numbers'}</span>
      </div>

      <div class="sf-bill-actions">
        {pinned
          ? <button type="button" class="sf-btn" onClick={onUnpin}>Unpin A</button>
          : <button type="button" class="sf-btn" onClick={onPin}>Pin this factory</button>}
        <button type="button" class="sf-btn" onClick={onCopy}>{copied ? 'Link copied' : 'Copy link'}</button>
      </div>
      {!pinned && <p class="sf-bill-foot">Pin it, change a dial, and the two bills sit side by side.</p>}
    </section>
  );
}

export function Diff({ text, worse, suffix }: { text: string | null; worse: boolean; suffix?: string }) {
  if (!text) return suffix ? <span class="sf-diff is-same">No change {suffix}</span> : <span class="sf-diff is-same">same</span>;
  return <span class={`sf-diff ${worse ? 'is-worse' : 'is-better'}`}><span aria-hidden="true">{text.startsWith('+') ? '▲' : '▼'}</span> {text}{suffix ? ` ${suffix}` : ''}</span>;
}
