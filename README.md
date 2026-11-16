# Outage

**Your phone charger is a power-grid sensor.** When grid power fails, every phone charging in an area stops charging in the same second. Outage collects those events, confirms blackouts area by area with nobody reporting anything, and tells people when power goes and when it comes back.

Open source (MIT). Android only for the sensor; the website is for everyone else, including judges without an Android phone.

## Where everything is

```
android/
  outage/     The app people install. Kotlin and Jetpack Compose.
  probe/      Throwaway test app that measured how real phones report charging. Kept for the record.
web/          One Cloudflare Worker. The phone and the browser both talk to it.
  api/        The API and the Durable Objects (ingest, areas, alerts, Home Watch, telemetry)
  landing/    Landing page at /
  ui/app/       Web copy of the phone app at /app, on real data
  ui/simulate/  Simulation for judges at /app/simulate, clearly labelled as simulated
  areas/      Public pages such as "Is there power in Yaba right now?"
  site/       Helpers every page shares
core/
  detection/  The engine that decides "this is a blackout". Pure TypeScript, no I/O.
  shared/     The wire format between phone and server, test fixtures, design tokens
tools/        sim (builds the judge replay), field (daily field report), tokens (design tokens)
powers/       A Kiro Power that packages the reusable skills
docs/         Decisions (adr/), build log, status, traceability
.kiro/        Kiro steering, specs, hooks, skills and agents
```

Each folder has its own `README.md` with the detail: `android/outage/README.md`, `android/probe/README.md`, `web/README.md`, `core/detection/README.md`.

## How a blackout travels

1. **Phone** (`android/outage`). The sensor sees the charger stop, queues an event and posts it to `POST /v1/events`.
2. **Ingest** (`web/api/ingest`). Checks the install token, validates the event against `core/shared`, works out the event time and sends it to its area.
3. **Area** (`web/api/area`). One Durable Object per area runs the engine in `core/detection` and decides outages, restores and pushes.
4. **Public index** (`web/api/public-index`). An area is published only when 3 or more phones agree.
5. **Screens**. The website (`web/ui`, `web/areas`) and the phone map read the same `/api/map.json` (`web/api/map`).

## Where to change X

| To change | Edit |
|---|---|
| A screen in the Android app | `android/outage/app/src/main/kotlin/app/outage/ui/` |
| Words in the Android app | `android/outage/app/src/main/res/values/strings.xml` (Pidgin in `values-pcm/`) |
| The landing page | `web/landing/landing.ts` |
| The web copy of the app | `web/ui/app/app.ts`, styles in `web/ui/app/design.ts` |
| The judge simulation | `web/ui/simulate/simulate.ts`; its data comes from `tools/sim` |
| Which URL goes where | `web/routes.ts` |
| An API the phone calls | `web/api/ingest/handlers.ts` |
| The wire format | `core/shared/src/ingest.ts`, then `android/outage/app/src/main/kotlin/app/outage/net/Wire.kt` |
| A detection threshold | `core/detection/src/params.ts` (needs an ADR first) |
| Colours | `core/shared/design/tokens.json`, then `node tools/tokens/build.mjs` |
| The list of Lagos areas | `web/areas/catalog/catalog.source.json` |

## Commands

| What | Command (repo root) |
|---|---|
| Install | `npm ci` |
| All Node and TypeScript tests | `npm test` |
| Lint and typecheck | `npm run lint`, `npm run typecheck` |
| Worker locally | `cd web && npx wrangler dev` |
| Android app | `cd android/outage && ./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug` |
| Probe app | `cd android/probe && ./gradlew :app:assembleDebug :app:testDebugUnitTest` |

Deploying the Worker: `docs/deploy.md`.
