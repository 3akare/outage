# apps/android rules

- Native Kotlin app (ADR 0012). One Gradle module `app`; packages `sensor`, `alarm`, `log`, `net`, `ui`.
- JobScheduler with the charging constraint is the sensor. On job stop, record stop reason, monotonic time, battery % and plug type BEFORE rescheduling.
- Report monotonic elapsed time only. Never the wall clock.
- The phone never runs the detection engine. It builds ingest payloads, keeps the Outbox, rings the Light Alarm and shows status.
- Verify every Android, Kotlin and Gradle API with a docs server (`.kiro/steering/docs-servers.md`). Put the doc URL in a comment.
- No microphone, no accelerometer, no exact location.
- Build and test: `.kiro/scripts/android-sandbox.sh gradle apps/android :app:testDebugUnitTest :app:lintDebug`. CI runs the same on every push.
- A new Gradle dependency or plugin needs the human first (`.kiro/approved-dependencies.json`).
- Checkpoint before any risky change. Use highest reasoning effort.
- Reference: `.kiro/steering/android-background.md` and `.kiro/steering/event-time.md`.
