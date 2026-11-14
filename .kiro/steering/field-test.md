---
inclusion: manual
---

# /field-test

Run the `field-report` skill (`.kiro/skills/field-report/SKILL.md`) for one day of field telemetry. Its steps, in short:
1. Per device: armed time / charging time. Flag any device under 90%.
2. Restore delay: p50 and p95. Flag p95 over 60 s.
3. False alarms and misses, from "No, I unplugged it" and "Yes" labels.
4. Any outage seen by 2+ devices: save as a replay fixture candidate.
5. Write `docs/field/YYYY-MM-DD.md`.
6. For each new failure, open a Bugfix Spec in `.kiro/specs/`. No quick patches.
7. Never include exact locations in the report.
