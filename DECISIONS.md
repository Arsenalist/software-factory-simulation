# Decisions made on Zarar's behalf

HANDOFF.md settled the design. These are the gaps I filled while building v1, each picked to stay close to the video and the zarar.dev theme. Change any of them.

## Engine
- **`mergeCfg` merges two levels deep**, not one, so `detect.humans.p` can be overridden alone. Every experiment row in `factory.mjs` gives the same result either way (the golden tests cover them).
- **The warm-up share (15%) has no dial.** It is part of how the video measured, not a property of a factory. Every other `BASE` parameter has one.
- **Review outcomes are split into "caught" and "reject"** in the trace. The two random draws happen in the same order as the original `(bug && rnd() < catch) || rnd() < reject`, and the traced-equals-untraced test holds.
- **One worker, no parallel seeds.** Nine six-month runs plus the traced run take about 40 ms, far under the 2 s bar.
- **StrongDM's preset uses $259.59 per run** (the model's own `1000 × 3 × 5 ÷ builds per week`, rounded to the cent) so the share link stays short. It reproduces the $687 and $1,753 in `results.md`.

## Panel and bill
- **Chapter presets replace the model's parameters and keep the money and run dials.** "More agents, or another person?" is two buttons, one per arm of the experiment.
- **Changes are shown against the video's baseline at the mid dials** ($1,132), whatever money preset is active. With a factory pinned, they are shown against the pin.
- **Bill lines are listed largest first**, so "Tokens rank N of 5" is the row it sits on.
- **Bill colours come from the site palette only**: people pine, bugs rust, waiting a pine hatch, tokens ink, CI grey. The dataviz validator passes them on colour-blind and normal-vision separation, and fails them on its lightness and chroma bands, which a two-ink palette can't meet. Every line is also labelled with its name and amount, so nothing depends on colour.
- **Sliders stop at a sensible range; the number box goes further** (for example tokens per run: slider to $400, box to $20,000).
- **A money-only change reprices the bill at once** without re-running the simulation, since the hours don't change.

## The floor
- **The wheel zooms only after you've clicked or dragged the floor** (or with ctrl/cmd, which is also a trackpad pinch). Otherwise the page couldn't scroll past a full-width canvas. On touch, a horizontal drag turns the floor and a vertical swipe scrolls the page.
- **Playback opens on the first Monday after warm-up at 7am**, so the first thing you see is the weekend's pile and the people arriving. It loops at the end of the run and keeps its place when you change a dial.
- **Bug crates are rust from the moment they are built**, not only once they escape. You can watch one get caught at CI or review, or slip through.
- **With "Round the clock" the lights never go down**, since the dimming means "people are off shift".
- **By day the floor has no surface of its own.** The canvas is transparent, so the page's graph paper is the floor, and only grid lines and shadows are drawn on it. At night a soft-edged shade fades in.
- **People stand at the end of the desk they're working at**, and walk to production to diagnose. Tasks started before 5pm are finished after it, as in the model.
- **Drawn counts are capped** (24 people, 48 agents, 8 CI lanes, 44 crates per pile, 24 live bugs). The labels still show the true numbers.
- **three.js is loaded on demand** in its own chunk (about 150 kB gzipped), so the bill shows before the floor does.

## The page
- **The page is `/software-factory/` with the sidebar off**, like the video pages. The video slot is a hidden block until `youtube` is set at the top of `software-factory.astro`, and the repo link appears when `repo` is set.
- **The judge rejects 20%, and the page says Spotify reports about 1 in 4.** That's what `BASE` has, so the copy says "I rounded down".
- **The 2% conflict chance is called low** in the copy, next to the 20%+ rates in the agent PR studies from `research.md`.
