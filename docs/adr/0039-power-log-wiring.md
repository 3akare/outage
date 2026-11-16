# ADR 0039: How the Power Log gets its inputs and feeds Insights

Status: accepted (human blanket approval 2026-11-15). Specs: power-log tasks 8 and 10, app-map-insights task 6.

## Context
The log database (ADR 0043) existed but nothing wrote sensor events into it, "Power is out" had no way to reach the ingest Worker, and Insights read an empty timeline.

## Decision
- **Sensor events into the log.** `Sensor.onCreated` is a hook that `OutageApp.onCreate` sets. Whichever process builds the sensor (app, job, service, boot receiver) first reads the Outbox's pending events into the log, then adds a listener. The log's own key (`E:<seq>`) drops duplicates. Events from an earlier boot (`TimeQuality.LOST`) are skipped: their wall time is unknown. The log stores the phone's wall time (now minus the event's age) for display only; nothing from `outage_log.db` is uploaded.
- **`REPORT` through the Outbox.** `EventType.REPORT` and `DefaultSensorController.recordReport()` append a `REPORT` to the sensor's event store, so it gets a real `seq`, uses the same uploader, retry and delete paths as every event, and carries only `kind: OUT` (ADR 0042). It changes no sensor state and the log ignores it as an event (the tap itself is a `Report` row).
- **Taps.** "Power is out" is limited to one per 10 minutes (setting `last_report_ms`). With the phone on a detection plug it queues the report but starts no `OUT` interval (R7.4). "Power is back" ends the open `OUT` interval and uploads nothing (R7.3).
- **Freezer Guard.** `LogRecorder` calls `FreezerGuard.sync()` after every change, so the alarm follows the timeline (ADR 0038).
- **Insights.** `LogStoreTimeline` feeds `PowerLogInsightsSource`. A build with a Worker address always shows the user's own record. A demo build shows the real record once it has any data and the labelled demo (12 weeks) before that. The tariff band comes from the user's choice (stored in the log settings), not a fixed Band A; with none chosen there is no promise check (R5.6).
- **Entry point.** The Power Log screen is the feature `log`. Home has a card that opens it. The old `log` deep link still opens Insights (ADR 0026).

## Alternatives
- A separate upload queue for reports with its own seq space: could collide with the sensor's `seq` on the server. Rejected.
- Make the sensor depend on the log: breaks the rule that the sensor holds no location and stays free of feature code. Rejected; the hook points the other way.
- Insights from `Stats` days instead of `OUT` intervals: Insights has its own coverage rules (IN1 to IN6). Rejected.

## Consequences
`EventType` gains `REPORT`; the alerts branch adds `LABEL` in the same enum and files (`SensorModel.kt`, `SensorController.kt`, `SensorOutbox.kt`), so the two merges touch neighbouring lines. Insights counts time off the charger or not watched as observed power, so it is an estimate, as the log is. The phone may miss events the process never saw and the Outbox already acked; those become `UNKNOWN`.
