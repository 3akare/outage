# Requirements: demo-mode

Status: APPROVED by delegation on 2026-11-14. Design in `design.md`, tasks in `tasks.md`.

## Introduction

Judge mode lets a judge see Outage work in under a minute with no setup. It starts from the first screen of the app and from the web page. It replays a recorded outage, and when a judge unplugs their own phone it adds labeled simulated neighbors so the judge sees the area go to "Confirmed" on their own device. The frames shown are produced at build time by the real detection engine with the real thresholds; the phone does not run the engine.

Everything in Judge mode is labeled as simulated, and none of it can enter real history or statistics.

## Glossary

- **Judge mode**: the demo experience in the app and on the web.
- **Replay**: the recorded outage played back from a fixture.
- **Simulated neighbor**: a labeled fake phone created for the demo.
- **Demo session**: one run of Judge mode, in memory only.
- **Unplug track**: the part of the replay file that holds the simulated neighbors' drops and replugs, as offsets from the judge's own unplug, with engine decisions per frame.
- **Fixture**: a sanitized recording of an outage in the shared fixture format.

## Requirements

### R1 Entry
**User story:** As a judge, I want to start with one tap and nothing to set up.
1. THE app SHALL show "Try Judge mode" on its first screen.
2. WHEN the user taps it, THE app SHALL open Judge mode within 2 seconds without registration, consent, permissions or network.
3. THE web page SHALL offer Judge mode from its first screen (`web-and-area-pages` R6).
4. THE user SHALL be able to leave Judge mode at any time and keep everything outside it unchanged.

### R2 Labeling
1. EVERY Judge mode screen SHALL show "Simulated replay" or "Simulated" in a banner that cannot be hidden.
2. EVERY simulated object (event, phone, decision, frame) SHALL carry `simulated: true`.
3. THE app SHALL show each simulated neighbor as "Simulated neighbor N".
4. THE replay screen SHALL state how many real devices recorded the outage, or that the recording is synthetic, as given by the fixture.
5. THE app SHALL never present a demo status as the status of the user's real area.

### R3 Recorded replay
1. THE app SHALL play the same replay file as the web page.
2. THE replay SHALL work offline.
3. THE controls SHALL be play, pause, restart and speed.
4. THE screen SHALL show, per step, the state (Normal, Possible, Confirmed, Restored), the drops and armed phones, the baseline, the probability and the thresholds.
5. THE replay SHALL include one "Your spot only" frame.

### R4 Unplug your own phone
**User story:** As a judge, I want to pull my own charger and see the area react.
1. WHILE Judge mode is open and the phone is charging on a detection plug, THE app SHALL show "Unplug your charger".
2. WHEN the judge unplugs, THE app SHALL detect it within 1 second from the phone's battery state, using a foreground observer and no sensor job.
3. THE app SHALL then play the unplug track from the replay file, in which most simulated neighbors drop within 2 seconds of the judge's drop, with jitter fixed in the file.
4. THE unplug track SHALL be produced at build time by the real detection engine, with its default parameters, on the judge's drop and the simulated drops. THE app SHALL NOT run the engine.
5. THE app SHALL show "Confirmed" on the judge's own device within 5 seconds of the unplug, and show the engine's explanation stored in the track.
6. THE track SHALL use a number of simulated neighbors and droppers that pass the engine's thresholds as they are. THE build SHALL NOT change thresholds, bypass the engine or hard-code a decision.
7. WHEN the judge plugs back in, THE app SHALL play the track's replug frames, in which the simulated neighbors replug within the restore window, and show "Restored".
8. WHEN the judge answered "Yes, wake me when it's back" in the demo prompt, THE app SHALL ring the real Light Alarm sound path on the judge's replug, labeled "Demo".
9. IF the phone cannot be charging (for example an emulator), THEN THE app SHALL offer "Simulate unplug" buttons that behave the same and are labeled simulated.

### R5 Isolation
**User story:** As the owner of the real data, I want demos to leave no trace in it.
1. THE demo session SHALL use its own in-memory playback state and SHALL read only the replay file.
2. THE demo session SHALL NOT write to the Outbox, the power-log, the labels, the subscriptions, the install record, or any server.
3. THE demo session SHALL NOT call the Worker except to fetch static replay data when online.
4. WHEN Judge mode closes, THE app SHALL discard the demo state.
5. WHILE a demo session is open, THE Sensor SHALL suppress the "Power just went?" prompt for real events so the judge sees only the demo prompt. Real events SHALL still be recorded as usual.
6. THE judge's real unplug MAY be recorded as a real event by an armed Sensor; a single real unplug never alerts (P1).

### R6 Fixture and sanitizing
1. THE fixture format SHALL be shared with `tools/sim` and the detection golden tests.
2. THE sanitizer SHALL replace install IDs with aliases, replace times with offsets from the first event, and replace each cell with its res-7 parent.
3. THE sanitized fixture SHALL contain no install ID, absolute date or res-8 cell.
4. THE human who owns the recorded phones SHALL approve the fixture before it is committed.
5. UNTIL a field recording exists, THE replay SHALL use a synthetic fixture labeled `SYNTHETIC` and the screens SHALL say so.

### R7 Build and sync
1. THE replay file SHALL be built from a fixture by running the real engine, in the build step of `web-and-area-pages` task 9.
2. THE app SHALL include the replay file as an asset, and the web page SHALL serve the same file with the same hash.
3. THE build SHALL fail if the replay file's decisions, including the unplug track, differ from a fresh engine run.

### R8 Telemetry and privacy
1. THE demo session SHALL send no telemetry.
2. THE demo screens SHALL ask for no permission except, optionally, the notification permission for the demo alarm prompt.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | "Simulated neighbors who drop within 2 s so they see Confirmed" could be a faked result. | R4.4 to R4.6: the real engine produces the track at build time, with the real thresholds and enough simulated phones to pass them. |
| G2 | A judge's real phone may have a real armed Sensor, so the demo could duplicate prompts and events. | R5.5, R5.6. |
| G3 | The sensor job is too slow for an instant demo. | R4.2 uses a foreground battery observer. |
| G4 | A real Lagos recording exposes homes. | R6.2 to R6.4. |
| G5 | No real recording exists until the field test. | R6.5 synthetic until then, labeled. |
| G6 | The app and web replays could drift apart. | R7.2, R7.3. |
| G7 | Simulated and real data must never mix (P9). | R5, plus tests DM3 and DM5. |
| G8 | iPhone judges cannot run the app. | R1.3 and the web replay. |
| G9 | Emulators and judges without a charger. | R4.9. |
| G10 | The phone does not run the engine (ADR 0012), so a live engine in Judge mode is gone. | R4.3 to R4.7 and R5.1 play frames the engine produced at build time; R7.3 checks them. "Phone evaluates the engine in demo mode" removed by ADR 0012. |

## Decisions (2026-11-14)

| Item | Value |
|---|---|
| Simulated neighbors | 9 phones armed with the judge's phone, 6 of them drop (7 drops of 10 armed, which passes the Confirmed rule for n = 10 under the prior in ADR 0005, needing 5) |
| Neighbor drop jitter | uniform 0 to 2,000 ms after the judge's drop, seeded when `tools/sim` builds the track |
| Restore spread | neighbor replugs within 20 seconds of the judge's replug |
| Demo alarm label | "Demo" in the notification text |

- The scenario numbers are chosen to pass the engine, never the other way round. If ADR 0005 values change, task 3 recomputes them, the build regenerates the track, and a test checks the scenario still confirms.
- The sanitizer replaces cells by their res-7 parent. The replay map shows seven-cell groups, not homes.
