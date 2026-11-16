# ADR 0052: Hallmark's Midnight theme, Mona Sans, and the simulated city at real Lagos places

Status: ACCEPTED (2026-11-24). Asked for by the human: "Install hallmark ui skills", "use actual locations for the map; Lekki and Yaba aren't that close; even if it's simulated I want it real". Spec: `.kiro/specs/material-redesign/` (tasks 11 and 12). Supersedes ADR 0051 decision 3 (the night palette and glass panels) and ADR 0049 decision 2 (the 21-block axial sample city); keeps the globe, the mark and the token and icon pipelines.

## Context
The human rejected the night redesign as ugly and asked for the Hallmark design skill. The sample city was 21 hexagons on a made-up axial grid, so Yaba, Surulere, Ikeja and Lekki sat touching each other, which is false: Yaba and Lekki are about 11 km apart.

## Decision
1. **Hallmark is installed** from its source, `Nutlope/hallmark` (MIT), in `.agents/skills/hallmark`, linked for Claude Code in `.claude/skills/hallmark` and pinned in `skills-lock.json`. Its rules bind all UI work: the Floor (every colour and font through a token, no `transition: all`, focus on every control, reduced motion, no eyebrow or tracked-caps label, no dot-joined meta strings, no drawn device frame, no invented figure, the stamp first in the CSS). Its linter (`scripts/sloplint.mjs`) could not run in the cloud session (the session's permission check refused third-party scripts); run it locally with `node .agents/skills/hallmark/scripts/sloplint.mjs --url http://localhost:8787/ --genre atmospheric --render`.
2. **Theme Midnight** (atmospheric): midnight-blue ground to every edge, cool white ink, square surfaces stepped in lightness, one azure signal, no glow, glass or blur. Its OKLCH values are converted to hex in `core/shared/design/tokens.json` so Compose and CSS share them. The four power states are tuned to the ground at matching lightness; restored is indigo so it never reads as the azure signal.
3. **Mona Sans** (OFL 1.1), the theme's one family: expanded 300 for headings, normal width for reading. The web serves it from this Worker at `/fonts/mona-sans.woff2` (CSP gains `font-src 'self'`; the bytes come from `core/shared/design/fonts/` through `tools/tokens/build.mjs`). Android uses the same font as `res/font/mona_sans.ttf` (converted with fontTools: `TTFont(woff2).flavor=None`).
4. **The landing page** is rebuilt in Hallmark's shape: a hero of a seven-word head, one sentence and two actions beside the turning globe; a night log of one power cut; one real figure (3 phones must agree); the features as hairline rows; the downloads; a footer that credits Natural Earth and Mona Sans.
5. **The simulated city is real geography.** `tools/sim/scripts/build-demo-city.mjs` takes the 9 catalog areas (OpenStreetMap coordinates, each with its source) plus Lekki (OpenStreetMap), and builds each as the real H3 resolution-8 blocks within two rings of its point (174 blocks). Only the power states are made up. It writes `core/shared/fixtures/demo-city.json` for the web and `android/.../map/DemoCity.kt` for the phone, so both show the same city. Ids are `sim-` + the H3 index, so a simulated block can never be saved or sent as a real spot.

## Alternatives
1. **Keep designing without a design system.** Rejected by the human.
2. **Load Mona Sans from Google Fonts.** Rejected: no page loads anything from another origin (ADR 0027).
3. **Draw the areas as invented shapes at their real centres.** Rejected: the real H3 blocks are what the product publishes, so the simulation shows exactly what real data will look like.

## Consequences
- The CSS stamp (first lines of `/app.css`) records the Hallmark build; keep it first.
- The demo city has 174 blocks; the Android map test checks it against `DemoCity`, and `demo-city.test.mjs` checks both outputs are current.
- Android screens with the new theme and font are unverified on a device (spec task 7).
