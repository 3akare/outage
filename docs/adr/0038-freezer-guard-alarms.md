# ADR 0038: Freezer Guard uses AlarmManager, inexact by default

Status: SUPERSEDED by ADR 0058 (2026-11-21): Freezer Guard is cut.

Earlier status: accepted (human blanket approval 2026-11-15). Spec: power-log task 7 (R6, design section 6).

## Context
The sensor's job does not run when the phone is unplugged, which is exactly when a freezer alert is needed. The alert must work offline and with the app closed (R6.9). Android 12 and later gate exact alarms behind special app access.

## Decision
- `AlarmManager.setAndAllowWhileIdle` on `ELAPSED_REALTIME_WAKEUP` (monotonic clock, fires in Doze, may be late). The settings screen says so (R6.5).
- Exact alarm only when the user switches on "Alert on time" and `canScheduleExactAlarms()` is true at that moment: `setExactAndAllowWhileIdle`. If the call throws `SecurityException` (access revoked in between) the code falls back to inexact.
- The manifest declares `SCHEDULE_EXACT_ALARM` (granted by the user in "Alarms & reminders", revocable). `USE_EXACT_ALARM` is not declared: it is granted without a prompt but limited to alarm-clock and calendar apps, and Freezer Guard is neither.
- `FreezerGuard.sync()` plans from the rebuilt timeline: one alarm for the open `OUT` interval, cancelled otherwise. It runs after any change to the log and at every process start (alarms are lost at reboot, so the next app start plans again; the screen says so).
- `FreezerReceiver` reads the log database, checks the same `OUT` interval is still open and past the limit, and marks the interval as alerted, so one interval alerts once (PL7). It does not need the app to be open.
- Notification: its own channel `freezer-guard` (high importance), and `freezer-guard-quiet` (low, silent) inside quiet hours unless "Freezer Guard may sound in quiet hours" is on (default off, R6.7).
- Quiet hours for Freezer Guard are stored with its settings (default 22:00 to 07:00, whole hours). The alerts feature has its own quiet window for pushes; the two can be joined later without a data change.
- Settings live in the `setting` table of `outage_log.db`, so delete-my-data clears them.

## Alternatives
- WorkManager: not approved and no exact timing. Rejected.
- Always exact: needs a special permission and costs battery. Rejected.
- `USE_EXACT_ALARM`: Play policy limits it to alarm and calendar apps. Rejected.

## Consequences
The alert may arrive late in Doze or with battery saver. After a reboot nothing fires until Outage is opened or the sensor wakes the app process. Device checks are in `docs/probe-checklist.md` (Freezer Guard section).

Docs: https://developer.android.com/develop/background-work/services/alarms/schedule
