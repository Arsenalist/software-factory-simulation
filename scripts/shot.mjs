// Dev aid: screenshot a URL with the locally cached Playwright Chromium.
// node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [fullPage:1|0] [js to run] [waitMs after js]
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
const [url, out, w = '1440', h = '900', wait = '1500', full = '1', js = '', wait2 = '1200'] = process.argv.slice(2);
const cache = `${homedir()}/Library/Caches/ms-playwright`;
const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
const sub = readdirSync(`${cache}/${dir}`).find((d) => d.startsWith('chrome-'));
const app = readdirSync(`${cache}/${dir}/${sub}`).find((d) => d.endsWith('.app'));
const executablePath = `${cache}/${dir}/${sub}/${app}/Contents/MacOS/${app.replace('.app', '')}`;
const browser = await chromium.launch({ executablePath, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DSF ?? (+w < 600 ? 2 : 1)), hasTouch: +w < 600, isMobile: +w < 600 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(+wait);
if (js) { await page.evaluate(js); await page.waitForTimeout(+wait2); }
const clip = process.env.CLIP ? Object.fromEntries(process.env.CLIP.split(',').map((v, i) => [['x', 'y', 'width', 'height'][i], +v])) : undefined;
await page.screenshot({ path: out, fullPage: !clip && full === '1', clip });
await browser.close();
