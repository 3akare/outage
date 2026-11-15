# Requirements: app-map-insights

Status: APPROVED by delegation on 2026-11-15 (standing rule: decide, record in an ADR, proceed). Design in `design.md`, tasks in `tasks.md`.

## Introduction

The Android app is the full experience. An Android user never needs the website. The web page exists for judges on iPhone and for search.

This spec adds two screens to the app:
- **Area**: a real map of outages. Coloured hexagons show which parts of the city have power, with no street background and no outside request.
- **Insights**: charts of the user's own power over time: how often it goes, when, for how long, and how it compares with the tariff band.

Both work from one phone. The map adds neighbours when the server has 3 or more phones for a cell.

## Glossary

- **Hex**: one H3 resolution 8 cell, drawn as a hexagon.
- **Cell state**: `NORMAL`, `POSSIBLE`, `CONFIRMED`, `RESTORED` or `NO_DATA` (the names in `app-shell` and the public JSON).
- **Floor**: the 3-phone minimum before a cell shows any state (ADR 0007). Below it a cell is `NO_DATA`.
- **Spot**: the user's own cell. Drawn with an outline. Never drawn as a point.
- **Day with data**: a day whose coverage meets the power-log rule (power-log R3).

## Requirements

### R1 Area map
**User story:** As a user, I want to see which parts of my city have power right now, on my phone.
1. THE Area screen SHALL draw every public cell in the followed city as a hexagon on a canvas, with no basemap and no network request for tiles.
2. EACH hex SHALL be coloured by its cell state, using the same colours as the status chips in `app-shell`.
3. THE map SHALL open centred on the user's spot, zoomed so the spot and its ring of neighbours fit.
4. WHEN the user drags, THE map SHALL pan. WHEN the user pinches, THE map SHALL zoom about the pinch point, between a minimum and maximum zoom.
5. WHEN the user double-taps, THE map SHALL zoom in one step about the tap point.
6. WHEN the user taps the recentre button, THE map SHALL return to the spot view.
7. THE map SHALL show a legend with each state's colour, name and glyph.
8. THE map SHALL label areas with names from the catalog, never with a street or a place name from outside.
9. THE map SHALL NOT mark where any one phone is. The spot outline marks only the user's own cell (privacy.md).
10. THE map SHALL redraw at interaction speed for a city of up to 500 hexes (no per-frame allocation of paths beyond the visible set).

### R2 Cell states and the floor
1. A cell with fewer than 3 phones SHALL be `NO_DATA`, drawn in a neutral outline with the words "No data". It SHALL look the same as a cell with no sensors (ADR 0007).
2. THE map SHALL NOT show the member count of a cell. It SHALL show only "3+" or nothing.
3. A `CONFIRMED` or `POSSIBLE` cell SHALL show when it started, from the public JSON.
4. A `RESTORED` cell SHALL show when power came back and SHALL return to `NORMAL` after 24 hours (the web rule in `web-and-area-pages`).

### R3 Cell detail sheet
1. WHEN the user taps a hex, THE app SHALL open a bottom sheet with the area name, the state in words, the start time or restore time, and the last 30 days of outages for that cell.
2. THE sheet SHALL show "Updated N min ago" and, if older than 30 minutes, "Station offline" wording per `copy.md` where it applies.
3. THE sheet SHALL offer "Follow this area" which changes the followed area.
4. THE sheet SHALL NOT show any sensor count, device id or position.

### R4 Offline and freshness
1. THE app SHALL keep the last map JSON on the phone with the time it was fetched.
2. WHEN there is no network, THE Area screen SHALL show the last known map with a banner "Offline. Last update HH:MM".
3. WHEN there is no cache and no network, THE Area screen SHALL show "No map yet" and the spot's own state from the Power Log.
4. THE app SHALL refresh the map on open and at most once every 60 seconds while the screen is visible.

### R5 Simulated data
1. WHEN the data comes from the demo or a replay, THE Area and Insights screens SHALL show a visible label "Simulated" at the top, and the data SHALL carry `simulated: true`.
2. Simulated data SHALL NOT be written to the real cache or the Power Log (demo-mode.md, property P9).

### R6 Accessibility
1. EVERY hex SHALL have a text description, "Yaba, Confirmed outage since 2:14 p.m.", reachable by TalkBack.
2. State SHALL never be shown by colour alone. Each state has a glyph or pattern (solid, hatch, dots, outline) shown on the hex and in the legend.
3. THE map SHALL have a list view alternative listing areas and states, reachable from a button on the Area screen.
4. Touch targets for buttons SHALL be at least 48 dp.
5. Charts SHALL have a text summary line and a text description of each bar or cell.

### R7 Insights: counts and hours
**User story:** As a user, I want to see how my power behaves, so I can plan around it.
1. THE Insights screen SHALL show, for a range of 7, 30 or 90 days chosen by the user: the number of outages, the total hours without power, the average hours of power per day, and the longest outage.
2. THE screen SHALL show a bar chart of hours of power per day for the range, with the band promise drawn as a line when a band is set (R9).
3. Days without enough data SHALL be drawn as an empty bar with "No data", never as zero.

### R8 Insights: patterns
1. THE screen SHALL show a heatmap of 7 weekdays by 24 hours, where each cell's shade is the share of observed time without power in that slot.
2. THE heatmap SHALL show "Not enough data" for a slot observed fewer than 3 times.
3. THE screen SHALL state in one plain sentence the worst slot, for example "Power most often goes on Tuesday evenings." It SHALL appear only when at least 14 days have data.
4. THE screen SHALL show the 5 longest outages with date, start time and length.
5. THE screen SHALL show a 12-week trend line of average hours of power per week.
6. THE screen SHALL show the average time between outages when there are at least 3 outages in the range.
7. THE screen SHALL show a ring with the month's Light Score from the Power Log.

### R9 Insights: promise check
1. WHEN a tariff band is set, THE screen SHALL compare average hours per day with the band's promised minimum and show the difference.
2. THE comparison SHALL be labelled "Estimate". It SHALL NOT use refund, compensation or claim wording (power-log R5, ADR 0020).
3. IF the band is not verified in `bands.json`, THE comparison SHALL say "unconfirmed".

### R10 Empty and early states
1. WHEN fewer than 7 days have data, THE Insights screen SHALL show a progress message "Day N of 7. Patterns appear after 7 days" and only the counts and the list of outages.
2. THE heatmap, trend and sentence SHALL stay hidden until their own minimum is met (R8.2, R8.3).
3. WHEN there is no data at all, THE screen SHALL explain how the log is built, in two lines, and link to the battery step if the sensor is not armed.

### R11 Cost and privacy
1. THE map and charts SHALL need no paid service, no API key and no new Gradle dependency (ADR 0022, ADR 0023).
2. THE map SHALL make no request to a third party. The only request is to the Worker's public JSON.
3. Insights SHALL be computed on the phone from the local Power Log. No log data SHALL be uploaded for it.
4. Delete-my-data SHALL erase the cached map JSON (app-shell R5).

### R12 Navigation
1. THE bottom bar SHALL have Home, Area, Insights, Log and Settings.
2. Deep link `insights` SHALL open the Insights screen. Unknown values stay ignored (app-shell R1.3).
3. Strings SHALL be in `res/values` and in the Pidgin pack with fallback per key (`StringPackTest`).

## Analysis of requirements (gaps found and how they were fixed)

| # | Gap | Fix |
|---|---|---|
| G1 | A map of every cell could reveal where one phone is. | R2.1 and R2.2: under 3 phones a cell is `NO_DATA`, and no count is shown or sent (R11.2, ADR 0007). |
| G2 | The Android app had no source of map data. The web page draws an SVG on the server. | A new `GET /api/map.json` route (task 1, ADR 0025) with a shared fixture read by Vitest and JUnit. |
| G3 | The app had no internet permission and no API address in the build. | `INTERNET` permission added. The base address is the Gradle property `outageApiBase`. Until it is set the app shows the labelled demo (R5). |
| G4 | Simulated data could be mistaken for real data or pollute the cache and the Power Log. | R5: a visible "Simulated" label, `simulated: true`, and no cache write (AM6). |
| G5 | Insights could show 0 hours for days the phone never observed. | R7 and R10: days under the coverage rule are `null`, not 0 (IN4). |
| G6 | The Power Log timeline does not exist yet, so real Insights have no input. | `PowerLogInsightsSource` reads `PowerLogTimeline.None` and shows the empty state. Task 6 stays open until the timeline is built. |
| G7 | Day and weekday edges depend on the phone's time zone and daylight saving. | The zone is an input to `InsightsCalc.compute` (IN5). |
| G8 | The promise check could read as a compensation claim. | R9 wording rules, tested by IN6. |
| G9 | A canvas has no accessible children. | R6 adds a list view and semantic descriptions per state. |

## Gaps and risks

| # | Gap or risk | Handling |
|---|---|---|
| G1 | The phone has no hex geometry. | The Worker serves cell outlines in the public map JSON (design section 3). No H3 library needed for drawing. |
| G2 | No street background makes places hard to read. | Catalog area names as labels, the spot outline, the list view (ADR 0022). |
| G3 | Charts are custom code and could be wrong. | Chart maths is pure Kotlin with JUnit 4 and seeded property tests (design section 7). |
| G4 | Insights need weeks of data to look good. | Early states in R10, and a labelled demo set for judges (R5). |
