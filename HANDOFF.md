# Handoff: Software Factory simulator

You are building, from scratch, an interactive simulator that accompanies Zarar's video "software factory costs". It goes live at **https://zarar.dev/software-factory/**. People change the numbers from the video, plus more, and see what their factory costs, animated on a 3D factory floor. It must be beautiful: that is the bar, not a nice-to-have.

Every design decision below was settled in a grilling session with Zarar (2026-11-22). Don't re-ask any of them. If something truly isn't covered, pick the option most faithful to the video and the zarar.dev theme, and note it in `DECISIONS.md`.

## Where things live

| What | Path |
|---|---|
| This repo (empty, `git init` done, branch `main`) | `/Users/zarar/dev/software-factory-simulation` |
| **The model to port (source of truth)** | `/Users/zarar/dev/videos.zarar.dev/videos/2026-11-19-software-factory-costs/docs/sim/factory.mjs` (v9). Ignore `line.mjs` and `obs.mjs` (earlier toy models). |
| Golden numbers the port must reproduce | `.../docs/sim/results.md` (same folder) |
| Video script (chapter names, framing, the "bill") | `.../docs/script.md` |
| Sources for the Assumptions section | `.../docs/research.md` (source table: C3 Spotify, C5 StrongDM, C15 team size, etc.) |
| Site that hosts it (Astro 7, static, Cloudflare) | `/Users/zarar/dev/zarar.dev` (theme: `src/styles/global.css`, layout: `src/layouts/Base.astro`) |
| Zarar's writing voice | `/Users/zarar/dev/zarar.dev/src/content/blog/*.md` |

## Settled decisions

### 1. Engine: an exact port, no model changes
- Port `factory.mjs` v9 to TypeScript (`src/engine/`) **exactly**: same `BASE`, same LCG RNG, same lognormal (`ln`) and `exp` draws, the same order of RNG calls, the same event heap, the same station priority (diagnose > review > spec on the shared people pool), the same warm-up (15%), and the same metrics. `runMany` uses 9 seeds, `1000 + i*7919`, and takes the **median per metric**.
- Run it in a **Web Worker**, so the UI never blocks.
- **Golden tests (Vitest)** against `results.md`, compared after rounding to the precision the tables print. At minimum:
  - Baseline: median lead 19.2 h, p95 2.9 d, people load 76%, 9am pile 4.7, busy people-h/feature 4.2, paid h/feature 5.5, bug-h live/feature 5.9, tokens/feature $66.
  - Mid bill at baseline: tokens $66, CI $1, people $553, waiting $218, bugs $295, **total $1,132**, tokens rank 4 of 5.
  - Spot rows from E1 (5/day → 7.9 d), E3 (8 agents, 4 people → 18.5 h), E12 (no review → 3.4 h, bug-h 12.9), E13 (StrongDM bar → $687 tokens/feature).
- Write the port test-first (Pocock `tdd` skill): golden test, then port, then green.
- Add **trace mode** for the animation: it records an event log (job id, kind, station, enqueue/start/done times, bug flag, outcome such as rebuild/merge/escape) for one seed. **Trace mode must not change the RNG sequence.** Assert that a traced run returns the same metrics as an untraced run with the same seed. The seed to animate is the one whose median lead is the median of the 9.
- The model's known limits, to state on the page and **not** to fix: tokens don't buy quality, bugs have no severity, and the bug cost is flat per live hour.
- Ignore the stale label "Working hours (same two people)" in E11. The baseline team is 3.

### 2. Defaults: the video's baseline, results with zero input
- Defaults are `BASE` from v9 plus the **mid** money dials: $100 per paid hour, $10 per feature-hour of delay, $50 per bug-live hour.
- It **runs on page load**, so results show without anyone touching a dial. It re-runs about 300 ms after any dial stops changing. **Enter** or a **Run** button also re-runs it. Results update in place, with no full-page spinner.

### 3. Inputs
- **Headline dials** (always visible): features/day, people, agents, bug rate, human review on/off, who watches production (people/agents), loaded salary $/h, tokens $ per agent run.
- **Advanced drawers**, grouped, covering **every** `BASE` parameter:
  - Demand: maintenance/day.
  - Team and capacity: CI runners, shift (9–5 weekdays vs round the clock).
  - Step times: spec, build, CI, judge, review, diagnose, mitigate, customer report. Each has a mean and a variability (cv).
  - Quality: maintenance bug rate (null = same as features), test catch, judge reject, review catch, review other-reject, review on maintenance, conflict per merge.
  - Production: detection p and mean for people and agents, dedupe (tickets per bug).
  - Money: delay $/feature-h, bug $/live-h, CI $/run.
  - Run: length in weeks (default 26), seeds (default 9).
- **Money presets**: Low / Mid / High buttons. They set salary, delay and bug cost to 60/2/10, 100/10/50 and 150/25/200 (`DIALS` in `factory.mjs`). The page starts on Mid. Each dial stays editable after a preset.
- **Chapter presets**, labelled with the video's chapter names from `script.md`. Take each config from the experiment rows in `factory.mjs`:
  - Baseline: `{}`
  - "More agents, or another person?" at 4.5/day: 16 agents vs 4 people
  - "Someone understands the code": careful review (`review.mean 1.67, catch 0.8, diagnose.mean 1.5`)
  - "Drop the review?": `review.on false` (StrongDM rule 2)
  - StrongDM token spend: tokensPerBuild = $1,000 × people × 5 ÷ builds per week, about $260
  - No review on maintenance (Spotify): `review.maint false`
  - Agents read telemetry: `prod.mode agents`
  - "Catch it before merge": `testCatch 0.8, spec.mean 2.5, build.mean 0.9`
  - Bugs you can't roll back: `mitigate {24, cv 1}`
  - Round the clock: `shift false`

### 4. Outputs
- **The headline is the bill per feature**, stacked into tokens, CI, people (paid), waiting and bugs live, with the total. Call out **"Tokens rank N of 5"**: the video's point is that tokens are a small line on the bill.
- Under it: median and p95 lead time, shipped/day, people load, diagnosis share, the 9am review pile, bug-hours live per feature, conflicts/day, and tokens per working day for the team.
- Every number shows its **change from the video's baseline**.
- **Pin this factory**: freezes the current result as A, so the next config shows side by side as B, with the differences.
- Use the `dataviz` skill for the bill chart and stat tiles.

### 5. The 3D floor (three.js)
- An **isometric orthographic camera**. Drag orbits within a limited range, and the wheel or a pinch zooms. Hovering a station shows its queue length, load and average wait. Clicking a station opens its dials in the panel (for example, review desks open review time, catch rate and on/off).
- **Stations**: spec desks (people), build bays (agents as small robots), the CI conveyor, the judge gate, review desks (people), the merge point, then production. Diagnosis takes people away from their desks to production. Jobs are crates, one kind per stream: features, maintenance, fixes. **Bug crates are rust coloured**. You can see them escape to production and come back as fix crates.
- **Playback** of the traced median run. One sim week takes about 60 s, with a day/hour clock. **At night and on weekends the floor goes dim**, the people leave, and the agents and CI keep running, so the review pile grows overnight and is waiting at 9am. That is the video's main mechanism, so make it legible. Controls: pause/play, 1×/4×/16×, and a scrubber across the run.
- Phones: the same scene with a lower pixel ratio and fewer crates drawn. If WebGL is missing, show a static 2D line diagram in place of the floor. The bill still works.

### 6. Look: match zarar.dev's "Fieldnotes" theme exactly
- The palette comes only from `zarar.dev/src/styles/global.css`: paper `#f2f5f2`, card `#ffffff`, ink `#17241f`, pine `#1f6b5a`, rust accent `#8a3f1f`, rule `#c9d3cd`, muted `#586660`. **Don't invent colours.** Tints and shades of these are fine.
- The site background is graph paper, with 1px lines at `#00000009` every 28px. **The 3D floor is that graph paper**, as if the drawing stood up off the page. Use a paper-diorama style: matte surfaces, soft contact shadows, no neon, no bloom. Machines and agents in ink, people in pine, bug crates in rust.
- UI: read the page's CSS variables (`--ink`, `--pine`, `--accent`, `--paper`, `--rule`, `--muted`, `--font-display`, `--font-body`, `--font-mono`), and fall back to the values above only when run standalone. Headings are Fraunces (`font-variation-settings: 'SOFT' 100, 'WONK' 1, 'opsz' 144`), and the emphasised word in a heading is pine (`h2 strong`). Buttons copy the site's `.btn`: white card, 2px ink border, 4px radius, hard `3px 3px 0` pine shadow. Numbers are in the mono font. The site is **light only**.
- Load the `frontend-design` skill before building the UI.

### 7. Page on zarar.dev
- This repo builds `dist/software-factory.js` and `dist/software-factory.css` (plus the worker chunk), served under `/software-factory/`. The entry is an ES module that exports `mount(el, options)`.
- In `/Users/zarar/dev/zarar.dev`, add:
  - `src/pages/software-factory.astro`, using `Base.astro` (site chrome, sidebar), a full-bleed mount element, and the page copy.
  - A script (for example `npm run sync` in this repo) that builds and copies `dist/` into `zarar.dev/public/software-factory/`.
  - The site uses `trailingSlash: 'always'`. Make sure the bundle's asset and worker URLs resolve under `/software-factory/`.
- **Page copy** in Zarar's blog voice, run through `/humanizer:humanizer`:
  - A short intro: this is the model from the video, so change the numbers.
  - A **video embed slot**, left empty until the video is uploaded (a clearly marked placeholder or a hidden block).
  - An **Assumptions** section: every parameter in a line or two, with sources from `research.md` where they exist (Spotify's judge veto of about 1 in 4, StrongDM's $1,000/day bar, StrongDM's 3-person team). Say plainly which numbers are guesses (for example, the 5% maintenance bug rate), and list what the model leaves out (item 1).
  - A link to the repo, added once it's public (see 9).

### 8. Sharing
- The full config goes in the **URL hash**, compact and versioned (for example `#v1=...`). Opening a link reopens that factory exactly. Copy-link button.

### 9. Repo and stack
- Vite + TypeScript (strict) + three.js + Preact for the panel + Vitest. Keep the bundle lean: import only the three.js modules you use.
- Commit to `main` as you go, with clear messages.
- **Don't create a GitHub remote and don't push.** Zarar makes it public (`Arsenalist/software-factory-simulation`, MIT) after he has looked at v1. Add the `LICENSE` (MIT, Zarar Siddiqi) now.
- **Don't deploy zarar.dev** (`npm run deploy`), and don't commit in zarar.dev unless Zarar asks.

### 10. Video
- Don't touch the video's script. The link goes in the YouTube description and the pinned comment later, which is outside this work.

## Order of work (each step ends on a checkable bar)
1. Scaffold (Vite/TS/Vitest/Preact/three) and add the LICENSE. **Done when** `npm test` and `npm run build` pass on an empty app.
2. Engine port, test-first. **Done when** every golden number in §1 passes, the traced run equals the untraced run, and `runMany` in the worker returns in under ~2 s on a laptop. If it's slower, run the seeds in parallel workers.
3. Panel and bill with the defaults. **Done when** the page loads to the baseline bill of $1,132 with no input, every `BASE` parameter is editable, the presets and pin/compare work, and the URL hash round-trips.
4. The 3D floor and playback. **Done when** the night-time review pile is visible and grows in playback, bug crates escape and return as fixes, hover/click works, and it holds 60 fps on a laptop and is usable on a phone, with the 2D fallback in place.
5. The zarar.dev page and the sync script. **Done when** `astro dev --background` in zarar.dev serves `/software-factory/` working, inside the site chrome.
6. A beauty pass. Take screenshots at desktop and phone widths, compare them against zarar.dev's home and video pages, and fix anything that looks templated, off-palette or crowded.
7. Report to Zarar: what's done, screenshots, anything decided on his behalf (`DECISIONS.md`), and what's left (remote, deploy, the video link).

## Suggested skills
- **Pocock `tdd`**: for the engine port. The mattpocock-skills plugin is only enabled for the amplify project, so have Zarar run `/plugin` in this repo to enable `mattpocock-skills@claude-plugins-official` at project scope. If it isn't available, follow red→green→refactor by hand.
- **`frontend-design:frontend-design`**: before building the UI and the 3D look.
- **`dataviz`**: for the bill chart, stat tiles and deltas.
- **`hyperframes:hyperframes-animation`** (the Three.js adapter section): optional, for three.js motion patterns.
- **`humanizer:humanizer`**: on all page copy.
- **`run`**: to launch and screenshot the app while you work.
