// Copies the built bundle into the zarar.dev checkout, where Astro serves public/ as-is:
// dist/* -> <zarar.dev>/public/software-factory/. Run with `npm run sync` (it builds first).
// It does not commit or deploy anything in zarar.dev.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = resolve(process.env.ZARAR_DEV ?? join(root, '..', 'zarar.dev'));
const dist = join(root, 'dist');
const target = join(site, 'public', 'software-factory');

if (!existsSync(join(dist, 'software-factory.js'))) { console.error('No build in dist/. Run `npm run build` first.'); process.exit(1); }
if (!existsSync(join(site, 'astro.config.mjs'))) { console.error(`No zarar.dev checkout at ${site}. Set ZARAR_DEV=/path/to/zarar.dev.`); process.exit(1); }

mkdirSync(target, { recursive: true });
for (const f of readdirSync(target)) rmSync(join(target, f), { recursive: true, force: true }); // old hashed chunks
cpSync(dist, target, { recursive: true });
console.log(`Synced ${readdirSync(dist).length} entries to ${target}`);
