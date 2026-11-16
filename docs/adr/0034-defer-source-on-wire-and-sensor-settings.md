# ADR 0034: Defer `source` on the wire; sensor switch and battery screen in Settings

Status: ACCEPTED (2026-11-23), under the blanket approval (2026-11-15).

## Context
Station-mode task 1 adds an optional `source` to the shared event type and the Worker's strict ingest schema. That changes the Worker ingest contract and golden fixtures, and the Worker side has no consumer for it yet (area and alerts code would need to read it).

## Decision
Defer station-mode task 1. `source` stays on the phone (ADR 0033). The sensor switch and the battery setup screen are registered under the Settings keys `sensor` and `battery`. The switch state lives in app preferences `sensor_switch`. Battery setup uses `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (a normal permission) and falls back to the system list screen.

## Alternatives
Do task 1 now: touches the Worker schema and fixtures with nothing reading the field. Ask Play-style exemption only through the maker steps: one more tap for the user.

## Consequences
Server cannot tell receiver events from job events until task 1 is done. Play Store policy may question the direct exemption prompt; this app ships as a GitHub APK.
