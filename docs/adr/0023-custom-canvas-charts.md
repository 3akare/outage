# ADR 0023: Insights charts are custom Compose Canvas, no chart library

Status: ACCEPTED (2026-11-15), under the blanket approval.

## Context
The Insights screen needs four charts: a weekday-by-hour heatmap, daily bars with a promise line, a 12-week trend line and a score ring. The product is free, so the charts must cost nothing. The tech rule says to prefer the simplest design with the fewest dependencies, and each new dependency needs an ADR.

## Decision
Draw all four charts on Compose `Canvas` with our own small composables: `HeatmapChart`, `BarChart`, `LineChart` and `RingChart`. The numbers behind them come from pure Kotlin (`InsightsStats`) tested on the JVM. No library, so `.kiro/approved-dependencies.json` needs no change.

## Alternatives
1. **Vico** (`com.patrykandpatrick.vico`, Apache-2.0, free). Good Compose line, column and candlestick charts. Rejected: it has no heatmap, which is the most useful chart here, so we would still write a custom one; it adds a dependency with its own release cadence and an approval step; and we need only simple shapes with our own accessibility text and pattern fills.
2. **MPAndroidChart** (Apache-2.0). Rejected: View based, not Compose, unmaintained, and no heatmap.
3. **Compose Charts or other small libraries.** Rejected: young projects, uneven maintenance, same gap on heatmaps.
4. **Show tables only.** Rejected: the user asked for the best visual charts.

## Consequences
- Fewer dependencies and a smaller APK. Full control of colours, patterns and TalkBack text for each bar and cell.
- We write and test about four small drawing composables. Chart maths stays out of the composables, so a drawing bug cannot change a number.
- If we later need many chart types, we can revisit Vico with a new ADR.
- Spec: `.kiro/specs/app-map-insights/`. Related: ADR 0022.
