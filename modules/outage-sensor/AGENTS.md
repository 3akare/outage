# modules/outage-sensor rules

- Kotlin Expo Module. JobScheduler with the charging constraint is the sensor.
- On job stop, record stop reason, monotonic time, battery % and plug type BEFORE rescheduling.
- Report monotonic elapsed time only. Never the wall clock.
- Verify every Android and Expo Modules API with a docs MCP server. Put the doc URL in a comment.
- No microphone, no accelerometer, no exact location.
- Checkpoint before any risky change. Use highest reasoning effort.
- Reference: `.kiro/steering/android-background.md` and `.kiro/steering/event-time.md`.
