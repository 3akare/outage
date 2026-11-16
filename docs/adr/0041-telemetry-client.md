# ADR 0041: Phone side of field telemetry

Status: accepted (human blanket approval 2026-11-15). Spec: field-telemetry task 4 (R1, R2).

## Context
The Worker side (`POST /v1/telemetry`, strict `DeviceDay` schema, actor, admin read) exists. The phone needs to build one aggregate per local day and upload it only when the user opted in. The onboarding screens are being rewritten by another agent, so the phone must not depend on how they store the answer.

## Decision
- **Consent** is the interface `TelemetryConsent { enabled() }`. `PrefsTelemetryConsent` backs it with the preference `telemetry_prefs` / `share_diagnostics` (default false) and has `set(on)`. The Settings row "Share anonymous diagnostics" (feature key `diagnostics`) reads and writes it. The onboarding diagnostics choice should call `PrefsTelemetryConsent(context).set(...)`; until it does, only Settings turns it on. Delete-my-data resets it to off.
- **Aggregate** (`telemetry/DeviceDay.kt`, pure): charging, armed, gaps by reason with the shared histogram edges, scheduling delay samples by source (newest 64), write failures, standby bucket, battery exemption and stop-reason counts, all from the sensor's own event log and diagnostics. The day boundaries are local midnight, mapped to the monotonic clock with the current wall and elapsed readings; events from an earlier boot have no known time and are left out, so a day that spans a reboot is a lower bound. `replugToRingMs`, `prompts` and `alarms` are zero until the alerts feature records them. `writeFailures` and `stopReasons` are the sensor's running counters, not per-day deltas. Mode shares count all charging as normal until station mode reports itself.
- **Maker** is a family word (`tecno`, `infinix`, `itel`, `samsung`, `xiaomi`, `pixel`, `other`), never a model name (R1.2).
- **Upload** (`TelemetryDriver`): one background thread, first pass 5 minutes after the sensor starts, then every 3 hours. It sends the previous local day once (the closing aggregate, R2.4). It marks the day sent on a 2xx or on a refusal that can never succeed (400, 401, 403, 413), and retries a network failure, 429 or 5xx at the next pass. The Worker answers a repeat as accepted (R3.1), so a crash between send and mark is harmless.
- Nothing runs without a Worker address, a registered install ID and consent.

## Alternatives
- Read the onboarding record's `diagnosticsOptIn` directly: ties telemetry to a record that is being replaced. Rejected for now; `TelemetryConsent` can wrap it later.
- Upload today's partial day as well: breaks "at most one aggregate per device-day". Rejected.
- WorkManager: not approved; a three-hourly check inside the running sensor process is enough because the aggregate comes from that process's boot.

## Consequences
A phone that reboots mid-day under-reports that day. The first report arrives the day after opt-in. The field report generator must treat zero prompts and alarms as "not recorded yet".
