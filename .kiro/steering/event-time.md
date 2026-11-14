---
inclusion: fileMatch
fileMatchPattern: ["packages/detection/**", "workers/**", "modules/**"]
---

# Event time

**Event time = server receive time − phone-reported monotonic elapsed time.**

- Phones report `elapsedMs`: monotonic milliseconds since the event (Android `SystemClock.elapsedRealtime()` delta). Never send or trust the phone's wall clock.
- The Worker computes event time on receipt. The detection engine only ever sees event time.
- Reject impossible elapsed values: negative, or older than 7 days.
- (install ID, sequence) is the idempotency key. Duplicates change nothing.
- Offline events queue on disk and send in order. Delivery delay must not change decisions (property P3).
- Late events recompute history but never trigger a push for a decision older than 10 minutes (P12).
