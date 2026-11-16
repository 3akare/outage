# ADR 0048: Material 3 design system on every platform, and a new mark

Status: ACCEPTED (2026-11-24). Asked for by the human: "a uniform, beautiful, standard, modern UI/UX across all available platforms", "update the app icon to be a power button, but the rectangle that breaks the circle is a charging bolt. Make it look like a proper Google logo." Spec: `.kiro/specs/material-redesign/`. Amends ADR 0028 (decisions 3 to 7); keeps its decisions 1 and 2 (one token file, generated outputs, a test).

## Context
The Android app used Material 3 components with a hand-made dark palette; the website used its own CSS names (`--bg`, `--raised`) and the area pages a third, inline palette. Three looks for one product. The old mark was a lightning bolt in a hexagon on the web and a bolt on green on the phone.

## Decision
1. **Material 3 everywhere.** `core/shared/design/tokens.json` now holds a full Material 3 colour scheme (every role, light and dark), the Material 3 type scale, shape scale and spacing. The scheme was generated once from seed `#1F9D63` (tonal spot) with `@material/material-color-utilities` 0.3.0 run outside the repository; only the values are committed, so no dependency is added.
2. **Power states are Material custom colours**, not the theme's tertiary and error roles: `normal` (green), `possible` (amber), `confirmed` (red), `restored` (blue), each with `on-`, `-container` and `on-...-container`, generated unblended so the four stay recognisable. The green containers are held at chroma 30 so "power on" reads calm. The map has its own vivid fills (`map.*`); power on is drawn at 62 % over the ground so problems stand out. Patterns stay as in ADR 0028 (hatch, dots, outline), so colour is never the only signal.
3. **Generated outputs:** `tools/tokens/build.mjs` writes `core/shared/design/tokens.css` and `web/ui/app/tokens.gen.ts` (`--md-sys-color-*`, `--md-sys-typescale-*`, `--md-sys-shape-corner-*`, `--md-map-*`) and `android/.../ui/Tokens.kt`. `ui/Theme.kt` builds `lightColorScheme` and `darkColorScheme` from every role, sets the Material 3 shapes, and provides the status and map colours through `LocalStatusColors`. The map now follows light and dark mode like the rest of the app. Dynamic colour stays off (the states must look the same on every phone).
4. **Light and dark follow the system** on both platforms. The web also honours `data-theme` on `<html>`.
5. **Type:** the Material 3 type scale in Roboto on Android and on the web (system font stack with Roboto first; no font is downloaded, ADR 0027).
6. **Icons:** Material Icons (Apache License 2.0), one set in `core/shared/design/icons.json`. The web inlines them as SVG; `tools/icon/build.mjs` writes the same glyphs as Android vector drawables `ic_sym_*.xml`.
7. **The mark:** a power symbol whose stem is a charging bolt. The ring is three flat-cut arcs, blue, green and red, open at the top; the bolt is yellow and passes through the opening. White background. One geometry in `tools/icon/build.mjs` writes the adaptive icon layers (foreground, background, single-colour themed layer), an in-app copy `ic_mark.xml`, the master `core/shared/design/icon.svg`, and the web header mark and favicon (`web/site/logo.gen.ts`, served at `/favicon.svg`). The colours are Outage's own status hues, not Google's brand colours, and the mark carries no Google name or shape.
8. **Tests:** `tokens.test.mjs` (MD1, was UX3) checks every role in both modes in CSS and Kotlin; `icon.test.mjs` (MD2) checks the generated files are current, the mark is inside the 66 dp safe circle with its stroke, and the themed layer is one colour.

## Alternatives
1. **Dynamic colour (Material You wallpaper colours).** Rejected: a red power cut must look red on every phone.
2. **`@material/web` components on the website.** Rejected: maintenance mode upstream, a dependency, and module scripts from a bundle; CSS custom properties with the same token names give the same look with no dependency.
3. **Keep the bolt-in-hexagon mark.** Rejected by the human.
4. **Google's own brand colours for the ring.** Rejected: the mark must not pass as a Google product; Outage's state hues are used instead.
5. **Paparazzi or Roborazzi for Compose screenshots.** Deferred again (ADR 0030): a new test dependency and unknown support for AGP 9.2. Compose screens are checked on a device in the Kiro IDE pass.

## Consequences
- The website stylesheet uses Material token names, so a new page picks up both themes for free.
- The phone map is light in light mode. People used to the dark map will see a change.
- A change to a colour, a glyph or the mark is one edit and one command, and the tests fail until the outputs are regenerated.
