---
inclusion: auto
name: gridwatch-lessons
description: Use when designing onboarding, retention, sensor reliability or the pitch
---

# Resurrection story: GridWatch lessons

Use these facts exactly.

GridWatch (Michigan/Berkeley, 2014) proved phones can detect outages from charge state. In a power-strip test, ten phones' timestamps for the same cut were within about a second in 19 of 20 trials. In Accra in 2018 the phone app (DumsorWatch) reached about 3,400 installs, but active phones fell from 989 to 310 in three months. The team moved to plug-in hardware sensors, which became the company nLine. The "utility undercounted outages by nearly 100%" finding came from those hardware sensors, not phones. **Never claim phones produced it.**

| Why the phone version stalled | Outage's fix |
|---|---|
| Users were paid airtime monthly; late payments likely drove uninstalls | No payments. Useful to one person on day one |
| Phones were reset, flashed, broken or swapped; no reinstall asked | Anonymous install ID, 30-second re-onboarding, Station mode for old phones |
| Supporting Android 4.0 cost heavy engineering | Android 12+ gives the exact stop reason |
| Per-phone filters (accelerometer, mic hum) were noisy and needed scary permissions | No mic. Cross-phone timing statistics decide |
| Deployment state lived in spreadsheets | One Durable Object per area cell holds live state |
| Mostly night-time charging coverage | Spare-phone stations charge 24/7 |

The human checks every factual claim in public text before submission.
