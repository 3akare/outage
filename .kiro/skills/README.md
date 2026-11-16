# Agent Skills

Format: Agent Skills standard, one folder per skill with `SKILL.md` (frontmatter `name` and `description`), optional `references/` and `scripts/` (https://kiro.dev/docs/skills/). Skills load on demand by description and appear as slash commands in Kiro IDE, CLI and Web. Custom agents list them as `skill://.kiro/skills/*/SKILL.md` in `resources`.

| Skill | Use it for | Data and code it owns | Tests |
|---|---|---|---|
| `oem-battery-guide` | Exact steps per phone maker (Tecno, Infinix, itel, Samsung, Xiaomi, Pixel) to stop the OS killing Outage | `core/shared/src/oem-guide.json`, `scripts/validate-guide.mjs` | 10 |
| `field-report` | One day of telemetry to `docs/field/YYYY-MM-DD.md`, gates, Bugfix Specs for new failures | `scripts/check-report.mjs`, `scripts/new-bugfix.mjs` | 10 |
| `release-apk` | Tagged Gradle build on GitHub Actions, signed APK check, GitHub release, install page values, smoke test | `scripts/preflight.mjs`, `scripts/apk-info.mjs` | 10 |
| `material-3` | Material Design 3 for Compose and the web: tokens, components, layout, theming. Use it for any UI change (ADR 0048) | Third party (hamen/material-3-skill, MIT), installed with `npx skills add hamen/material-3-skill --skill material-3`; the folder is a link to `.agents/skills/material-3`, pinned in `skills-lock.json` | none (no scripts) |

Slash commands in steering (`/release`, `/field-test`, `/judge-demo`) point at these skills: `/release` runs `release-apk`, `/field-test` runs `field-report`.

## Run all tests

```
node --test ".kiro/skills/test/*.test.mjs" ".kiro/skills/*/scripts/test/*.test.mjs" ".kiro/scripts/test/*.test.mjs"
```

`.kiro/skills/test/skills.test.mjs` checks every skill against the format (name equals folder name, description under 1,024 characters and says when to use it, every referenced file exists, every script has a test, no secret pattern).

## Rules for editing a skill

- Keep `SKILL.md` short and actionable; put detail in `references/`.
- A script is for something deterministic. It has no dependency, has a test, and never prints a secret.
- Never write a step or a number that was not read in a source or seen on a device. Mark what is unverified.
- Skills do not change thresholds, stored data or dependencies. They ask the human.

Run every test in the repo (hooks, skills, agents, MCP tools, Power, spec-lint) with `npm test`.
