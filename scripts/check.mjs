// Dev aid: drives the page in Chromium and prints what a visitor would see. node scripts/check.mjs <url>
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
const url = process.argv[2];
const cache = `${homedir()}/Library/Caches/ms-playwright`;
const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
const sub = readdirSync(`${cache}/${dir}`).find((d) => d.startsWith('chrome-'));
const app = readdirSync(`${cache}/${dir}/${sub}`).find((d) => d.endsWith('.app'));
const browser = await chromium.launch({ executablePath: `${cache}/${dir}/${sub}/${app}/Contents/MacOS/${app.replace('.app', '')}`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
const total = () => page.locator('.sf-bill-total').first().innerText();
await page.waitForSelector('.sf-bill-total');
console.log('on load:', await total(), '| hash:', JSON.stringify(new URL(page.url()).hash));
await page.getByRole('button', { name: 'Pin this factory' }).click();
await page.getByRole('button', { name: 'Drop the review?' }).click();
await page.waitForTimeout(900);
console.log('pinned A/B:', (await page.locator('.sf-bill-ab').innerText()).replace(/\n/g, ' '));
console.log('rank:', await page.locator('.sf-rank').innerText());
console.log('hash:', new URL(page.url()).hash);
const shared = page.url();
await page.screenshot({ path: 'shots/ab.png' });
// hover + click the review station via its label position
const box = await page.locator('.sf-label', { hasText: 'Build' }).boundingBox();
await page.mouse.move(box.x + 10, box.y + 90); await page.waitForTimeout(300);
console.log('tooltip:', (await page.locator('.sf-tip').innerText().catch(() => 'none')).replace(/\n/g, ' '));
await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300);
console.log('station card:', (await page.locator('.sf-station h3').innerText().catch(() => 'none')));
// frame rate over 3 s of playback at 16x
await page.getByRole('button', { name: '16×' }).click();
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : res(n / 3); }; requestAnimationFrame(f); }));
console.log('fps:', fps.toFixed(1));
const p2 = await browser.newPage(); await p2.goto(shared, { waitUntil: 'networkidle' }); await p2.waitForSelector('.sf-bill-total');
console.log('reopened link:', await p2.locator('.sf-bill-total').first().innerText(), '| active chip:', await p2.locator('.sf-chip[aria-pressed=true]').innerText());
await browser.close();
