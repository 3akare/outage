package app.outage.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.insights.InsightsCalc
import app.outage.insights.InsightsResult
import app.outage.insights.InsightsSource
import app.outage.insights.PromiseCheck
import app.outage.log.LightScore
import app.outage.log.Stats
import app.outage.ui.charts.BarChart
import app.outage.ui.charts.Heatmap
import app.outage.ui.charts.LineChart
import app.outage.ui.charts.Ring
import java.time.ZoneId
import kotlin.math.ceil

private val ranges = listOf(7, 30, 90)

/**
 * Insights: charts of the user's own power (app-map-insights R7 to R10). Every number comes from [InsightsCalc]; this
 * file only draws and words them. A large title, a segmented control for the range, big numbers in white cards, then one
 * chart per card.
 */
@Composable
fun InsightsScreen(source: InsightsSource) {
    var range by rememberSaveable { mutableIntStateOf(30) }
    val zone = remember { ZoneId.systemDefault() }
    val now = remember { System.currentTimeMillis() }
    val input = remember(source) { source.input(now, zone) }
    val band = remember(source) { source.band() }
    val result = remember(input, range) { InsightsCalc.compute(input, now, zone, range, band) }
    // The Light Score is this calendar month's, by the same rule as the Power Log (Stats.scoreOf).
    val month = remember(input) {
        val today = java.time.Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        InsightsCalc.lightScore(InsightsCalc.compute(input, now, zone, today.dayOfMonth, band).days, java.time.YearMonth.from(today))
    }

    // Charts draw in each time the range changes.
    val progress = remember { Animatable(0f) }
    LaunchedEffect(range) {
        progress.snapTo(0f)
        progress.animateTo(1f, tween(700))
    }

    DayPage {
        LargeTitle(stringResource(R.string.ins_title), top = 20.dp) { if (result.simulated) SimulatedChip() }
        PageText(stringResource(R.string.ins_subtitle), color = Day.muted, style = DayType.subhead)
        if (result.simulated) PageText(stringResource(R.string.ins_simulated_note), color = Day.muted, style = DayType.footnote)
        Gap(8.dp)
        Segmented(
            options = ranges.map { stringResource(R.string.ins_range_days, it) },
            selected = ranges.indexOf(range).coerceAtLeast(0),
            onSelect = { range = ranges[it] },
            modifier = Modifier.padding(horizontal = Gutter),
        )
        Gap(16.dp)

        if (result.daysWithData == 0 && result.outageCount == 0) {
            ChartCard {
                CardTitle(stringResource(R.string.ins_empty_title), stringResource(R.string.ins_empty_body))
            }
        } else {
            Hero(result, month, progress.value)
            if (result.underSevenDays) {
                Gap()
                EarlyCard(result.daysWithData)
                LongestCard(result)
            } else {
                Gap()
                BarsCard(result, progress.value)
                result.worstSlot?.let { w ->
                    Gap()
                    ChartCard {
                        Text(stringResource(R.string.ins_sentence, Fmt.weekdayFull(w.weekday), Fmt.hourOfDay(w.hour)), style = DayType.title3, color = Day.ink)
                    }
                }
                Gap()
                HeatCard(result, progress.value)
                LongestCard(result)
                Gap()
                TrendCard(result, progress.value)
                result.meanGapMs?.let { gap ->
                    Gap()
                    ChartCard { Text(stringResource(R.string.ins_gap, durationText(gap)), style = DayType.callout, color = Day.ink2) }
                }
                result.promise?.let { Gap(); PromiseCard(it) }
            }
        }
    }
}

@Composable
private fun ChartCard(content: @Composable () -> Unit) {
    DayCard(padding = 20.dp) { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { content() } }
}

@Composable
private fun EarlyCard(daysWithData: Int) {
    ChartCard {
        Text(stringResource(R.string.ins_early_title, (daysWithData + 1).coerceAtMost(7)), style = DayType.title3, color = Day.ink)
        MeterBar(daysWithData / 7f, Day.ink)
        Text(stringResource(R.string.ins_early_body), style = DayType.subhead, color = Day.muted)
    }
}

/** The ring of this month's Light Score ("Day N of 7" until it has 7 days), and four numbers beside it. */
@Composable
private fun Hero(r: InsightsResult, month: LightScore, progress: Float) {
    val s = LocalStatusColors.current
    val score = month.score
    ChartCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Ring(
                fraction = (score ?: 0) / 100f, progress = progress, startColor = s.map.normal, endColor = s.map.normal,
                trackColor = Day.fill,
                summary = if (score == null) stringResource(R.string.ins_ring_none) else stringResource(R.string.ins_summary_ring, score),
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (score == null) {
                        Text(stringResource(R.string.ins_early_title, Stats.scoreDayNumber(month.qualifyingDays)), style = DayType.headline, color = Day.ink)
                    } else {
                        Text(stringResource(R.string.ins_ring_value, score), style = DayType.title1Num, color = Day.ink)
                    }
                    Text(stringResource(R.string.ins_ring_title), style = DayType.caption, color = Day.muted)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile(stringResource(R.string.ins_tile_outages), r.outageCount.toString())
                Tile(stringResource(R.string.ins_tile_hours_off), stringResource(R.string.ins_hours_value, r.outageHours))
                Tile(stringResource(R.string.ins_tile_avg), r.avgPowerHoursPerDay?.let { stringResource(R.string.ins_hours_value, it) } ?: stringResource(R.string.ins_none_value))
                Tile(stringResource(R.string.ins_tile_longest), r.longest.firstOrNull()?.let { durationText(it.durationMs) } ?: stringResource(R.string.ins_none_value))
            }
        }
        Text(stringResource(R.string.ins_ring_hint), style = DayType.footnote, color = Day.muted)
    }
}

@Composable
private fun Tile(name: String, value: String) {
    Column {
        Text(value, style = DayType.headline.copy(fontFeatureSettings = "tnum"), color = Day.ink)
        Text(name, style = DayType.footnote, color = Day.muted)
    }
}

@Composable
private fun BarsCard(r: InsightsResult, progress: Float) {
    val s = LocalStatusColors.current
    var selected by remember(r) { mutableStateOf<Int?>(null) }
    val values = r.days.map { it.powerHours }
    val promise = r.promise?.promisedHours?.toDouble()
    val avg = r.avgPowerHoursPerDay ?: 0.0
    ChartCard {
        CardTitle(stringResource(R.string.ins_bars_title))
        val ticks = listOf(0.0, 12.0, 24.0).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) }
        val last = values.size - 1
        val xs = listOf(0, last / 2, last).distinct().map { it to Fmt.day(r.days[it].dayStartMs) }
        BarChart(
            values = values, maxValue = 24.0, promise = promise,
            promiseLabel = promise?.let { stringResource(R.string.ins_bars_promise, it.toInt()) } ?: "",
            yTicks = ticks, xLabels = xs, selected = selected, onSelect = { selected = it }, progress = progress,
            okColor = Day.ink, lowColor = s.map.possible, gridColor = Day.rule, textColor = Day.muted,
            summary = stringResource(R.string.ins_summary_bars, values.size, avg),
        )
        val d = selected?.let { r.days.getOrNull(it) }
        Text(
            when {
                d == null -> stringResource(R.string.ins_bars_hint)
                d.powerHours == null -> stringResource(R.string.ins_day_no_data, Fmt.day(d.dayStartMs))
                else -> stringResource(R.string.ins_day_value, Fmt.day(d.dayStartMs), d.powerHours, d.outageCount)
            },
            style = DayType.footnote, color = Day.muted,
        )
    }
}

@Composable
private fun HeatCard(r: InsightsResult, progress: Float) {
    var selected by remember(r) { mutableStateOf<Int?>(null) }
    val shares = r.heatmap.map { it.share }
    ChartCard {
        CardTitle(stringResource(R.string.ins_heat_title))
        Heatmap(
            shares = shares, dayLabels = (0..6).map { Fmt.weekdayShort(it) },
            hourLabels = listOf(0, 6, 12, 18).map { it to stringResource(R.string.ins_hour, it) },
            selected = selected, onSelect = { selected = it }, progress = progress,
            lowColor = Day.fill, highColor = Day.ink, emptyColor = Day.rule2, textColor = Day.muted,
            summary = stringResource(R.string.ins_summary_heat),
        )
        val i = selected
        val share = i?.let { shares[it] }
        Text(
            when {
                i == null -> stringResource(R.string.ins_heat_hint)
                share == null -> stringResource(R.string.ins_heat_not_enough, Fmt.weekdayFull(i / 24), Fmt.hourOfDay(i % 24))
                else -> stringResource(R.string.ins_heat_slot, Fmt.weekdayFull(i / 24), Fmt.hourOfDay(i % 24), ceil(share * 100).toInt())
            },
            style = DayType.footnote, color = Day.muted,
        )
    }
}

@Composable
private fun LongestCard(r: InsightsResult) {
    if (r.longest.isEmpty()) return
    val now = remember { System.currentTimeMillis() }
    val s = LocalStatusColors.current
    Gap()
    ChartCard {
        CardTitle(stringResource(R.string.ins_longest_title))
        val top = r.longest.first().durationMs.coerceAtLeast(1L)
        for (o in r.longest) {
            Column(Modifier.padding(bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(Fmt.since(o.startMs, now), style = DayType.subhead, color = Day.ink2)
                    Text(if (o.ongoing) stringResource(R.string.ins_ongoing) else durationText(o.durationMs), style = DayType.subheadStrong, color = Day.ink)
                }
                MeterBar((o.durationMs.toFloat() / top).coerceIn(0f, 1f), s.map.confirmed)
            }
        }
    }
}

@Composable
private fun TrendCard(r: InsightsResult, progress: Float) {
    ChartCard {
        CardTitle(stringResource(R.string.ins_trend_title), stringResource(R.string.ins_trend_hint))
        val n = r.weeklyTrend.size
        LineChart(
            values = r.weeklyTrend, maxValue = 24.0,
            yTicks = listOf(0.0, 12.0, 24.0).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) },
            xLabels = listOf(0 to stringResource(R.string.ins_trend_weeks_ago, n - 1), n - 1 to stringResource(R.string.ins_trend_now)),
            progress = progress, lineColor = Day.ink, gridColor = Day.rule, textColor = Day.muted,
            summary = stringResource(R.string.ins_summary_trend),
        )
    }
}

@Composable
private fun PromiseCard(p: PromiseCheck) {
    val s = LocalStatusColors.current
    ChartCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.ins_promise_title), style = DayType.title3, color = Day.ink, modifier = Modifier.weight(1f))
            StatePill(stringResource(R.string.ins_promise_estimate), s.possible)
        }
        Text(
            if (p.diffHours < 0) stringResource(R.string.promise_avg_below, -p.diffHours) else stringResource(R.string.promise_met),
            style = DayType.title2, color = if (p.diffHours < 0) s.possible.color else s.normal.color,
        )
        Text(stringResource(R.string.band_promise, p.bandId, p.promisedHours), style = DayType.subhead, color = Day.ink2)
        if (!p.verified) Text(stringResource(R.string.band_promise_unconfirmed), style = DayType.footnote, color = s.possible.color)
        Text(stringResource(R.string.promise_days_below, p.daysBelow), style = DayType.subhead, color = Day.ink2)
        Text(stringResource(R.string.promise_estimate_note), style = DayType.footnote, color = Day.muted)
    }
}
