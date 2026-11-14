# Requirements: home-watch

Status: APPROVED by delegation on 2026-11-14. Design in `design.md`, tasks in `tasks.md`.

## Introduction

Home Watch lets a person see, from anywhere, whether power is on at home. A spare phone sits charging at home in Station mode. The person's main phone shows "Home: power on since 2:14 p.m." and gets a push when it changes. Setting it up installs the app on a second phone, so each Home Watch brings an install with it.

The station's state is the power state of that one plug. It is not an area outage decision.

## Glossary

- **Station**: a phone in Station mode (`station-mode`).
- **Viewer**: a phone that watches a station.
- **Offer**: a pairing code created on a station, valid for a short time.
- **Pair**: a stored link between one station and one viewer.
- **Station state**: `ON`, `OFF` or `OFFLINE`, with a "since" time.
- **Silence limit**: 30 minutes without any message from the station.

## Requirements

### R1 Pairing
**User story:** As someone with a spare phone, I want to link it to my main phone in under a minute.
1. WHEN Station mode is on and the user taps "Pair with my phone", THE station app SHALL ask the Worker for an offer and show a short code and, where QR libraries are approved, a QR code of the same code.
2. THE offer SHALL be valid for 10 minutes and for one successful claim.
3. THE code SHALL be 10 characters from an alphabet without look-alike characters.
4. WHEN a viewer enters or scans the code, THE viewer app SHALL claim the offer with its install token and push token.
5. IF a claim fails 5 times for one offer, THEN THE Worker SHALL burn the offer.
6. THE Worker SHALL limit offers and claims per install with the ingest rate limit.
7. THE QR payload and the code SHALL NOT carry the station's location other than the cell the viewer needs, and SHALL carry no install ID.
8. THE pairing SHALL work with code entry alone, with no camera and no new dependency.
9. THE station SHALL allow up to 5 viewers.
10. EITHER side SHALL be able to remove a pair. THE Worker SHALL delete the pair and the stored push token.

### R2 Station state
1. THE Worker SHALL derive the station state from the station's own events: `UNPLUG` starts `OFF` at its event time; `REPLUG` or `ARMED` on a detection plug after `OFF` starts `ON` at its event time.
2. WHILE the station is `ON` and armed, heartbeats SHALL keep it `ON` and SHALL NOT change its "since".
3. WHILE the station is `OFF` and still reachable, a heartbeat on battery SHALL keep it `OFF` and SHALL NOT change its "since".
4. WHEN no message has arrived from the station for 30 minutes, THE Worker SHALL report `OFFLINE`, with the last known state and its "since".
5. THE system SHALL NOT show "Power off" because of silence alone.
6. WHEN events arrive late, THE Worker SHALL recompute the station state from the stored station events in event-time order.
7. THE station state SHALL be the same for any order and batching of the station's events.
8. THE station state SHALL NOT use the area outage decisions.

### R3 Heartbeat on battery
1. WHILE the station is in Station mode and not on a detection plug, THE Sensor SHALL send a heartbeat as a `DISARMED` event with reason `HEARTBEAT_ON_BATTERY` every heartbeat interval. (Amends `station-mode` R5.5.)
2. THE `DISARMED` heartbeat SHALL NOT change armed intervals in the detection engine and SHALL NOT be counted as a gap.
3. THE Worker SHALL treat `HEARTBEAT_ON_BATTERY` as proof of life only.

### R4 Viewer display
1. THE viewer app SHALL show, for each paired station: a name the viewer chose, the state, and the "since" time in the viewer's local time.
2. THE wording SHALL be: "Home: power on since 2:14 p.m.", "Home: power off since 2:14 p.m.", or "Station offline" with "Last known: power on since 2:14 p.m.".
3. THE viewer app SHALL refresh the state when it opens and on a push.
4. THE viewer app SHALL cache the last state and show it with its age when offline.
5. THE state SHALL not show the station's cell, address or any map.

### R5 Pushes
1. WHEN the station state changes to `OFF` or `ON`, THE Worker SHALL send a push to each viewer within 60 seconds of the event reaching the server.
2. WHEN the state changes to `OFFLINE`, THE Worker SHALL send a push to each viewer on the silent channel.
3. THE push text SHALL use the viewer's chosen station name and the "since" time and SHALL follow `copy.md`.
4. THE Worker SHALL send each state change to each viewer at most once.
5. THE push SHALL respect the viewer's quiet hours by using the silent channel.
6. WHEN the event time is more than 10 minutes before the server receives it, THE Worker SHALL NOT push `ON` or `OFF`, since the news is old. THE state SHALL still update.
7. THE push SHALL be high priority for `OFF` and `ON`.

### R6 Offline detection
1. THE Worker SHALL set a wake time for the earliest moment a paired station could pass the silence limit, and SHALL re-arm it only when it fires and the station has been heard since.
2. WHEN the wake time arrives and the station is silent, THE Worker SHALL set `OFFLINE`.
3. THE wake time SHALL share the area actor's single alarm with the other timers.

### R7 Privacy and data
1. THE Worker SHALL store per pair: pair ID, station install ID, viewer install ID, viewer push token, viewer quiet window, station name chosen by the viewer, creation time.
2. THE Worker SHALL store per offer: a hash of the code, station install ID, expiry, failed attempts.
3. THE Worker SHALL store the last-known station state and last-seen time for paired stations only.
4. WHEN delete-my-data is called by a station or a viewer, THE Worker SHALL remove its pairs and offers.
5. THE system SHALL NOT let a viewer see anything about the station except its state and "since" time.
6. THE station name SHALL be stored on the Worker only when the viewer chooses to sync it; by default it stays on the viewer phone.

### R8 Budget
1. THE Worker SHALL write the last-seen time of a paired station at most every 10 minutes.
2. THE Worker SHALL write the station state when it changes.
3. THE number of pushes SHALL follow state changes, not heartbeats.

### R9 Onboarding link
1. THE app SHALL offer "Set up a spare phone" in onboarding, which installs a station and shows the pairing code.
2. THE viewer flow SHALL be offered on the main phone after the first outage log entry or from settings.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | A station on battery sends no heartbeat, so silence would look like "offline" during exactly the outage the user cares about. | R3 sends a battery heartbeat. |
| G2 | If the home router is off in a blackout, the station cannot upload until it reconnects, so the viewer sees "Station offline", not "Power off". | R2.4, R2.5 keep that honest. R2.6 fixes the history on reconnection. Design notes that a SIM with mobile data makes the station useful during blackouts. |
| G3 | The brief gives no pairing security. | R1.2 to R1.7. |
| G4 | QR needs libraries and a camera, and spare phones often have broken cameras. | R1.8 makes code entry the base path. |
| G5 | Silence detection needs a timer on the server, and Durable Objects have one alarm. | R6.3. |
| G6 | 60 seconds from "event reaches server" needs a direct send path. | R5.1. |
| G7 | A human unplugging the station looks like a power cut. | R4.2 wording says "power off" for the station's plug; the field test checks how often. |
| G8 | Old events could trigger old pushes. | R5.6. |
| G9 | A heartbeat every 10 minutes could burn the row budget. | R8. |
| G10 | Deleting data from either side. | R1.10, R7.4. |

## Decisions (2026-11-14)

| Item | Value |
|---|---|
| Offer lifetime | 10 minutes |
| Code length | 10 characters, base32 without 0, 1, I, L, O, U (30 symbols) |
| Failed claims before burn | 5 |
| Viewers per station | 5 |
| Silence limit | 30 minutes (from the brief) |
| Last-seen write interval | 10 minutes |
| Push on `OFFLINE` | yes, silent channel |

- Pairing stores new data: viewer-to-station links and push tokens. This is a stored-data change; ADR 0009 records it and the human should confirm.
- QR display and scan libraries (`react-native-qrcode-svg`, `react-native-svg`, `expo-camera`) are blocked until the human approves. Code entry works without them.
