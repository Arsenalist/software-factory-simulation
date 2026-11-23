# Software factory simulator

The interactive model behind the zarar.dev video on what a software factory costs. Change the team, the agents, the bug rate and the money, and it simulates the factory for six months, nine times by default, and gives you the bill per feature. A 3D floor plays back the median run.

Lives at https://zarar.dev/software-factory/.

## Run it

```sh
npm install
npm run dev      # dev harness with the site's fonts and graph paper
npm test         # golden numbers from the video, share links, playback
npm run build    # dist/software-factory.js + .css (+ worker and 3D chunks)
npm run sync     # build, then copy dist/ into ../zarar.dev/public/software-factory/
```

`npm run sync` reads `ZARAR_DEV` if the site checkout is somewhere else. It never commits or deploys.

## Embed it

```html
<link rel="stylesheet" href="/software-factory/software-factory.css" />
<div id="software-factory"></div>
<script type="module">
  import { mount } from '/software-factory/software-factory.js';
  mount(document.getElementById('software-factory'));
</script>
```

`mount(el, { hash: false })` keeps the config out of the URL. It reads the page's `--ink`, `--pine`, `--accent`, `--paper`, `--rule`, `--muted` and `--font-*` variables and falls back to zarar.dev's values.

## Where things are

- `src/engine/` is the model: an exact TypeScript port of the video's `factory.mjs` v9. `test/engine.golden.test.ts` holds it to the published numbers. Don't change the model without changing the video.
- `src/model/settings.ts` has the dials, the presets and the share-link encoding.
- `src/ui/` is the panel and the bill (Preact).
- `src/floor/` is the 3D floor (three.js), its playback index and the 2D fallback.
- `DECISIONS.md` lists the choices made where the handoff was silent.

MIT. See `LICENSE`.
