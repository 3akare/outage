# ADR 0004: Station mode observes the plug state directly

Status: ACCEPTED (2026-11-14). Confirm with probe data.

## Context
`sensor-android` classifies a charging-constraint stop at 95% battery or more as `BATTERY_FULL`, not `UNPLUG`. The reason: a full phone can drop the charging constraint while still plugged in. That rule is correct for the Job driver, which only sees the job stop and infers the cause.

A spare phone left plugged in at home sits at 100% almost all the time. With the Job driver alone, a real power cut on that phone looks like `BATTERY_FULL` and is ignored. The "spare-phone stations charge 24/7" part of the pitch would produce no outage signals.

## Decision
In Station mode, a receiver driver watches the power-connected and power-disconnected broadcasts and reads the plug state. A confirmed change from a detection plug to no plug emits `UNPLUG` at any battery level. The Job driver stays as a backup, and the state machine drops duplicate reports.

## Alternatives
1. **Keep only the Job driver.** Simplest. Fails on a full phone. Rejected.
2. **Remove the 95% rule everywhere.** Would create false `UNPLUG` events on normal phones when the job stops at full battery while still plugged. Rejected.
3. **Poll the battery intent on a timer.** No broadcast dependency, but delays detection and wastes battery. Rejected.
4. **Receiver driver only in Station mode, Job as backup (chosen).** Direct observation where it is needed, no change for normal mode.

## Consequences
- In normal mode, a phone at 100% still cannot detect outages. The app should say so and recommend Station mode for spare phones.
- This is a sensor classification change, not a detection threshold change. Detection thresholds (W, k, p, weight) are untouched.
- The probe must show that power broadcasts arrive reliably in Doze with the screen off, and that the plug state matches at broadcast time. If not, add a bounded re-read through a new ADR.
- Events gain a `source` field so the field test can compare restore delay by driver.
