# MCP servers and agent settings

Config file: `.kiro/settings/mcp.json` (workspace level, https://kiro.dev/docs/mcp/configuration/). Verified live on 2026-11-14 with `node .kiro/scripts/mcp-check.mjs` (13 tests with a mock server).

| Server | URL | Auth | Tools | State |
|---|---|---|---|---|
| `cloudflare-docs` | https://docs.mcp.cloudflare.com/mcp | none needed (verified) | `search_cloudflare_documentation` (auto-approved), `migrate_pages_to_workers_guide` (disabled, not relevant) | enabled, smoke call returned the Durable Objects alarms page |
| `context7` | https://mcp.context7.com/mcp | none needed for basic use (verified); a free API key raises rate limits | `resolve-library-id`, `query-docs` (both auto-approved) | enabled, smoke call resolved `/dubzzz/fast-check` |
| `github` | https://api.githubcopilot.com/mcp/ | Bearer token from `GITHUB_MCP_TOKEN` | issues toolset, read-only, lockdown on | **disabled** until the human adds a token |
| Neon | not configured | | | The brief: only if Postgres is ever added. It is not. |
| Cloudflare API | not configured on purpose | | | `mcp.cloudflare.com/mcp` can create and change account resources. Budget is zero and adding a service needs the human. The docs server answers every documentation question. |

## Why these choices

- The three servers cover the brief: Cloudflare docs, a current-docs server for Expo, Expo Modules, React Native, fast-check and H3, and GitHub issues for Bugfix Specs.
- GitHub is configured read-only (`X-MCP-Readonly`), limited to the `issues` toolset (`X-MCP-Toolsets`) and with lockdown on (`X-MCP-Lockdown`). Lockdown hides public issue text written by people without push access, which blocks prompt injection through issues (header semantics: https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md). Lockdown is a best-effort filter, not a security boundary: the agents treat issue text as data.
- Android has no MCP server here. The Android agents read developer.android.com pages with a web tool.
- Tool names with hyphens (`resolve-library-id`) do not match the pattern Kiro documents for MCP tools (`^[a-zA-Z][a-zA-Z0-9_]*$`). Kiro may sanitize them. Check the MCP panel once. If the tools are excluded, switch Context7 to its local server (`npx -y @upstash/context7-mcp`, which needs the human's approval as a dependency) or rely on `mcp-call.mjs`.

## What the human must do

1. **Trust the workspace.** Until a workspace is trusted, Kiro loads none of its agents, steering, skills or MCP config (https://kiro.dev/docs/permissions/, Workspace trust). In Kiro CLI choose "Trust" the first time; in the IDE trust the folder.
2. **Open the repository folder as the project.** In Kiro Web the workspace root is `/projects/sandbox` and the repository is `/projects/sandbox/outage`. Kiro reads `.kiro/` from the project root, so check in the MCP panel that `cloudflare-docs` and `context7` are connected. If not, use Configuration Sync, or copy this `.kiro` folder to the root Kiro uses. `mcp-call.mjs` works either way.
3. **GitHub (optional).** Create a fine-grained personal access token limited to this repository with read access to Issues. Set it as `GITHUB_MCP_TOKEN` in the environment of the session (a secret in Kiro Web, an environment variable for the IDE or CLI) and add `GITHUB_MCP_TOKEN` to Kiro's "Mcp Approved Env Vars" setting. Then set `"disabled": false` for `github` in `.kiro/settings/mcp.json`, and run `node .kiro/scripts/mcp-check.mjs --server github`. Never write the token in a file.
4. **Context7 key (optional).** A free key from context7.com gives higher limits. Add `"headers": { "Authorization": "Bearer ${CONTEXT7_API_KEY}" }` to the `context7` entry, set the variable the same way, and approve it.
5. **Model for max effort.** The brief wants the highest reasoning effort for the detection engine and the Kotlin sensor. Kiro sets effort per model, not per agent (https://kiro.dev/docs/models/effort/). `.kiro/settings/cli.json` sets `claude-opus-4.8` to `max`, and the `sensor-engineer` and `detection-auditor` agents are pinned to that model. If that model is not available to you, change the `model` in both agent files and the key in `cli.json` together; a test checks they match. Max effort uses more credits.

## Verify any time

```
node .kiro/scripts/mcp-check.mjs                 # enabled servers: connect, list tools, validate the config, smoke call
node .kiro/scripts/mcp-check.mjs --include-disabled --server github
node .kiro/scripts/mcp-call.mjs <server> --list
```

## Permissions

Kiro Web ignores `permissions.yaml` and runs actions in a cloud sandbox; the permission rules in each agent file (`permissions.rules`) apply in the IDE and CLI. On every surface the hooks in `.kiro/hooks/` enforce the same rules for the agent's own tool calls: they ask before a dependency is added or a test is deleted, and they block secrets, personal data and ignoring `/.kiro`. Kiro itself denies agent writes to `.kiro/settings/` of the workspace root and to `.kiroignore` at any depth; that is why `.kiroignore` is created by the human from `docs/kiroignore.suggested`.
