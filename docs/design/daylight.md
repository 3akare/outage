# Outage Daylight

The design system for the website and the Android app (ADR 0054). Calm and light, in the manner of Apple's own apps.
Tokens: `core/shared/design/tokens.json` (run `node tools/tokens/build.mjs`). Icons and the mark: `core/shared/design/icons.json`
and `tools/icon/build.mjs`.

## Principles

1. **One answer first.** Opening the app answers "is the power on at my spot?" in one glance: a giant state, how long, and how
   sure we are. Everything else is one tap away.
2. **Grey page, white cards.** The page is `paper-2` (#f5f5f7). Content sits in white grouped cards (radius `l` 20) with no
   border and no shadow, spaced 12 to 16 apart. Never a card inside a card.
3. **Ink is the action.** Primary buttons are ink (#1d1d1f) pills with white text. Secondary actions are `paper-3` pills with
   ink text, or plain link-blue text. Colour is reserved for power states.
4. **Type does the work.** Inter for everything. Big numbers are bold and tight (tabular figures). Headings are one weight.
   No eyebrows, no tracked capitals, no small caps. Labels are sentence case.
5. **Thin icons.** Lucide icons as 1.75 px round strokes. In Settings, each row's icon sits in a 30 x 30 tile (radius 8) of a
   solid colour with a white glyph, like iOS Settings.
6. **Quiet motion.** Opacity and transform only, 200 to 300 ms, standard ease. Respect reduced motion.

## Colour

| Role | Token | Use |
|---|---|---|
| Page | `paper-2` #f5f5f7 | Screen background |
| Card | `paper` #ffffff | Grouped cards, sheets, bars |
| Fill | `paper-3` #ececf0 | Secondary buttons, segmented control track, chips |
| Ink | `ink` / `ink-2` / `muted` | Text in three steps |
| Hairline | `rule` #e3e3e8 | List separators (inset 16 from the leading edge, or past the icon tile) |
| Link | `link` #0066cc | Inline links, text buttons |
| Focus | `focus` #0071e3 | Focus rings |

Power states, each a family: the strong colour (text and icons, 4.5:1 on white), the container (a pale tint for the status
hero), the on-container (text on the tint), and the map's vivid fill (`map.*`, large shapes only, never text).

| State | Word | Strong | Container | Vivid |
|---|---|---|---|---|
| normal | On | #1f8a3b | #e8f7ec | #34c759 |
| possible | Maybe out | #b45309 | #fff4e0 | #ff9f0a |
| confirmed | Out | #d70015 | #ffeceb | #ff3b30 |
| restored | Back | #0a7ea4 | #e5f5fb | #32ade6 |
| no data | Unknown | muted | paper-3 | #aeaeb2 |

## Type

| Style | Size / line, weight | Use |
|---|---|---|
| display | 64/64 700, -0.035em | The status word on the Now screen ("On", "Out"), the landing headline |
| large-title | 34/40 700 | Screen titles (iOS large title) |
| title-1 | 28/34 700 | Big numbers in stat cards |
| title-2 | 22/28 650 | Section heads |
| title-3 | 20/25 600 | Card titles |
| headline | 17/22 600 | List row titles, buttons |
| body | 17/24 400 | Body text |
| callout | 16/22 400 | Secondary paragraphs |
| subhead | 15/20 400 | Row subtitles, captions under numbers |
| footnote | 13/18 400 | Fine print, chart axes, section footers |
| caption | 12/16 500 | Tab bar labels, legend (the smallest text allowed) |

## Shape and space

Radii: `s` 10 (small controls, tiles 8), `m` 14 (buttons that are not pills, inputs), `l` 20 (cards), `xl` 28 (sheets),
`full` (pills). Space on a 4 grid: screen gutter 20 (16 on narrow phones), card padding 16 to 20, between cards 12, between
sections 32.

## Screens (the app, on Android and in the browser)

A bottom tab bar of four: **Now**, **Map**, **Insights**, **Settings**. White, a top hairline, thin icons over 12 px labels;
the selected tab is ink, the others `muted`. On a computer the same four sit in a left sidebar.

- **Now.** Large title: the area name, with "Your spot" above it in `subhead`. The status hero: a white card whose top half is
  the state's container tint, holding the state glyph (the mark, tinted), the state word in `display` in the strong colour,
  and "for 2 h 14 min" in `title-3`. Under it, how sure: "8 of 10 phones charging" with a four-step track On, Maybe, Out,
  Back. Then grouped rows: Light Alarm (switch), Today (hours of power against the band's promise, a thin bar), Nearby
  (three areas with a state word in its strong colour), See the map (chevron).
- **Map.** Full-bleed street map, the hex layer at about 35%. A floating white search capsule at the top (radius full,
  soft shadow) with the mark and "Search areas". A legend capsule at the bottom. Round white recenter button. Tapping an area
  opens a sheet (radius `xl` top corners, grabber) with the area name, the state word and three numbers.
- **Insights.** Large title, a segmented control (7 days, 30 days). A two-column grid of stat cards: the number in `title-1`
  and the meaning in `subhead`. Then one chart per card: hours of power per day (bars, ink for met and the possible colour for
  below the promise, the promise as a dashed line), the weekday by hour heatmap (ink ramp), areas ranked, the outage log.
- **Settings.** Large title, iOS grouped inset lists with coloured icon tiles. Destructive rows in the confirmed red, no tile.
- **Sheets and dialogs.** Sheets with a grabber; alerts centred with stacked full-width buttons.
- **Banners.** One at a time, a white floating card at the top with the mark tile, title in `headline`, body in `subhead`.

## Website

- **Landing.** Apple product page: a centred headline in `display` ("Know the moment the power goes."), one sentence, an ink
  pill ("Try it in your browser") and a link ("Get it for Android"). Under it, the real app (the Now screen) in a phone
  frame beside the live map. Then three short sections with one idea each, set big, and a footer.
- **Pages** (areas, an area, install, privacy, 404): a slim top bar (the mark and "Outage", two links, an ink pill), a
  680 px column of type on the grey page with white cards for grouped facts.
