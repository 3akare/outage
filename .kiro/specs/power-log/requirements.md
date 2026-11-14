# Requirements: power-log

Status: APPROVED by delegation on 2026-11-14. Design in `design.md`, tasks in `tasks.md`.

## Introduction

Power Log is the single-player value of Outage. It keeps a private timeline of power at the user's spot on the phone, and turns it into daily hours of power, a count of outages, the longest outage, a monthly Light Score, a comparison with the user's tariff band, a Freezer Guard alert, and a share card with no location.

Everything here works from one phone. The server is optional and only adds area outage information.

## Glossary

- **Spot**: the user's chosen place, stored as an H3 cell.
- **Power interval**: a span of time with a state. States: `ON` (phone on a detection plug), `OUT` (an outage at the spot), `OFF_CHARGER` (unplugged and no outage evidence), `UNKNOWN` (no data).
- **Outage at the spot**: an interval that starts at an `UNPLUG` with outage evidence and ends at restore evidence (see R2).
- **Outage evidence**: a "Yes" label, or an open `POSSIBLE` or `CONFIRMED` area outage for the spot at the last sync, or a manual "power is out" report.
- **Coverage**: the share of a day that is `ON` or `OUT`.
- **Hours of power (estimate)**: 24 hours minus outage hours, for a day with enough coverage.
- **Light Score**: the month's average of hours of power as a percentage of 24 hours, over days with enough coverage.
- **Tariff band**: the user's chosen supply band with a promised minimum of hours per day.
- **Freezer Guard**: an alert when an outage at the spot lasts past the user's limit.

## Requirements

### R1 Local timeline
**User story:** As a user, I want a record of my power that does not depend on any server.
1. THE app SHALL store the timeline in a database on the phone, built from the Sensor's events, the user's answers and manual reports.
2. THE timeline SHALL record each interval with a start, an end (or open), a state, and the source of the evidence.
3. THE timeline SHALL use the phone's wall clock only to show times to its own user. It SHALL NOT upload these times.
4. THE app SHALL keep the timeline for at least 400 days.
5. THE timeline SHALL work with no network.
6. WHEN delete-my-data is requested, THE app SHALL erase the timeline.

### R2 Deciding an outage at the spot
1. WHEN an `UNPLUG` arrives and the user answers "Yes", THE app SHALL start an `OUT` interval at the unplug.
2. WHEN an `UNPLUG` arrives with no answer, THE app SHALL start an `OFF_CHARGER` interval.
3. WHEN the app learns of an open `POSSIBLE` or `CONFIRMED` area outage that overlaps an `OFF_CHARGER` interval, THE app SHALL change that interval to `OUT`.
4. WHEN the user answers "No", THE app SHALL keep the interval as `OFF_CHARGER`.
5. THE `OUT` interval SHALL end at the earliest of: the area outage's restore time, a manual "Power is back" tap, or the `REPLUG`.
6. IF the phone's next `REPLUG` is more than 12 hours after the start and no other evidence exists, THEN THE app SHALL end the interval at the `REPLUG` and mark its end `UNSURE`.
7. WHEN the phone is on a detection plug, THE app SHALL record `ON`.
8. THE app SHALL record `UNKNOWN` for spans with no data (phone off, sensor disarmed).

### R3 Daily statistics
1. FOR each local day, THE app SHALL compute outage hours, outage count, longest outage, coverage, and hours of power (estimate).
2. THE app SHALL show hours of power only for days with coverage of at least 50%.
3. THE app SHALL always show coverage next to hours of power.
4. THE app SHALL label hours of power as an estimate.
5. THE day boundary SHALL be local midnight at the spot's time zone offset on the phone.
6. THE statistics SHALL be a pure function of the timeline, so they can be recomputed.

### R4 Light Score
1. THE app SHALL compute the Light Score for each calendar month as the average of hours of power over qualifying days, as a percentage of 24 hours, rounded to a whole number.
2. THE app SHALL show the number of qualifying days with the score.
3. IF a month has fewer than 7 qualifying days, THEN THE app SHALL show "Not enough days yet" and no score.

### R5 Supply promise check
1. THE app SHALL let the user pick a tariff band from a configured list.
2. THE app SHALL compare the user's hours of power per day with the band's promised minimum and show the days and the month's average below the promise.
3. THE comparison SHALL be labeled as an estimate from the phone's own record.
4. THE app SHALL NOT state or imply that the user is owed compensation, a refund or a legal claim.
5. THE band list SHALL live in a config file with its sources and a "last checked" date.
6. THE app SHALL NOT assume any band when the user has not chosen one.

### R6 Freezer Guard
**User story:** As someone with a freezer, I want an alert when the power has been off too long.
1. THE user SHALL be able to turn on Freezer Guard and set a limit in whole hours from 1 to 24.
2. WHEN an `OUT` interval starts and Freezer Guard is on, THE app SHALL schedule an alert for the limit.
3. WHEN the limit is reached and the interval is still open, THE app SHALL show the alert.
4. WHEN the interval ends first, THE app SHALL cancel the alert.
5. THE alert SHALL use an inexact alarm, and THE app SHALL tell the user it can arrive later than the limit when the phone is saving battery.
6. WHERE the user has granted exact-alarm access, THE app MAY use an exact alarm.
7. THE alert SHALL respect quiet hours, unless the user turns on "Freezer Guard may sound in quiet hours" (default off).
8. THE alert SHALL NOT start for an `OFF_CHARGER` interval.
9. THE Freezer Guard SHALL work offline and with the app closed.

### R7 Manual reports
1. THE app SHALL offer "Power is out" and "Power is back" taps.
2. WHEN the user taps "Power is back", THE app SHALL end the open `OUT` interval at that moment and cancel Freezer Guard.
3. "Power is back" SHALL stay on the phone and SHALL NOT be uploaded.
4. WHEN the user taps "Power is out", THE app SHALL start an `OUT` interval if the phone is not on a detection plug, and SHALL queue a `REPORT` event of kind `OUT` for the ingest Worker.
5. THE `REPORT` event SHALL follow the ingest strict schema, and the area actor SHALL count distinct reporters for the manual-report hint (area-cells R8).
6. THE app SHALL limit "Power is out" to one report per 10 minutes.

### R8 Share card
1. THE app SHALL produce a monthly share card with the Light Score, hours of power, outage count and the app link.
2. THE card SHALL NOT contain a location, area name, install ID or the user's name.
3. THE card SHALL say "estimate" and the number of days it covers.
4. WHERE image sharing is not built, THE app SHALL share the same facts as text.

### R9 Area outage sync
1. WHEN the phone is online, THE app SHALL fetch public outages for the spot's cell from the Worker, for the last 30 days.
2. IF the spot has no public status, THEN THE app SHALL use no area information.
3. THE sync SHALL send no personal data beyond the cell.
4. THE app SHALL cache the result and work from the cache when offline.

### R10 Display
1. THE app SHALL show: now (power on since, or out since), today, the last 30 days, the month's Light Score and the open outage.
2. THE text SHALL follow `copy.md`: plain words, "power", optional Pidgin.
3. THE app SHALL NOT show another person's data.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | A human unplug and an outage both look like an `UNPLUG`. | R2 uses "Yes" labels and area evidence; unlabeled unplugs stay `OFF_CHARGER`. |
| G2 | The phone cannot see power while the user carries it unplugged, so "hours of power" could be invented. | R3.2 and R3.3 show coverage and hide low-coverage days. |
| G3 | Wall-clock use on the phone conflicts with `event-time.md`. | R1.3 limits it to the user's own display and never uploads it. |
| G4 | Freezer Guard needs a timer while the phone is unplugged; the sensor job does not run then. | R6.5, R6.9 use an inexact alarm; design uses `setAndAllowWhileIdle`. |
| G5 | Freezer Guard could fire for every human unplug. | R6.8, R6.2 (only `OUT`). |
| G6 | Tariff promises vary by source and change. | R5.5. |
| G7 | "Never promise compensation." | R5.4. |
| G8 | Image sharing may need human approval. | R8.4. |
| G9 | The brief mentions a "Power is back" tap and manual reports without a spec. | R7. |
| G10 | Inverters and switched-off sockets hide restores. | R2.5, R2.6, R7.2. |
| G11 | Light Score needs a defined number of days. | R4.3. |

## Decisions (2026-11-14)

| Item | Value |
|---|---|
| Minimum coverage to count a day | 50% |
| Minimum qualifying days for a score | 7 |
| Freezer limit range | 1 to 24 hours, whole hours |
| Manual "out" report limit | one per 10 minutes |
| Timeline retention | 400 days |
| Band list | A 20 h, B 16 h, C 12 h, D 8 h, E 4 h minimum per day, from public Nigerian reports (https://www.icirnigeria.org/explainer-here-is-why-there-is-improvement-in-power-supply/ and others). Secondary sources; the human verifies against NERC before release. |

- `REPORT` events amend the sensor and ingest schemas (task 1). Only kind `OUT` is uploaded.
- The image share card is blocked until the human decides how it is built (a platform `Canvas` bitmap and `FileProvider` need no new library but are unverified); the text share needs none.
