// How numbers are printed. Matches the video's tables: hours to one decimal, days past 48 h, whole dollars.
export const fmtHours = (x: number) => (!isFinite(x) ? '—' : x >= 48 ? `${(x / 24).toFixed(1)} d` : `${x.toFixed(1)} h`);
export const n1 = (x: number) => (isFinite(x) ? x.toFixed(1) : '—');
export const pct = (x: number) => (isFinite(x) ? `${Math.round(x * 100)}%` : '—');
export const usd = (x: number) => (isFinite(x) ? `$${Math.round(x).toLocaleString('en-US')}` : '—');
export const usdFine = (x: number) => (x < 10 && x % 1 !== 0 ? `$${x.toFixed(2)}` : usd(x));

const sign = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '±');
/** A signed difference in the measure's own unit, or null when it rounds to nothing. */
export const delta = {
  hours(a: number, b: number) {
    const d = a - b; if (!isFinite(d)) return null;
    const big = Math.abs(d) >= 48, v = big ? Math.abs(d) / 24 : Math.abs(d);
    return v < 0.05 ? null : `${sign(d)}${v.toFixed(1)} ${big ? 'd' : 'h'}`;
  },
  n1(a: number, b: number) { const d = a - b; return !isFinite(d) || Math.abs(d) < 0.05 ? null : `${sign(d)}${Math.abs(d).toFixed(1)}`; },
  pts(a: number, b: number) { const d = Math.round(a * 100) - Math.round(b * 100); return !isFinite(d) || d === 0 ? null : `${sign(d)}${Math.abs(d)} pts`; },
  usd(a: number, b: number) { const d = Math.round(a) - Math.round(b); return !isFinite(d) || d === 0 ? null : `${sign(d)}$${Math.abs(d).toLocaleString('en-US')}`; },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Sim time (hours since Monday 00:00 of week 1) as a clock reading. */
export function clock(t: number) {
  const day = Math.floor(t / 24), hour = t - day * 24, hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
  return { week: Math.floor(day / 7) + 1, day: DAYS[day % 7], time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, weekend: day % 7 >= 5, hour };
}
