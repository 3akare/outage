# ADR 0050: First run asks for location once; Home is the map with a sheet; Home sits in the middle of the bar

Status: ACCEPTED (2026-11-24). Asked for by the human: "immediately they install it ... do you want your location? ... the moment you are done, you land on a page that shows you a map, that shows you your location", "a dock at the bottom; the middle one is the home page". Spec: `.kiro/specs/material-redesign/`. Supersedes ADR 0030 decisions 1, 4 and 5 and ADR 0026's tab order; keeps ADR 0037 (coarse location, cell only).

## Context
ADR 0030 made first run one button with no location, and put a 420 dp map box above a scrolling feed. The human wants the location question up front and a map-first Home like a maps app, with Home in the middle of the bar.

## Decision
1. **First run** (`FirstRunScreen`): the mark, one sentence, a privacy card, then **Use my location** and **Not now**. Use my location records consent, asks for `ACCESS_COARSE_LOCATION` once, reads one position (`LocationSource.readOnce`), turns it into a cell of the published map (`Spot.resolve`), saves the cell only (`saveSpot`) and drops the position (onboarding O2, ADR 0037). A mocked position, a place outside the map or a sample-map cell is not saved from first run; the person can confirm or pick on the map in Settings. Then notifications are asked where the OS needs it (API 33+). Not now skips location. Either way the app opens on Home with a snackbar saying what happened. Judge mode stays on the first screen.
2. **Home** is a `BottomSheetScaffold`: the hex map fills the screen under the status bar, with a floating search-style top bar (mark, "Power map", headline, Simulated chip, list toggle), legend chips, and small FABs for zoom and "back to my spot". The spot is drawn with a "you are here" dot and centred in the band between the top bar and the sheet. The sheet peeks with the spot card (state, age, sensor and band chips) and pulls up to the feed (setup cards, Home Watch, power today, Light Alarm, Power Log).
3. **Navigation bar:** Insights, Home, Settings. The app still opens on Home. Deep links are unchanged.
4. **Settings** is grouped like the web copy: Your power, This phone, About, then Delete my data, as Material 3 list items with leading icons.
5. **The real map knows the spot.** `MapScreen` takes the cell saved at first run or in Settings when the source does not report one.

## Alternatives
1. **Keep location out of first run (ADR 0030).** Rejected by the human; "Not now" keeps the first look unblocked.
2. **Fine location for a precise dot.** Rejected: privacy steering and ADR 0037; the dot marks the centre of the user's cell, never a position.
3. **A Google Maps basemap under the hexes.** Rejected: an API key, a paid service past the free tier, and tile requests to another origin (ADR 0022).

## Consequences
- The first-run property UX8 ("no permission other than notifications") is replaced by MD4 ("only coarse location and notifications, location optional, cell only").
- Compose screens are not screenshot-tested here (no emulator in the cloud session, ADR 0048 alternative 5); they are checked on a device in the Kiro IDE pass.
