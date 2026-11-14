---
inclusion: always
---

# Tech stack (zero budget, free tiers only)

- **Mobile:** Expo (TypeScript) plus a Kotlin Expo Module (`modules/outage-sensor`). Builds run on EAS cloud.
- **Backend:** Cloudflare Worker plus Durable Objects (one per active area cell). The same Worker serves the read-only web page.
- **Push:** Expo push notifications.
- **Geo:** H3, resolution 8.
- **Tests:** Vitest plus fast-check. Property tests are mandatory for detection.
- **Language:** TypeScript strict everywhere except the Kotlin module.

## Rules
- Never guess a platform API from memory. Confirm with an MCP docs server (Cloudflare docs, Context7 for Expo, Expo Modules, React Native, fast-check, H3). Put the doc URL in a code comment for any non-obvious platform API.
- Ask the human before adding any dependency or external service. Confirm a free tier first.
- Secrets live in Wrangler secrets and EAS secrets. Never commit them.
- Batch events and use Durable Objects only for active cells, to stay inside Cloudflare free limits.
- Prefer the simplest design that meets the spec.
