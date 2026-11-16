# Requirements: material-redesign

Status: APPROVED by the human on 2026-11-24 ("Yes to all that", then the design-system and icon request). Decisions: ADR 0048, 0049, 0050. Revised by ADR 0051 after the human rejected the first look: R4.1 is now a rotating globe, R1.3 is one dark palette (no light mode), the Material 3 skill is removed, and the mark is redrawn. Amends `ux-redesign` (see its status line).

## Introduction

Outage is one Android app and one website. The human asked for three things: one modern, standard look on every platform (Material 3, with the `material-3` skill), a new mark (a power symbol whose stem is a charging bolt, in the style of a Google product icon), and the product flow they described: install, answer "do you want your location?", land on a map of your area with hexagons showing power, with a bar at the bottom whose middle item is Home. The website is a landing page with download links and the app in the browser for judges who cannot install it.

## Glossary

- **Material 3**: Google's design system: colour roles, type scale, shapes, components. https://m3.material.io
- **Mark**: the Outage logo and app icon.
- **The app in the browser**: `/app/simulate`, the web copy of the Android app on simulated data.
- **Spot**: the user's own map cell (never a position).

## Requirements

### R1 One design system
**User story:** As a user, I want the phone app and the website to look like the same product.
1. THE app and the website SHALL take every colour, type size, corner radius and spacing step from `core/shared/design/tokens.json`.
2. THE token file SHALL hold a complete Material 3 colour scheme for light and dark, and the four power states as custom colours with containers.
3. BOTH platforms SHALL follow the system light or dark setting.
4. THE generated CSS and Kotlin SHALL match the token file, checked by a test.
5. ICONS SHALL come from one set shared by both platforms.

### R2 The mark
1. THE mark SHALL be a power symbol whose stem is a charging bolt.
2. THE Android adaptive icon SHALL keep the mark inside the 66 dp safe circle and SHALL have a single-colour themed layer.
3. THE website header and favicon SHALL use the same mark, generated from the same geometry.
4. THE mark SHALL NOT use another company's name or brand colours.

### R3 First run (Android)
1. THE first screen SHALL offer "Use my location" and "Not now".
2. WHEN the user chooses Use my location, THE app SHALL ask for coarse location once, turn one position into a cell of the published map, store only the cell, and drop the position.
3. THE app SHALL NOT store a cell from a mocked position or from outside the map at first run.
4. WHEN first run ends, THE app SHALL open Home and SHALL say whether the spot was set.
5. THE first run SHALL ask for no permission other than coarse location and notifications.

### R4 Home (Android and web)
1. HOME SHALL be a full-screen hex map with the spot centred in the area the sheet does not cover.
2. A sheet SHALL show the spot card when collapsed and the feed when pulled up.
3. THE spot card SHALL show the state in words and colour, the age of the data, the sensor state and the tariff band when one is chosen.
4. THE bottom bar SHALL be Insights, Home, Settings, in that order, and the app SHALL open on Home.

### R6 The globe (ADR 0051)
1. THE Home map on the phone and on the web SHALL be a globe of the real Earth that turns by itself, follows a drag and zooms with a pinch.
2. THE globe SHALL fly down to the user's spot after first run and SHALL draw the power blocks on the sphere at street level.
3. THE land SHALL come from public-domain data in `core/shared/geo`, with no tile server, key or request to another origin.
4. THE phone and the web SHALL use the same maths and the same data files.

### R5 Website
1. THE landing page SHALL offer the app in the browser and SHALL show a Google Play or Aptoide button only when its link is configured, and always a GitHub download.
2. `/app/simulate` SHALL mirror the Android app screen for screen and SHALL be labelled simulated on every screen.
3. `/app/simulate` SHALL read only the replay and SHALL NOT read the public index.
4. THE old `/app` addresses SHALL redirect to `/app/simulate`.
5. NO page SHALL load anything from another origin or carry an inline style attribute.

## Analysis of requirements (gaps found and how they were fixed)

| Gap | Fix |
|---|---|
| "Look like a proper Google logo" could mean copying Google's brand. | R2.4: Google-style geometry, Outage's own state colours, no Google name or shape (ADR 0048). |
| A location question could block the first look. | R3.1 "Not now", R3.4 Home either way. |
| "Shows you your location" could mean a precise dot. | R3.2: a cell only; the dot marks the cell centre (ADR 0050, ADR 0037). |
| Store links that do not exist yet would be dead buttons. | R5.1: shown only when configured. |
| Two web apps (replica and simulation) drift from the phone. | R5.2, R5.4: one app in the browser, old addresses redirect (ADR 0049). |
| Bands on the map have no public area-to-band data. | R4.3: the user's own band on the spot card; a per-area band layer needs data first and is left out. |

## Gaps and risks

- Compose screens are not screenshot-tested in the cloud session (no emulator); they are checked on a device in the Kiro IDE pass (task 7).
- The web copy of the app must be kept in step with the phone by hand; `judge-demo.md` lists what to compare.
