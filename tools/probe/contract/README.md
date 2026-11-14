# Probe log contract

One format for the phone's upload, the phone's export file, the Worker's export and the analysis input. The JSON
example `sample-export.json` is read by the tests of all three parts (`android`, `worker`, `analyze`), so a change
on one side fails the others.

## Upload (`POST /probe/events`, header `Authorization: Bearer <PROBE_TOKEN>`)

```json
{ "device": { "alias": "tecno-a", "maker": "TECNO", "brand": "TECNO", "androidSdk": 33 },
  "rows": [ { "id": 1, "kind": "SESSION", "monoMs": 1000, "wallMs": 1763100000000, "bootCount": 41, "fields": { "kind": "start" } } ] }
```

- `alias`: lower-case letters, digits and `-`, 1 to 32 characters. Typed by the tester. Never a name or number.
- `maker`, `brand`: `Build.MANUFACTURER`, `Build.BRAND`, at most 40 characters. No model, no serial, no identifier.
- `rows`: at most 500 per request. `id` is the phone's own row number (increasing). The Worker keeps one copy per `(alias, id)`, so a retried upload is harmless.

## Export (`GET /probe/export`, and the phone's "Export file")

```json
{ "version": 1, "devices": [ { "device": { ... }, "rows": [ ... ] } ] }
```

## Row

| Field | Meaning |
|---|---|
| `id` | Row number on the phone, strictly increasing |
| `kind` | `JOB_START`, `JOB_STOP`, `PLUG`, `BATTERY`, `NOTE`, `ALARM_TEST`, `SESSION`, `UPLOAD` |
| `monoMs` | `SystemClock.elapsedRealtime()`. Comparable only within one `bootCount` |
| `wallMs` | `System.currentTimeMillis()`. For people reading the log only |
| `bootCount` | `Settings.Global.BOOT_COUNT`, or -1 if unreadable |
| `fields` | Flat object of strings, numbers, booleans or null, at most 2,000 characters as JSON |

Fields by kind (all optional unless stated):

| Kind | Fields |
|---|---|
| `JOB_START` | `jobId`, `charging`, `plug`, `batteryPct`, `batteryStatus`, `bucket`, `exempt`, `isInteractive`, `expedited` |
| `JOB_STOP` | as `JOB_START`, plus `stopReason` (int or null below API 31), `stopReasonName`, `stickyPlug`, `stickyPct`, `bmCharging`, `bmPct`, `mismatch` (M14) |
| `PLUG` | `source` (`RECEIVER`), `action` (`CONNECTED` or `DISCONNECTED`), `plug`, `plugAfter1s`, `charging`, `batteryPct` |
| `BATTERY` | `source` (`RECEIVER` or `JOB_RECHECK`), `plug`, `charging`, `batteryPct`, `recheckOf` (row id of the `JOB_STOP` it re-reads one second later) |
| `NOTE` | `text` exactly as typed. Forms: `cond: <label>`, `setting: ...`, `step: ...`, `problem: ...` |
| `ALARM_TEST` | `phase` (`ARMED`, `RANG`, `NO_AUDIO`, `STOPPED`), `delayMs` (replug to audio start), `error` |
| `SESSION` | `kind` (`start`, `restart`, `sensor_on`, `sensor_off`, `reference_on`, `reference_off`, `expedited`, `exemption`, `export`), `ok`, `error`, `fullScreen`, `exempt`, `maker`, `brand`, `androidSdk` |
| `UPLOAD` | `ok`, `status`, `rows`, `durationMs`, `network` (`WIFI`, `CELLULAR`, `OTHER`, `NONE`) |

`plug` values: `AC`, `USB`, `WIRELESS`, `DOCK`, `NONE`, `UNKNOWN`. `charging` is true when the phone reports a plug other than `NONE`.

`SESSION kind=restart` means the app process started again while the sensor was meant to be on. The analysis counts the time since the previous row as not armed (design section 7).
