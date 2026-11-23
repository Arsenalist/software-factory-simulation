// Everything a visitor can set: the model's BASE, the money dials and the run length.
// Also the dial catalogue (labels, ranges), the video's presets and the share-link encoding.
import { BASE, MONEY, mergeCfg, type Cfg, type Money, type Overrides, type Station } from '../engine';

export interface Settings extends Omit<Cfg, 'hours'> { weeks: number; seeds: number; money: Money }

const { hours: _h, ...baseRest } = BASE;
export const DEFAULTS: Settings = Object.freeze({ ...structuredClone(baseRest), weeks: 26, seeds: 9, money: { ...MONEY.mid } });

export const toCfg = (s: Settings): Cfg => {
  const { weeks, seeds: _s, money: _m, ...rest } = s;
  return { ...structuredClone(rest), hours: 24 * 7 * weeks };
};

type Leaf = number | boolean | string | null;
export const getPath = (s: Settings, path: string): Leaf => path.split('.').reduce((o: any, k) => o?.[k], s) as Leaf;
export function setPath(s: Settings, path: string, value: Leaf): Settings {
  const next = structuredClone(s) as any;
  const keys = path.split('.');
  let o = next;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
  return next;
}
const leaves = (o: any, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
export const PATHS = leaves(DEFAULTS);
export const sameSettings = (a: Settings, b: Settings) => PATHS.every((p) => getPath(a, p) === getPath(b, p));

// ---- dials ----
export type DialKind = 'count' | 'rate' | 'pct' | 'hours' | 'minutes' | 'cv' | 'usd' | 'toggle' | 'choice';
export interface Dial {
  path: string; label: string; kind: DialKind;
  min?: number; max?: number; step?: number;
  /** values typed in the box may go past the slider, up to here */
  hardMax?: number;
  unit?: string; hint?: string;
  options?: { value: Leaf; label: string }[];
  /** null means "same as" another dial */
  nullable?: string;
}
const pct = (path: string, label: string, hint?: string, max = 1): Dial => ({ path, label, kind: 'pct', min: 0, max, step: 0.01, hint });
const cv = (path: string): Dial => ({ path, label: 'Variability', kind: 'cv', min: 0, max: 2, step: 0.05, hardMax: 4 });

export const DIALS: Record<string, Dial> = Object.fromEntries(([
  { path: 'featuresPerDay', label: 'Features a day', kind: 'rate', min: 0.5, max: 10, step: 0.5, hardMax: 40, hint: 'Requests per calendar day, asked for 9 to 5 on weekdays.' },
  { path: 'humans', label: 'People', kind: 'count', min: 1, max: 12, step: 1, hardMax: 40, hint: 'One pool that writes specs, reviews changes and diagnoses production bugs.' },
  { path: 'agents', label: 'Coding agents', kind: 'count', min: 1, max: 32, step: 1, hardMax: 200, hint: 'Each builds one change at a time, all 168 hours of the week.' },
  pct('bugRate', 'Changes that carry a bug', 'Share of agent changes with a defect in them.', 0.6),
  { path: 'review.on', label: 'People review every change', kind: 'toggle' },
  { path: 'prod.mode', label: 'Who watches production', kind: 'choice', options: [{ value: 'humans', label: 'People' }, { value: 'agents', label: 'Agents' }] },
  { path: 'money.salary', label: 'A person, per paid hour', kind: 'usd', min: 20, max: 300, step: 5, hardMax: 2000, hint: 'Loaded: salary plus overhead. People are paid for every shift hour, busy or not.' },
  { path: 'tokensPerBuild', label: 'Tokens per agent run', kind: 'usd', min: 1, max: 400, step: 1, hardMax: 20000, hint: 'One build, including the agent’s own retries.' },

  { path: 'maintPerDay', label: 'Maintenance jobs a day', kind: 'rate', min: 0, max: 10, step: 0.5, hardMax: 40, hint: 'Scheduled agent work such as dependency upgrades. No spec, any hour.' },
  { path: 'ciRunners', label: 'CI runners', kind: 'count', min: 1, max: 24, step: 1, hardMax: 200 },
  { path: 'shift', label: 'People’s hours', kind: 'choice', options: [{ value: true, label: '9–5 weekdays' }, { value: false, label: 'Round the clock' }] },

  { path: 'spec.mean', label: 'Spec', kind: 'hours', min: 0.25, max: 8, step: 0.25, hardMax: 80 }, cv('spec.cv'),
  { path: 'build.mean', label: 'Build', kind: 'minutes', min: 5 / 60, max: 4, step: 5 / 60, hardMax: 48 }, cv('build.cv'),
  { path: 'ci.mean', label: 'CI', kind: 'minutes', min: 1 / 60, max: 2, step: 1 / 60, hardMax: 24 }, cv('ci.cv'),
  { path: 'judge.mean', label: 'Judge', kind: 'minutes', min: 1 / 60, max: 0.5, step: 1 / 60, hardMax: 8 }, cv('judge.cv'),
  { path: 'review.mean', label: 'Review', kind: 'hours', min: 0.1, max: 6, step: 0.05, hardMax: 40 }, cv('review.cv'),
  { path: 'diagnose.mean', label: 'Diagnose', kind: 'hours', min: 0.25, max: 24, step: 0.25, hardMax: 200 }, cv('diagnose.cv'),
  { path: 'mitigate.mean', label: 'Mitigate', kind: 'hours', min: 0.1, max: 72, step: 0.1, hardMax: 720 }, cv('mitigate.cv'),
  { path: 'customerReport.mean', label: 'Customer report', kind: 'hours', min: 1, max: 720, step: 1, hardMax: 4000 }, cv('customerReport.cv'),

  { ...pct('maintBugRate', 'Maintenance changes that carry a bug', undefined, 0.6), nullable: 'Same as features' },
  pct('testCatch', 'Bugs the tests catch at CI'),
  pct('judge.reject', 'Changes the AI judge sends back'),
  pct('review.catch', 'Bugs review catches', 'Of the bugs that reach a reviewer.'),
  pct('review.reject', 'Other review rejections', 'Sent back for reasons that aren’t bugs.'),
  { path: 'review.maint', label: 'Review maintenance changes too', kind: 'toggle' },
  { path: 'conflictPerMerge', label: 'Conflict chance per merge in flight', kind: 'pct', min: 0, max: 0.2, step: 0.005, hint: 'Per change merged while yours was being built.' },

  pct('detect.humans.p', 'People: bugs their alerts catch'),
  { path: 'detect.humans.mean', label: 'People: time to notice', kind: 'hours', min: 0.25, max: 96, step: 0.25, hardMax: 720 }, cv('detect.humans.cv'),
  pct('detect.agents.p', 'Agents: bugs they catch'),
  { path: 'detect.agents.mean', label: 'Agents: time to notice', kind: 'minutes', min: 1 / 60, max: 8, step: 1 / 60, hardMax: 720 }, cv('detect.agents.cv'),
  { path: 'prod.dupes', label: 'Tickets filed per bug', kind: 'count', min: 1, max: 5, step: 1, hint: '1 means duplicates are grouped. Each ticket gets its own diagnosis.' },

  { path: 'money.delay', label: 'A feature waiting, per hour', kind: 'usd', min: 0, max: 100, step: 1, hardMax: 10000 },
  { path: 'money.bug', label: 'A bug live in production, per hour', kind: 'usd', min: 0, max: 500, step: 5, hardMax: 100000 },
  { path: 'ciPerRun', label: 'One CI run', kind: 'usd', min: 0, max: 10, step: 0.1, hardMax: 1000 },

  { path: 'weeks', label: 'Run length', kind: 'count', unit: 'weeks', min: 4, max: 104, step: 1 },
  { path: 'seeds', label: 'Runs (random seeds)', kind: 'count', min: 1, max: 25, step: 1, hint: 'Every number is the median of this many runs.' },
] as Dial[]).map((d) => [d.path, d]));

export const HEADLINE = ['featuresPerDay', 'humans', 'agents', 'bugRate', 'review.on', 'prod.mode', 'money.salary', 'tokensPerBuild'];
export interface Drawer { id: string; title: string; note?: string; dials: string[]; pairs?: boolean }
export const DRAWERS: Drawer[] = [
  { id: 'demand', title: 'Demand', dials: ['maintPerDay'] },
  { id: 'team', title: 'Team and capacity', dials: ['ciRunners', 'shift'] },
  { id: 'steps', title: 'Step times', note: 'Every step takes a random time around its mean. Variability is the spread (standard deviation ÷ mean): 0 is clockwork, 1 is wild.', pairs: true,
    dials: ['spec.mean', 'spec.cv', 'build.mean', 'build.cv', 'ci.mean', 'ci.cv', 'judge.mean', 'judge.cv', 'review.mean', 'review.cv', 'diagnose.mean', 'diagnose.cv', 'mitigate.mean', 'mitigate.cv', 'customerReport.mean', 'customerReport.cv'] },
  { id: 'quality', title: 'Quality', dials: ['maintBugRate', 'testCatch', 'judge.reject', 'review.catch', 'review.reject', 'review.maint', 'conflictPerMerge'] },
  { id: 'production', title: 'Production', note: 'Monitoring catches a share of bugs after about the time to notice. A customer reports the rest (see Customer report under Step times).',
    dials: ['detect.humans.p', 'detect.humans.mean', 'detect.humans.cv', 'detect.agents.p', 'detect.agents.mean', 'detect.agents.cv', 'prod.dupes'] },
  { id: 'money', title: 'Money', dials: ['money.delay', 'money.bug', 'ciPerRun'] },
  { id: 'run', title: 'Run', dials: ['weeks', 'seeds'] },
];

/** The dials a station on the floor opens when clicked. */
export type FloorStation = Station | 'merge' | 'production';
export const STATION_DIALS: Record<FloorStation, { title: string; dials: string[] }> = {
  spec: { title: 'Spec desks', dials: ['featuresPerDay', 'humans', 'spec.mean', 'spec.cv'] },
  build: { title: 'Build bays', dials: ['agents', 'build.mean', 'build.cv', 'tokensPerBuild', 'bugRate', 'maintPerDay', 'maintBugRate'] },
  ci: { title: 'CI conveyor', dials: ['ciRunners', 'ci.mean', 'ci.cv', 'testCatch', 'ciPerRun'] },
  judge: { title: 'Judge gate', dials: ['judge.reject', 'judge.mean', 'judge.cv'] },
  review: { title: 'Review desks', dials: ['review.on', 'review.maint', 'review.mean', 'review.cv', 'review.catch', 'review.reject'] },
  merge: { title: 'Merge point', dials: ['conflictPerMerge'] },
  production: { title: 'Production', dials: ['prod.mode', 'detect.humans.p', 'detect.humans.mean', 'detect.agents.p', 'detect.agents.mean', 'prod.dupes', 'mitigate.mean', 'customerReport.mean'] },
  diagnose: { title: 'Diagnosis', dials: ['diagnose.mean', 'diagnose.cv', 'prod.dupes'] },
};

export function clampDial(d: Dial, v: number): number {
  const lo = d.min ?? -Infinity, hi = d.hardMax ?? d.max ?? Infinity;
  let x = Math.min(hi, Math.max(lo, v));
  if (d.kind === 'count') x = Math.round(x);
  return x;
}

// ---- presets ----
export const MONEY_PRESETS: { id: keyof typeof MONEY; label: string }[] = [{ id: 'low', label: 'Low' }, { id: 'mid', label: 'Mid' }, { id: 'high', label: 'High' }];

/** $1,000 per person per working day ÷ the baseline's builds per week (57.78): what StrongDM's bar comes to per agent run. */
export const STRONGDM_TOKENS_PER_BUILD = 259.59;

export interface Preset { id: string; label: string; blurb: string; over: Overrides }
/** Named after the video's chapters; each config is an experiment row from the model. */
export const PRESETS: Preset[] = [
  { id: 'baseline', label: 'The factory', blurb: 'The video’s baseline: 3 people, 8 coding agents, 3 features a day.', over: {} },
  { id: 'agents', label: 'More agents…', blurb: '“More agents, or another person?” At 4.5 features a day, double the agents to 16.', over: { featuresPerDay: 4.5, agents: 16 } },
  { id: 'person', label: '…or another person?', blurb: '“More agents, or another person?” At 4.5 features a day, hire a fourth person instead.', over: { featuresPerDay: 4.5, humans: 4 } },
  { id: 'careful', label: 'Someone understands the code', blurb: 'Careful review: 100 minutes, catches 80% of bugs, and diagnosis halves to 1.5 hours.', over: { review: { mean: 1.67, catch: 0.8 }, diagnose: { mean: 1.5 } } },
  { id: 'noreview', label: 'Drop the review?', blurb: 'StrongDM’s rule 2: code must not be reviewed by humans.', over: { review: { on: false } } },
  { id: 'strongdm', label: 'StrongDM’s token spend', blurb: '$1,000 of tokens per person per working day, about $260 an agent run.', over: { tokensPerBuild: STRONGDM_TOKENS_PER_BUILD } },
  { id: 'maint', label: 'No review on maintenance', blurb: 'Spotify merges most automated maintenance without a person reading it.', over: { review: { maint: false } } },
  { id: 'telemetry', label: 'Agents read telemetry', blurb: 'Agents watch production, not people: 95% of bugs noticed in about half an hour.', over: { prod: { mode: 'agents' } } },
  { id: 'tests', label: 'Catch it before merge', blurb: 'Tests catch 80% of bugs. Specs take 30 minutes longer and builds 20% longer.', over: { testCatch: 0.8, spec: { mean: 2.5 }, build: { mean: 0.9 } } },
  { id: 'norollback', label: 'Bugs you can’t roll back', blurb: 'A day of cleanup before the damage stops, where a rollback took 30 minutes.', over: { mitigate: { mean: 24, cv: 1 } } },
  { id: 'clock', label: 'Round the clock', blurb: 'The same team, staffed all 168 hours. No night for work to wait out.', over: { shift: false } },
];

/** A preset replaces the model's parameters and keeps the visitor's money and run dials. */
export function applyPreset(s: Settings, p: Preset): Settings {
  const { hours: _hh, ...cfg } = mergeCfg(BASE, p.over);
  return { ...cfg, weeks: s.weeks, seeds: s.seeds, money: { ...s.money } };
}
const MODEL_PATHS = PATHS.filter((p) => !p.startsWith('money.') && p !== 'weeks' && p !== 'seeds');
export function activePreset(s: Settings): Preset | null {
  return PRESETS.find((p) => { const t = applyPreset(s, p); return MODEL_PATHS.every((k) => getPath(t, k) === getPath(s, k)); }) ?? null;
}
export function activeMoney(s: Settings): keyof typeof MONEY | null {
  return (Object.keys(MONEY) as (keyof typeof MONEY)[]).find((k) => MONEY[k].salary === s.money.salary && MONEY[k].delay === s.money.delay && MONEY[k].bug === s.money.bug) ?? null;
}

// ---- share link: #v1=<base64url JSON of only the dials that differ from the defaults> ----
export const HASH_VERSION = 'v1';
const b64 = {
  enc: (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/')),
};
export function encodeHash(s: Settings): string {
  const diff: Record<string, Leaf> = {};
  for (const p of PATHS) { const v = getPath(s, p); if (v !== getPath(DEFAULTS, p)) diff[p] = v; }
  return Object.keys(diff).length ? `#${HASH_VERSION}=${b64.enc(JSON.stringify(diff))}` : '';
}
/** Returns null when the hash isn't ours or can't be read. Unknown keys and wrong types are dropped; numbers are clamped. */
export function decodeHash(hash: string): Settings | null {
  const m = /^#?v1=([A-Za-z0-9_-]*)$/.exec(hash);
  if (!m) return null;
  let diff: unknown;
  try { diff = JSON.parse(b64.dec(m[1])); } catch { return null; }
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return null;
  let s = structuredClone(DEFAULTS) as Settings;
  for (const [p, raw] of Object.entries(diff as Record<string, unknown>)) {
    if (!PATHS.includes(p)) continue;
    const d = DIALS[p], def = getPath(DEFAULTS, p);
    if (d?.nullable && raw === null) { s = setPath(s, p, null); continue; }
    if (d?.kind === 'choice') { if (d.options!.some((o) => o.value === raw)) s = setPath(s, p, raw as Leaf); continue; }
    if (typeof def === 'boolean') { if (typeof raw === 'boolean') s = setPath(s, p, raw); continue; }
    if (typeof raw !== 'number' || !isFinite(raw)) continue;
    s = setPath(s, p, d ? clampDial(d, raw) : raw);
  }
  return s;
}
