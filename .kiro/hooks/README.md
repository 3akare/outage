# Hooks

Schema v1, PascalCase triggers, one JSON file per topic in this folder (https://kiro.dev/docs/hooks/). Scripts are dependency-free Node ESM in `.kiro/scripts/`. They have tests: `node --test ".kiro/scripts/test/*.test.mjs"` (23 tests).

## Part E map

| Brief hook | File | Trigger | Action | Surfaces |
|---|---|---|---|---|
| session-context | `session-context.json` | SessionStart | command | Web, IDE, CLI v3 |
| privacy-guard | `privacy-guard.json` | PreToolUse (write) | command, exit 2 blocks | Web, IDE, CLI |
| secrets-guard | `secrets-guard.json` | PreToolUse (write, shell) | command, exit 2 blocks | Web, IDE, CLI |
| detection-tests | `detection-tests.json` | PostToolUse (write) | command | Web, IDE, CLI |
| spec-sync | `spec-sync.json` | PostToolUse (spec, write) | agent + command | Web (command half), IDE and CLI (both) |
| paid-service-check | `paid-service-check.json` | UserPromptSubmit | command (reads `USER_PROMPT`) | Web, IDE, CLI |
| verify-on-stop | `verify-on-stop.json` | Stop | command | Web, IDE, CLI |
| kiro-log | `kiro-log.json` | Stop | agent | Web, IDE, CLI |
| push-to-main | `push-to-main.json` | Stop with `confirm` | command | Web, IDE, CLI |
| property-traceability | `property-traceability.json` | PostTaskExec | command | IDE, CLI v3 (Web runs the same check inside verify-on-stop) |
| kotlin-check | `file-checks.json` | PostFileSave `modules/**.kt` (+ PostToolUse write for Web) | command | IDE, CLI v3, Web |
| demo-label-check | `file-checks.json` | PostFileSave `tools/sim/**` (+ PostToolUse write for Web) | command | IDE, CLI v3, Web |
| pre-compaction-notes | `compaction-notes.json` | PreCompact | command | IDE, CLI v3.1+ |
| post-compaction-restore | `compaction-notes.json` | PostCompact | command | IDE, CLI v3.1+ |

Kiro Web runs only Prompt Submit, Agent Stop, Session Start, Pre Tool Use and Post Tool Use (https://kiro.dev/docs/hooks/types/). The core hooks use only those. The file, task and compaction hooks are extras for IDE and CLI sessions; where it mattered (Kotlin, demo labels, traceability) a Web twin exists.

Extra hooks beyond Part E, each enforcing a rule from the brief:

| File | Rule |
|---|---|
| `repo-guards.json` | Part A.4 never gitignore or delete `/.kiro`; Part H no skipped tests, ask before deleting tests; Part H ask before adding a dependency or a service |
| `property-suite-full.json` | Part B: an expensive Stop hook with a `confirm` prompt (full property suite, `FC_NUM_RUNS=2000`) |

## Behaviour contract

- Hooks get JSON on stdin: `hook_event_name`, `cwd`, `session_id`, `tool_name`, `tool_input`.
- Blocking hooks (PreToolUse) exit 2 with the reason on stderr. "Ask the human" uses `{"hookSpecificOutput":{"permissionDecision":"ask",...}}` on stdout.
- Post and Stop hooks report failures on stdout with exit 0 and a `HOOK FAILED:` first line, so the agent always sees them.
- Scripts never install packages (`npx --no-install`). They skip with a notice when a package is not scaffolded yet.
- `confirm` appears only where the brief wants a question: `push-to-main` (only when the tree is dirty on main in `main` git mode) and `property-suite-full` (only when detection tests changed since the last pass). The `confirmCommand` returns `{"skip": true}` otherwise.

## State and switches

| Item | Where | Meaning |
|---|---|---|
| Git mode | `.kiro/git-mode.json` | `main` now. Change to `pr` when the human says "switch to PRs"; `push-to-main` then stops pushing. |
| Approved dependencies | `.kiro/approved-dependencies.json` | The brief's stack. Anything else makes the guard ask. Add a name only after the human approves it. |
| Commit message | `.commit-message.txt` (gitignored) | Written by the `kiro-log` hook, read by `push-to-main`. Conventional Commits with `[spec:<name> task:<n>]`. |
| Status | `docs/status.md` | Read by `session-context`: milestone, gate, next step, active specs. Update it when the milestone changes. |
| Session notes | `docs/session-notes.md` | Decisions and open questions. Snapshot and restore around compaction. |
| Verify result | `.git/outage-hooks/` | Local cache, not tracked. |

## Allow markers for reviewed false positives

`privacy-guard:allow <reason>`, `secrets-guard:allow <reason>`, `test-guard:allow <reason>`, `demo-label-check:allow` on the same line. A marker needs a reason and the human's agreement.

## Known limits and open points

- `kiro-log` is an agent action on Stop. It has a loop guard in its prompt ("log up to date"). If a session ever loops, set `"enabled": false` on it.
- The exit-code rule differs a little between the Kiro docs (any non-zero blocks a PreToolUse hook) and the hook tool contract (exit 2 blocks, other codes are silent). Exit 2 satisfies both, and post hooks use exit 0 plus stdout.
- Hook commands use `node .kiro/scripts/...` relative to the project root. In Kiro Web the workspace root is `/projects/sandbox` and the repository is `/projects/sandbox/outage`. The scripts find the repo from their own location, but Kiro must load `.kiro/hooks` from the folder it treats as the project. Check with Configuration Sync that the hooks load, and see the check list in `docs/probe-checklist.md`.
- `kotlin-check` runs `:outage-sensor:testDebugUnitTest`. Fix the task name when `sensor-android` task 1 scaffolds the module.
- `detection-tests` and `verify-on-stop` skip until `packages/detection` and the root scripts exist.
