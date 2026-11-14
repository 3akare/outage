---
inclusion: auto
name: demo-mode
description: Use when working on demo, replay or simulated data
---

# Demo and simulated data

- Simulated data is always labeled, in the data (`simulated: true`) and in the UI ("Simulated replay").
- Simulated events never enter real history, state or statistics (property P9).
- Judge mode opens from the first screen. It replays a real recorded Lagos outage, labeled "Simulated replay", and states the real device count honestly.
- When a judge unplugs their own phone, add labeled simulated neighbors who drop within 2 s so they see Confirmed on their own device.
- Simulator output lives in `tools/sim`. A hook fails any simulated event lacking `simulated: true`.
