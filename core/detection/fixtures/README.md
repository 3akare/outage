# Golden fixtures

One `*.json` file per recorded real outage, written from a field-test day (`tools/field`). Shape:

```json
{ "name": "yaba-2026-12-01", "input": { "events": [], "labels": [], "context": { "neighbors": [], "manualReports": 0 }, "nowMs": 0 }, "expected": [] }
```

`input` is an `EngineInput` run against `initialState()` with `DEFAULT_PARAMS`. `expected` is the full `decisions` list. The directory has no fixtures until the field test produces one. Large files go in `large/`.
