# Requirements: web-and-area-pages

Status: APPROVED by delegation on 2026-11-14. Design in `design.md`, tasks in `tasks.md`.

## Introduction

The same Cloudflare Worker that takes events also serves a read-only web site: a map, one page per area ("Is there power in Yaba right now?"), and Judge mode, a replay that works on any phone, including an iPhone. There is no login, no cookie, no tracking and no separate web app.

Area pages are the search channel. Each has an install button, even before an area has sensors.

## Glossary

- **Public scope view**: the published status of a scope (cell, linked group or parent) from `area-cells`, which exists only with 3 or more members.
- **Catalog**: a file of named areas (for example Yaba) with a centre cell and a set of cells.
- **Public index**: a small store of the latest public scope views.
- **Five states**: Normal, Your spot only, Possible, Confirmed, Restored.
- **Judge mode**: the labeled replay of a recorded outage.
- **Replay fixture**: a sanitized recording used by Judge mode.

## Requirements

### R1 Routes and no login
**User story:** As a judge on an iPhone, I want to open one link and see everything with no sign-in.
1. THE Worker SHALL serve these routes with no login, cookie or account: `/` (map and area list), `/area/:slug`, `/c/:cell`, `/judge`, `/install`, `/privacy`, `/sitemap.xml`, `/robots.txt`.
2. THE Worker SHALL serve JSON for the same data under `/api/v1/public/...`, read-only.
3. THE pages SHALL work on Safari for iPhone, Chrome for Android and desktop browsers.
4. THE pages SHALL show their main status in server-rendered HTML, so they work with scripts off.
5. THE pages SHALL set no cookie, load nothing from another origin, and contain no analytics.
6. THE pages SHALL carry a content security policy that allows only the site's own origin and one inline script by nonce.

### R2 Five states
1. THE site SHALL define five states: Normal, Your spot only, Possible, Confirmed, Restored, each with a colour, an icon-free text label and one plain sentence.
2. THE real pages SHALL show Normal, Possible, Confirmed and Restored.
3. THE real pages SHALL NOT show "Your spot only", which is a single phone's state (area-cells R9.5). THE legend and Judge mode SHALL explain it, labeled as simulated in Judge mode.
4. THE colour SHALL never be the only carrier of the state; the text label SHALL always be present.
5. THE status of an area SHALL be the highest of the public scope views that cover its cells, ordered Confirmed, Possible, Restored, Normal.

### R3 Area pages
**User story:** As someone searching "light in Yaba now", I want a direct answer.
1. EACH catalog area SHALL have a page at `/area/:slug` with the title "Is there power in {Area} right now?".
2. THE page SHALL show the answer in the first screen: the state label, one sentence, and the "since" time.
3. THE page SHALL show the last 30 days of outages of the area's public scopes, each with start, end or "unknown", level, and a precision label.
4. THE page SHALL show the precision label ("Based on a wider area") when the status comes from a wider scope.
5. THE page SHALL show an install button with the direct APK link, even for an area with no public status.
6. WHEN an area has no public status, THE page SHALL say "No phones here yet. Install Outage to be the first." and SHALL show no status, boundary or count.
7. THE page SHALL show "3+ phones" and never a smaller number.
8. THE page SHALL update the status without reload every 30 seconds when scripts are on.
9. THE page SHALL have a title, description and canonical link, and a stable URL.
10. THE site SHALL answer an unknown slug with a page that lists areas and the install button.

### R4 Cell pages
1. THE route `/c/:cell` SHALL accept any valid res-8 cell and show its public status if a scope covers it, or the install invitation if not.
2. THE page SHALL be marked `noindex`.
3. THE page SHALL reveal nothing about a cell that has no public scope, including whether any phone exists.
4. THE answer for a valid cell without a public scope SHALL be identical for cells that have no phones and cells that have fewer than 3.

### R5 Map
1. THE home page SHALL draw an SVG map of the catalog areas as their cells, coloured by state, with labels.
2. THE map SHALL draw only cells that belong to a public scope or to a catalog area, using the boundary of the scope used (area-cells R9.4).
3. THE map SHALL need no map tiles and no outside service.
4. THE map SHALL be usable by touch, with the area list as the accessible alternative.

### R6 Judge mode
**User story:** As a judge, I want to see an outage happen and explain itself.
1. THE route `/judge` SHALL replay a recorded outage with play, pause, restart and speed controls.
2. THE page SHALL show "Simulated replay" in a banner that cannot be hidden, in the page title and in every data object it loads.
3. THE page SHALL state how many real devices recorded the outage and that the replay was recorded, not live.
4. THE replay SHALL step through Normal, Possible, Confirmed and Restored, and SHALL show the engine's explanation (drops, armed phones, baseline, probability, thresholds) for each decision.
5. THE replay SHALL include a "Your spot only" frame for one replayed phone, labeled as simulated.
6. THE replay data SHALL be a static file built from a fixture, with decisions produced by the real detection engine at build time.
7. THE page SHALL work with no network after load, offline-capable on a refresh.
8. THE Judge route SHALL NOT read or write real state, and real routes SHALL NOT read the replay (supports P9).
9. THE page SHALL explain, in three lines, the idea: "Phones charging stop charging at the same second when power dies."

### R7 Install page
1. THE route `/install` SHALL show the direct APK link, the app version, the file size and a SHA-256 checksum.
2. THE page SHALL say "Android only for now" for iPhone and show the web page and Judge mode as the iPhone path.
3. THE page SHALL explain, in plain words, how to allow installing from the browser on Android.
4. THE APK link SHALL be a configuration value, not code.

### R8 Public data source
1. THE Worker SHALL read public scope views from the public index.
2. THE area actors SHALL publish a scope's view to the index when its status, boundary or member floor changes, and SHALL remove it when it falls below 3 members.
3. THE public index SHALL hold only what the public view contains.
4. THE Worker SHALL serve the index data with a short cache.

### R9 Caching and budget
1. THE Worker SHALL cache rendered pages and JSON for 30 seconds, and static replay data for one hour.
2. IF the Cache API is not available on the deployed domain, THEN THE Worker SHALL use a per-isolate time-limited cache and set cache headers.
3. A page request SHALL cause at most one Durable Object request when uncached.
4. THE page render SHALL stay inside the 10 ms free-plan CPU limit with margin, and the HTML for an area page SHALL be under 30 KB.

### R10 Catalog
1. THE catalog SHALL list named areas with a slug, a name, a centre cell and a radius in rings, and SHALL be a file in the repo.
2. THE catalog SHALL start with Lagos areas and SHALL be open to other cities.
3. EACH catalog entry SHALL cite its centre coordinates' source and have been checked by a person.
4. THE catalog SHALL NOT contain any user data.

### R11 Privacy and safety
1. THE site SHALL contain no install ID, push token, per-install data or number below 3.
2. THE site SHALL escape every dynamic string.
3. THE site SHALL answer only `GET` and `HEAD`.
4. THE `/privacy` page SHALL state what is collected, what is public, and how to delete data.
5. THE robots file SHALL allow area pages and Judge mode and disallow `/c/` and `/api/`.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | The brief lists five states for the page, but "Your spot only" is a single phone's state and publishing it would break the privacy rule. | R2.3. |
| G2 | Page views could each cost a Durable Object request per area. | R8, R9.3: public index and cache. |
| G3 | A map needs tiles from a third party, which breaks "no outside service" and leaks viewers. | R5.3: SVG hexes. |
| G4 | Area names, centres and the catalog have no source. | R10. |
| G5 | Judge mode needs real recordings, which do not exist until the field test. | R6.3, demo-mode spec: labeled simulated data first. |
| G6 | "Cache API" may not work on every domain. | R9.2. |
| G7 | Cell pages could reveal which cells have phones. | R4.3, R4.4. |
| G8 | Scripts-off and iPhone Safari support. | R1.3, R1.4. |
| G9 | The install link and checksum for the APK. | R7. |
| G10 | Public pages must not leak the replay as real data. | R6.8. |
| G11 | Inline script and CSP. | R1.6. |

## Decisions (2026-11-14)

| Item | Value |
|---|---|
| Page cache | 30 s |
| Replay cache | 1 hour |
| Poll interval | 30 s |
| HTML size budget | 30 KB per area page |
| Map | SVG hexes, no tiles |
| Catalog start | Lagos neighborhoods; coordinates to be verified by the human against an open source before release |

- Area actors publish public views to a `PublicIndex` actor (a single small actor). This is a singleton but receives writes only on public changes (ADR 0010); amends `area-cells`.
- No new dependency: server-rendered HTML by string templates, inline SVG, one small script.
