# Requirements: ux-redesign

Status: APPROVED by delegation on 2026-11-22 (standing rule: decide, record in an ADR, proceed). Design in `design.md`, tasks in `tasks.md`. Decisions: ADR 0026 (information architecture), ADR 0027 (web), ADR 0028 (design system).

## Introduction

The human could not tell what the website was. It was text pages with no map, no landing page, and a Judge mode nobody understood. This spec fixes the shape of the product, once, for the app and the website.

- **App:** first open has one short step, then Home. Home shows a map of the user's area and the areas around it, coloured by blackout status, above a feed. A dock at the bottom has Home, Insights and Settings.
- **Website** (same Worker, for judges without Android): a landing page at `/`, a replica of the app at `/app` that uses real data, and a clearly separate simulation at `/app/simulate`.

One design system (colours, type, spacing, hex map style) is used by both.

## Glossary

- **Dock**: the bottom bar with three destinations.
- **Home**: the map on top, the feed below.
- **Replica**: the web version of the app at `/app`. Same screens, same look, real data.
- **Simulation**: `/app/simulate`. A scripted blackout on invented data. Always labelled.
- **Floor**: fewer than 3 phones in a cell means "no data" (ADR 0007).
- **State colours**: Normal, Possible, Confirmed, Restored, plus a neutral for no data.

## Requirements

### R1 First run
**User story:** As a new user, I want to open the app and be using it in seconds.
1. THE app SHALL show one first-run screen with one sentence about what the app does and one button, then open Home.
2. THE button SHALL request only what the sensor needs to run (notifications where the OS asks). Battery and location steps SHALL NOT block the first run. They appear later as cards in the Home feed.
3. WHEN the user has finished first run, THE app SHALL open Home on every later launch.
4. THE first run SHALL work with no network.

### R2 Home
1. THE Home screen SHALL show a map at the top: the user's cell and the cells around it, centred on the user's area, close enough to read.
2. EACH cell SHALL be coloured by its state, using the state colours of the design system, with a pattern or glyph so colour is not the only signal.
3. THE map SHALL use only information the Worker already makes public: current state, and past outages for the colouring of recent history.
4. WHEN a cell has fewer than 3 phones, THE map SHALL draw it as no data, the same as a cell with no sensors.
5. THE feed below the map SHALL list, newest first: the status of the user's spot, recent outages near them, and setup cards that still need doing.
6. THE map SHALL NOT mark where any one phone is. The user's own cell has an outline, never a point.
7. WHEN the area has no reporting phones, THE screen SHALL say "No phones reporting here yet" and SHALL NOT invent an outage.

### R3 Dock
1. THE dock SHALL have exactly three destinations: Home, Insights, Settings.
2. THE dock SHALL be the same on the app and the replica, in the same order.
3. A fourth destination SHALL be added only with an ADR that shows the content cannot live in Home, Insights or Settings.
4. THE Area list and the Power Log SHALL be reachable from Home and Insights and SHALL NOT have their own dock slot.

### R4 Insights
1. THE Insights destination SHALL show the user's own charts (Light Score, hours of power, outage heatmap, promise check) as in `app-map-insights` R7 to R10.
2. On the replica, Insights SHALL show the area's real history when it has data, and the empty state otherwise.
3. THE promise text SHALL never say refund, compensation or claim.

### R5 Settings
1. THE Settings destination SHALL hold alarm and alert choices, Home Watch, battery setup, language, tariff band, followed area, privacy, and Delete my data.
2. Delete my data SHALL remove everything tied to the install, on the server and on the phone (privacy.md).

### R6 Landing page
**User story:** As a judge who opens the link, I want to understand the product in ten seconds.
1. THE page `/` SHALL state the pitch in one headline: "Your phone charger is a power-grid sensor."
2. THE page SHALL show how it works in three short steps, with a small picture of the hex map.
3. THE page SHALL offer three actions: Open the app (`/app`), Watch a blackout (`/app/simulate`), Install on Android.
4. THE page SHALL make no claim that phones produced the "utility undercounted outages by nearly 100%" finding (product.md).
5. THE page SHALL show no real counts of phones.

### R7 Web replica
1. THE page `/app` SHALL look and work like the app: same dock, same Home with map and feed, same Insights and Settings tabs.
2. THE replica SHALL read real data from the Worker (`/api/map.json` and the public status), and SHALL show "No phones reporting here yet" when there is none.
3. THE replica SHALL be read-only: no install ID, no cookies, no viewer tracking, no request to another origin.
4. THE replica Settings SHALL show what the app would offer, labelled "In the Android app", and SHALL NOT store anything.
5. THE replica SHALL work at 390 px and at 1280 px wide.

### R8 Simulation
1. THE page `/app/simulate` SHALL be linked from the landing page and from the replica, and SHALL look different enough that no one mistakes it for real data: a fixed banner "Simulated. Not real data." on every state.
2. THE simulation SHALL play a scripted blackout on the map: Normal, one phone drops, Possible, Confirmed, Restored. Each step SHALL say in plain words what is happening and why the Worker decided it.
3. THE user SHALL be able to play, pause, restart and change speed.
4. THE simulation SHALL use the replay file from `tools/sim` (ADR 0015). The phone never runs detection, and the page SHALL show results from the recorded replay, not a second detector.
5. Simulated data SHALL NOT appear in the replica, area pages or history.

### R9 One design system
1. THE app and the web SHALL take colours, type scale, spacing and hex style from one token set (ADR 0028).
2. A test SHALL fail when the Compose theme and the CSS tokens disagree on a colour.
3. THE state colours SHALL pass a colour-blind check and 4.5:1 text contrast.

### R10 Privacy, cost and speed
1. THE web SHALL send no request to another origin and use no tile server, font service or analytics (ADR 0010, 0022).
2. THE web SHALL use vanilla JavaScript, no framework, and no build step beyond the Worker bundle (ADR 0027).
3. EACH page SHALL load in under 100 KB over the wire and SHALL be usable with scripts off where it can (landing, area pages).
4. Area pages `/area/<slug>` SHALL stay 404 until `checkedBy` is set (web-and-area-pages R10.3).

## Analysis of requirements (gaps found and how they were fixed)

| Gap | Fix |
|---|---|
| "Authorize" could mean several permission prompts that block a first look. | R1.2: one button, other steps become feed cards. |
| Five tabs (Home, Area, Insights, Log, Settings) split one idea across screens. | R3, ADR 0026: Area merges into Home, Log into Insights. |
| The word "Judge mode" explains nothing. | R8: it is called "Watch a blackout" and lives under `/app/simulate`. |
| Real and simulated data could mix on one page. | R7 and R8: separate routes, fixed banner, test that the replica never reads the replay. |
| A replica with no data looks broken. | R2.7: honest empty state with a way to see the simulation. |
| Two styles would drift apart. | R9: one token file, a test across Kotlin and CSS. |

## Gaps and risks

- Real data will be empty until phones report. The empty state and the simulation carry the demo until then.
- The old 30 KB page limit does not fit a map page. ADR 0027 revises it.
- Android and web screens are checked by screenshot (Playwright for web, the Kiro IDE pass for the app).
