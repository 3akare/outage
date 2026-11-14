#!/usr/bin/env bash
# Kiro Web opens /projects/sandbox as the project root, but the repository is /projects/sandbox/outage.
# Kiro reads steering, hooks, skills, agents and specs from <root>/.kiro, so the repo's folders are linked there.
# Verified 2026-11-14: after linking, the next turn loaded the always-on steering files and the hooks (secrets, privacy,
# test and evidence guards blocked test writes), the skills loaded from the links, and the three agents ran.
# Kiro reads these at the start of a turn: links added or changed mid-turn take effect on the next message.
# Not linked: <root>/.kiro/settings (Kiro manages it and denies agent writes), so MCP config in .kiro/settings/mcp.json is not
# picked up here; use `node .kiro/scripts/mcp-call.mjs` instead.
# Usage: bash .kiro/scripts/link-workspace-root.sh [--remove]
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT="$(dirname "$REPO")"
[ -d "$ROOT/.kiro" ] || mkdir -p "$ROOT/.kiro"
for d in steering hooks skills agents specs scripts; do
  if [ "${1:-}" = "--remove" ]; then [ -L "$ROOT/.kiro/$d" ] && rm "$ROOT/.kiro/$d"; continue; fi
  if [ -e "$ROOT/.kiro/$d" ] && [ ! -L "$ROOT/.kiro/$d" ]; then echo "skip $d: a real folder is there" >&2; continue; fi
  ln -sfn "../$(basename "$REPO")/.kiro/$d" "$ROOT/.kiro/$d"   # relative links: the absolute ones did not load the hooks
done
ls -la "$ROOT/.kiro"
