import { describe, expect, test } from 'vitest';
import { BASE, bill, medianOf, runSeeds, MONEY } from '../src/engine';
import { DEFAULTS, DIALS, DRAWERS, HEADLINE, PATHS, PRESETS, STATION_DIALS, STRONGDM_TOKENS_PER_BUILD, activeMoney, activePreset, applyPreset, decodeHash, encodeHash, setPath, toCfg } from '../src/model/settings';

const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;
const total = (s = DEFAULTS) => usd(bill(medianOf(runSeeds(toCfg(s), s.seeds)), s.money).total);

test('the defaults are the video’s baseline and bill at $1,132', () => {
  expect(toCfg(DEFAULTS)).toEqual(BASE);
  expect(DEFAULTS.money).toEqual(MONEY.mid);
  expect(total()).toBe('$1,132');
});

test('every parameter of the model has a dial, placed in the headline row or a drawer', () => {
  const placed = new Set([...HEADLINE, ...DRAWERS.flatMap((d) => d.dials)]);
  for (const p of PATHS) {
    if (p === 'warm') continue; // warm-up share is part of how the video measured, not a dial
    expect(DIALS[p], p).toBeDefined();
    expect(placed.has(p), p).toBe(true);
  }
  for (const s of Object.values(STATION_DIALS)) for (const p of s.dials) expect(DIALS[p], p).toBeDefined();
});

describe('share link', () => {
  test('the baseline needs no hash', () => { expect(encodeHash(DEFAULTS)).toBe(''); });
  test('a changed factory reopens exactly', () => {
    let s = setPath(DEFAULTS, 'featuresPerDay', 4.5);
    s = setPath(s, 'review.share', 0.4);
    s = setPath(s, 'prod.mode', 'agents');
    s = setPath(s, 'maintBugRate', 0.05);
    s = setPath(s, 'detect.agents.mean', 0.25);
    s = setPath(s, 'money.bug', 200);
    s = setPath(s, 'weeks', 12);
    const hash = encodeHash(s);
    expect(hash).toMatch(/^#v1=[A-Za-z0-9_-]+$/);
    expect(decodeHash(hash)).toEqual(s);
  });
  test('every preset round-trips', () => {
    for (const p of PRESETS) { const s = applyPreset(DEFAULTS, p); expect(decodeHash(encodeHash(s)) ?? DEFAULTS, p.id).toEqual(s); }
  });
  test('junk is refused, unknown keys dropped, numbers clamped', () => {
    expect(decodeHash('#about')).toBeNull();
    expect(decodeHash('#v1=AAAA')).toBeNull();
    const enc = (o: object) => '#v1=' + btoa(JSON.stringify(o)).replace(/=+$/, '');
    expect(decodeHash(enc({ nope: 1, humans: 'x', 'review.on': false, shift: 3 }))).toEqual(DEFAULTS);
    expect(decodeHash(enc({ humans: 1e9, agents: -4 }))!.humans).toBe(40);
    expect(decodeHash(enc({ humans: 1e9, agents: -4 }))!.agents).toBe(1);
  });
});

describe('presets', () => {
  test('one preset is active at a time, and it survives a money change', () => {
    for (const p of PRESETS) expect(activePreset(applyPreset(DEFAULTS, p))!.id).toBe(p.id);
    expect(activePreset(setPath(applyPreset(DEFAULTS, PRESETS[4]), 'money.salary', 150))!.id).toBe('noreview');
    expect(activePreset(setPath(DEFAULTS, 'humans', 7))).toBeNull();
    expect(activeMoney(DEFAULTS)).toBe('mid');
  });
  test('they reproduce the video’s bills', () => {
    const t = (id: string) => total(applyPreset(DEFAULTS, PRESETS.find((p) => p.id === id)!));
    expect(t('noreview')).toBe('$1,295');
    expect(t('maint')).toBe('$1,070'); // maintenance at 5% buggy, results.md
    expect(t('careful')).toBe('$1,095');
    expect(t('noreview-2')).toBe('$1,184');
    expect(t('noreview-agents')).toBe('$696');
    expect(t('noreview-tests')).toBe('$956');
    expect(t('strongdm')).toBe('$1,753');
    expect(t('tests')).toBe('$946'); // script.md notes: runMany at the mid dials
  });
  test('StrongDM’s bar is $1,000 per person per working day', () => {
    const base = medianOf(runSeeds(BASE));
    expect(((1000 * BASE.humans * 5) / base.buildsPerWeek).toFixed(2)).toBe(STRONGDM_TOKENS_PER_BUILD.toFixed(2));
  });
});
