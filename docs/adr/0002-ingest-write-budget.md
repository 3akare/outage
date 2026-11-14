# ADR 0002: Staying inside the free-tier write budget

Status: ACCEPTED (2026-11-14).

## Context
Cloudflare Workers Free allows 100,000 Worker requests, 100,000 Durable Object requests and 100,000 SQLite rows written per day, shared by all users (https://developers.cloudflare.com/durable-objects/platform/pricing/). The Sensor emits `ARMED` and `DISARMED` events for every job timeout and restart, which could be hundreds per phone per day. Detection events (`UNPLUG`, `BATTERY_FULL`, `REPLUG`) are rare and are the ones that matter.

## Decision
- Detection events are written through, one row each, and uploaded immediately.
- State events are not stored as rows. Each cell actor keeps armed state per install in memory and flushes changes at most every 60 s, skipping the write when nothing changed.
- State events are uploaded only with the next detection event or after a 15-minute maximum wait.
- When the daily row counter passes 80% of the limit, state events are dropped first.

## Alternatives
1. **Store every event as a row.** Simplest and fully auditable. Fails the budget at roughly 100 to 300 phones, sooner if gaps are frequent.
2. **Sensor-side coalescing of short gaps.** Cuts traffic at the source, but changes the sensor event semantics and needs a gap threshold. Deferred; revisit with probe data.
3. **Paid plan.** Violates the zero-budget rule.
4. **Workers KV or D1 for state.** Adds services and their own limits. Rejected for now.

## Consequences
- State events are not an audit log. Armed time analysis uses the phone's local telemetry (`field-telemetry`), not server rows.
- A lost in-memory state counts a sensor as unarmed until its next `ARMED`. This lowers n, which makes confirming harder. It never causes a false alarm.
- The 15-minute maximum wait is a tunable. The area-cells spec must expire armed state using `last_seen_ms`.
