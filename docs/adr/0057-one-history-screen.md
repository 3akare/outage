# ADR 0057: One History screen

Status: ACCEPTED (2026-11-21). Supersedes ADR 0026 where it says the Power Log merged into Insights. Amends ADR 0054 (the third tab is History, not Insights).

## Context
The app had two screens that both showed the person's own power: Insights (a tab) and the Power Log (a pushed screen). They had two ways to work out the Light Score, and they could disagree. Commit 7093f27 made them use one rule, but two screens were still left.

## Decision
1. **One screen, called History.** It is the Power Log screen: power now, the two buttons, today, the last 30 days, the outage list, the month's Light Score, the band picker and the share button. It is the third tab. The Insights screen, its route, its feature key and its code (`insights` package, `InsightsScreen`) are deleted.
2. **One score.** `Stats.scoreOf` is the only Light Score function. It needs 7 days with enough data (at least half of the day watched). Below that the History screen shows "Day N of 7", a progress bar and one plain sentence. It shows no number and no ring until day 7.
3. **Old links still open.** The deep links `log`, `insights` and `history` all open History. The "Power log" rows on Now open the History tab.
4. **Dropped with Insights:** the heat map, the weekly trend line, the "worst hour" sentence and the demo outages. They used made-up data in demo builds and a second calculation. The 30-day bars, the outage list and the band check on History cover the same need with real data only.

## Alternatives
1. **Keep both screens, share the function.** Rejected: two places to read the same facts, and the owner asked for one.
2. **Move the Insights charts into History.** Rejected for now: more code and a second calculation for little use in the first 7 days. They can return later on top of `Stats`.

## Consequences
- Less code and one place for the score. The heat map and line chart composables stay in `ui/charts` unused.
- The Now screen is unchanged: it already re-reads on plug and unplug (`AndroidPlugObserver`) and on each sensor event (`SensorPulse`), and its Today meter and Light Alarm row use real data (commits 81042dd, 7093f27).
