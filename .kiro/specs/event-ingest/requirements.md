# Requirements: event-ingest

Status: APPROVED by delegation on 2026-11-14 (human: "make the right decisions"). Design in `design.md`, tasks in `tasks.md`.

## Introduction

Event-ingest moves sensor events from the phone to the Cloudflare Worker and hands valid, de-duplicated events with a trustworthy event time to the area cell. It has two halves: a client uploader in the app (Kotlin), and the Worker ingest endpoint plus its cell Durable Objects.

It does not decide whether an outage happened. That belongs to `detection-engine`.

## Glossary

- **Uploader**: the Kotlin client in the app that drains the Sensor Outbox to the Worker.
- **Ingest API**: the Worker endpoints `POST /v1/register` and `POST /v1/events`.
- **Cell actor**: the Durable Object for one H3 res-8 cell.
- **Install token**: an HMAC token issued at registration, proving an install ID was minted by the server.
- **Event time**: receive time minus `elapsedMs`. See `event-time.md`.
- **Receive time**: the Worker's clock when the request arrived. One value per request.
- **Detection event**: `UNPLUG`, `BATTERY_FULL`, `REPLUG`. **State event**: `ARMED`, `DISARMED`.

## Requirements

### R1 Event schema and strict validation
**User story:** As a maintainer, I want one strict schema, so that no stray personal or clock data gets in.
1. THE Ingest API SHALL accept events with exactly these fields: `installId`, `seq`, `type`, `elapsedMs`, `cell`, `confidence`, `timeQuality`, and optionally `stopReason`, `reason`, `schedulingDelayMs`, `batteryPct`, `plugType`.
2. IF an event contains any other field, THEN THE Ingest API SHALL reject that event with code `UNKNOWN_FIELD`.
3. IF `cell` is not a valid H3 index at resolution 8, THEN THE Ingest API SHALL reject the event with code `BAD_CELL`.
4. THE schema SHALL live once in `packages/shared`, and contract fixtures in `packages/shared/fixtures/` SHALL cover it. The Worker tests (Vitest) and the app tests (JUnit) SHALL both read those fixtures.
5. THE Ingest API SHALL NOT accept any wall-clock timestamp from the phone.

### R2 Registration and install token
**User story:** As an operator, I want installs proven to be server-issued, so that a stranger cannot cheaply fake a crowd.
1. WHEN the app first starts, THE Uploader SHALL call `POST /v1/register` and store the returned install ID and install token on the phone.
2. THE Ingest API SHALL mint the install ID randomly and sign it with HMAC-SHA-256 using a Wrangler secret, and SHALL NOT store anything about the registration.
3. IF an events request has a missing or invalid token for its install ID, THEN THE Ingest API SHALL reject the whole request with HTTP 401.
4. THE Ingest API SHALL NOT log or store IP addresses, user agents or any other request identifiers.
5. WHERE the registration endpoint is called more often than a configured per-source budget, THE Ingest API SHALL answer HTTP 429.
6. THE secret SHALL be set with `wrangler secret put` and SHALL NOT appear in the repo.

### R3 Event time
**User story:** As the detection engine, I want event time that does not depend on any phone clock.
1. WHEN a request is received, THE Ingest API SHALL take one receive time from the Worker clock for the whole request.
2. THE Ingest API SHALL compute each event's event time as receive time minus `elapsedMs`.
3. THE Ingest API SHALL pass event time to the cell actor and SHALL NOT pass `elapsedMs` onward.

### R4 Elapsed validation
1. IF `elapsedMs` is negative, not an integer, or older than 7 days, THEN THE Ingest API SHALL reject that event with code `BAD_ELAPSED`.
2. WHEN `elapsedMs` is exactly 0 or exactly 7 days, THE Ingest API SHALL accept it.
3. THE Ingest API SHALL reject an event whose `timeQuality` is not `OK` with code `TIME_LOST`.

### R5 Idempotency
**User story:** As the detection engine, I want retried uploads to change nothing.
1. THE Ingest API SHALL treat (install ID, seq) as an idempotency key within a cell.
2. WHEN an event with an already-seen key arrives, THE Ingest API SHALL answer `duplicate`, store nothing, and notify the engine of nothing.
3. WHEN the same events arrive in a different order or in different batches, THE Ingest API SHALL end with the same stored state.
4. THE Ingest API SHALL bound the idempotency memory per install and per cell. IF an event's seq is below the retained window, THEN THE Ingest API SHALL answer `duplicate`, since the Uploader sends in order and an old seq was already handled.

### R6 Rate limit
1. THE Ingest API SHALL rate-limit per install ID with a token bucket (starting values in `design.md`).
2. IF an install exceeds its bucket, THEN THE Ingest API SHALL reject the excess events with code `RATE_LIMITED` and HTTP 429 with a retry-after hint.
3. THE rate limit SHALL NOT drop a detection event while state events are being limited. WHERE the bucket is short, state events SHALL be dropped before detection events.

### R7 Routing and handoff
1. THE Ingest API SHALL route each event to the area actor named by the res-7 parent of the event's own `cell`, so that a retried event always reaches the same actor. (AMENDED 2026-11-14 by `area-cells`: before this, routing was by the res-8 cell. Everywhere this spec says "cell actor" read "area actor".)
2. WHEN a batch contains several parents, THE Ingest API SHALL make one actor call per parent.
3. WHEN the cell actor accepts a detection event, THE cell actor SHALL pass it to the detection engine through a `DetectionPort` interface with its event time and the receive time.
4. THE Ingest API SHALL NOT contain detection logic.

### R8 Partial results
**User story:** As the Uploader, I want to know exactly what to resend.
1. THE Ingest API SHALL answer 200 with a result for every event: `accepted`, `duplicate` or `rejected` with a code.
2. WHEN one event in a batch is invalid, THE Ingest API SHALL still process the others.
3. THE Ingest API SHALL classify rejection codes as permanent (`UNKNOWN_FIELD`, `BAD_CELL`, `BAD_ELAPSED`, `TIME_LOST`, `SIMULATED_REJECTED`) or transient (`RATE_LIMITED`, `UNAVAILABLE`).
4. IF the whole request is malformed JSON or over the size limit, THEN THE Ingest API SHALL answer HTTP 400 or 413 with no per-event results.

### R9 Client upload policy
**User story:** As a user, I want alarms and alerts fast, and the free tier to last.
1. WHEN a detection event is written to the Outbox, THE Uploader SHALL upload immediately when a network is available.
2. WHEN only state events are waiting, THE Uploader SHALL upload them together with the next detection event or after a configured maximum wait, whichever comes first.
3. THE Uploader SHALL send events in seq order and SHALL batch up to the batch limit.
4. WHEN the network is unavailable, THE Uploader SHALL leave events in the Outbox and retry with exponential back-off and jitter.
5. WHEN the server answers `accepted`, `duplicate` or a permanent rejection, THE Uploader SHALL acknowledge those events to the Sensor. It SHALL NOT acknowledge events with a transient result or a failed request.
6. THE Uploader SHALL compute `elapsedMs` for the whole batch at send time, so retries after a delay never reuse a stale value.
7. THE Uploader SHALL NOT upload `simulated` events or events with `timeQuality` of `LOST`.

### R10 Excluded events
1. THE Ingest API SHALL reject any event carrying a `simulated` marker with `SIMULATED_REJECTED`. Simulated events never enter real cell state (property P9).
2. THE Ingest API SHALL reject events from a phone that has deleted its data (see R12).

### R11 Free-tier budget
**User story:** As the zero-budget owner, I want the system to degrade safely instead of failing at the daily cap.
1. THE cell actor SHALL store detection events as rows and SHALL keep each install's armed state in memory, writing it behind in a batch.
2. THE cell actor SHALL write the armed state at most once per flush interval and SHALL skip the write when the state is unchanged from what is stored.
3. IF the armed state is lost before a flush, THEN THE system SHALL treat the sensor as unarmed until its next `ARMED`. This is the safe direction, since it lowers the sensor count.
4. THE Ingest API SHALL expose a daily counter of requests and rows written, with no personal data.
5. WHEN the daily write counter passes a configured fraction of the free limit, THE cell actors SHALL drop state events and keep detection events.
6. THE Worker SHALL keep CPU per request low enough for the free plan and SHALL NOT use a schema library.

### R12 Delete my data
1. WHEN `POST /v1/delete` is called with a valid token and a list of cells, THE Ingest API SHALL remove every stored row for that install ID in those cells and in the in-memory state.
2. THE Ingest API SHALL then reject that install ID's token with HTTP 401.
3. THE stored detection history SHALL expire after 30 days regardless of deletion requests.
4. THE detection decisions SHALL contain counts only, never install IDs, so that deleting an install leaves history valid.

### R13 Observability without personal data
1. THE Ingest API SHALL keep counters by result code and by event type.
2. THE counters SHALL NOT include install IDs or cells finer than the city or region label.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web from the brief. Kiro's Analyze Requirements runs in the IDE; run it on this file and record the result here.

| # | Gap found | Fix |
|---|---|---|
| G1 | A stranger can post fake events from many made-up install IDs and fake a Confirmed outage. | R2 server-signed install IDs; ADR 0003. Residual risk remains; see design section 10. |
| G2 | Free plan allows 100,000 rows written and 100,000 DO requests per day. The sensor emits many `ARMED`/`DISARMED` events. | R9.2, R11. ADR 0002. |
| G3 | Brief says "reject impossible elapsed"; the boundary was undefined. | R4. |
| G4 | Idempotency memory could grow without bound. | R5.4. |
| G5 | Reboot events with lost time (sensor spec OQ3). | R4.3, R9.7. |
| G6 | Simulated events must never reach real state (P9). | R10.1, R9.7. |
| G7 | Partial failure inside a batch. | R8. |
| G8 | Retries after a delay would carry an old elapsed value. | R9.6. |
| G9 | Delete-my-data on the server. | R12. |
| G10 | Rate limit could starve detection events. | R6.3. |
| G11 | Extra fields could smuggle location or phone data. | R1.2. |

## Decisions (2026-11-14)

- Install token with HMAC, no stored registration (ADR 0003). Needs the human to run `wrangler secret put INSTALL_TOKEN_SECRET`.
- Armed state is write-behind; detection events are written through (ADR 0002).
- Rate-limit and batch values are tunables in `workers/api/src/config.ts`, not detection thresholds. Starting values are in `design.md`.
- The app (Kotlin) builds the payload: install ID, H3 cell, Outbox and `elapsedMs`. The H3 cell on the phone needs `com.uber:h3`, which needs human approval (ADR 0012).
- No new dependency on the Worker side. H3 helpers come from `packages/shared`, which uses `h3-js` from the approved stack; confirm its API with the docs server first.
