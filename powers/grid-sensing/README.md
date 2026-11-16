# grid-sensing

A Kiro Power (Agent Plugins v1.0.0 format) from the Outage project. It packages three things so another project can reuse them:

| Skill | What it gives |
|---|---|
| `charging-sensor` | The Android pattern that detects mains power loss from charging state: a JobScheduler job whose stop is the signal, the decision table, the phone-at-100% fix (Station mode), the offline alarm, and the device measurements that decide if it is good enough. |
| `blackout-detection` | The Poisson test on simultaneous drops, levels, restore evidence that ignores generators, the 12 properties to test with fast-check, and a tested script (`scripts/poisson.mjs`) that reproduces the numbers. |
| `oem-battery-guide` | Per-maker steps (Tecno, Infinix, itel, Samsung, Xiaomi, Pixel) to stop the OS killing a background sensor, with a validator and a verification protocol. Every entry is unverified until checked on a phone. |

Activation keywords (in `plugin.json`): outage, charging sensor, blackout detection, power cut, grid, JobScheduler, poisson, OEM battery, tecno, infinix, itel.

`mcp.json` adds the Context7 documentation server (`https://mcp.context7.com/mcp`, no secret needed) for library docs.

## Install

Kiro Powers panel, then Add Custom Power, then Import power from a folder (this folder) or from GitHub (the repository URL; the power lives in `powers/grid-sensing`). See https://kiro.dev/docs/powers/create/. Needs Kiro IDE or Kiro CLI v3; Kiro Web does not import powers.

## What is verified and what is not

- The package is checked against the Agent Plugins schema rules by a test in the repository (`.kiro/scripts/test/power.test.mjs`): closed manifest fields, one folder per skill with a matching `name`, `mcp.json` shape, no secrets, and the OEM data and validator identical to the project's copy.
- `scripts/poisson.mjs` has tests with values computed independently, and reproduces the table in ADR 0005 of the project.
- The Android and detection designs are specified and unit-tested on the JVM or in TypeScript where the project has code. Device behavior (armed time, delays, OEM steps, alarm audio) has not been verified on real phones yet. The skills say so.

## Keep it in sync

`skills/oem-battery-guide/references/oem-guide.json` and `scripts/validate-guide.mjs` are copies of the project's `core/shared/src/oem-guide.json` and `.kiro/skills/oem-battery-guide/scripts/validate-guide.mjs`. The test fails if they differ. After changing the source, copy it here:

```
cp core/shared/src/oem-guide.json powers/grid-sensing/skills/oem-battery-guide/references/oem-guide.json
cp .kiro/skills/oem-battery-guide/scripts/validate-guide.mjs powers/grid-sensing/skills/oem-battery-guide/scripts/validate-guide.mjs
```

License: MIT (see the repository `LICENSE`).
