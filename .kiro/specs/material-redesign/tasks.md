# Tasks: material-redesign

Rules: a task is done only per `definition-of-done.md`. No new dependency (ADR 0048).

## Dependency graph

```mermaid
graph LR
    T1[1 spec and ADRs] --> T2[2 tokens]
    T1 --> T3[3 mark and icons]
    T2 --> T4[4 web stylesheet, landing, area pages]
    T3 --> T4
    T4 --> T5[5 app in the browser]
    T2 --> T6[6 Android theme, first run, Home, Settings]
    T3 --> T6
    T6 --> T7[7 device screenshots]
    T2 --> T8[8 night palette and mark]
    T8 --> T9[9 web globe]
    T8 --> T10[10 Android globe]
    T10 --> T7
```

## Wave 1: decisions

- [x] 1. Spec, ADRs 0048 to 0050, steering and README updates.

## Wave 2: shared design

- [x] 2. Material 3 `tokens.json` (light, dark, status, map, type, shape, space), `tools/tokens/build.mjs`, generated CSS and Kotlin, test MD1.
  - Depends on: 1
- [x] 3. The mark and the shared icon set: `tools/icon/build.mjs`, adaptive icon, `ic_mark`, `ic_sym_*`, `logo.gen.ts`, `/favicon.svg`, test MD2.
  - Depends on: 1

## Wave 3: platforms

- [x] 4. Web stylesheet in Material 3 tokens, landing page with store buttons, area pages on the shared stylesheet, tests MD6 and MD7.
  - Depends on: 2, 3
- [x] 5. The app in the browser at `/app/simulate`, `/app` redirects, tests MD3 (web), MD5, MD8.
  - Depends on: 4
- [x] 6. Android `Theme.kt` and `LocalStatusColors`, full-screen map with sheet, first run with location, bar order, grouped Settings, tests MD3 (JUnit) and MD4.
  - Depends on: 2, 3

## Wave 4: the globe and the night design (ADR 0051)

- [x] 8. Remove the `material-3` skill; one dark palette in `tokens.json`; mark redrawn (white ring, yellow bolt, navy).
  - Depends on: 2, 3
- [x] 9. Web globe `/globe.js` from Natural Earth dots, the app in the browser and the landing hero on it, tests updated.
  - Depends on: 8
- [x] 10. Android globe (`GlobeMath.kt`, `Globe.kt`), Home and first run on it, dark-only theme, tests GL1 to GL4.
  - Depends on: 8

## Wave 5: checks

- [ ] 7. Device screenshots and a TalkBack pass of first run, Home, Insights and Settings (needs a phone or emulator; the Kiro IDE pass).
  - Depends on: 6, 10
