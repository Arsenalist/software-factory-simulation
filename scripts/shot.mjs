// Dev aid: screenshot a URL with the locally cached Playwright Chromium.
// node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [fullPage:1|0]
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
const [url, out, w = '1440', h = '900', wait = '1500', full = '1'] = process.argv.slice(2);
const cache = `${homedir()}/Library/Caches/ms-playwright`;
const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
const sub = readdirSync(`${cache}/${dir}`).find((d) => d.startsWith('chrome-'));
const app = readdirSync(`${cache}/${dir}/${sub}`).find((d) => d.endsWith('.app'));
const executablePath = `${cache}/${dir}/${sub}/${app}/Contents/MacOS/${app.replace('.app', '')}`;
const browser = await chromium.launch({ executablePath, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +w < 600 ? 2 : 1, hasTouch: +w < 600, isMobile: +w < 600 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: full === '1' });
await browser.close();
