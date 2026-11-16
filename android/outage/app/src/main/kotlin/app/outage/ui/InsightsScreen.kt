package app.outage.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.insights.InsightsCalc
import app.outage.insights.InsightsResult
import app.outage.insights.InsightsSource
import app.outage.insights.PromiseCheck
import app.outage.ui.charts.BarChart
import app.outage.ui.charts.Heatmap
import app.outage.ui.charts.LineChart
import app.outage.ui.charts.Ring
import java.time.ZoneId
import kotlin.math.ceil
import kotlin.math.roundToInt

private val ranges = listOf(7, 30, 90)

/**
 * Insights: charts of the user's own power (app-map-insights R7 to R10). Every number comes from [InsightsCalc];
 * this file only draws and words them. Until the Power Log timeline exists the source is the labelled demo set (R5).
 */
@Composable
fun InsightsScreen(source: InsightsSource) {
    // The sample city has its own history for every area (ADR 0053); a real install shows the person's own Power Log.
    if (source is app.outage.insights.DemoInsightsSource) {
        AreaInsightsScreen()
        return
    }
    var range by rememberSaveable { mutableIntStateOf(30) }
    val zone = remember { ZoneId.systemDefault() }
    val now = remember { System.currentTimeMillis() }
    val input = remember(source) { source.input(now, zone) }
    val band = remember(source) { source.band() }
    val result = remember(input, range) { InsightsCalc.compute(input, now, zone, range, band) }
    val month = remember(input) { InsightsCalc.compute(input, now, zone, 30, band) }

    // Charts draw in each time the range changes.
    val progress = remember { Animatable(0f) }
    LaunchedEffect(range) {
        progress.snapTo(0f)
        progress.animateTo(1f, tween(1000))
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.ins_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(stringResource(R.string.ins_subtitle), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (result.simulated) SimulatedChip()
        }
        if (result.simulated) Text(stringResource(R.string.ins_simulated_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (r in ranges) {
                FilterChip(selected = range == r, onClick = { range = r }, label = { Text(stringResource(R.string.ins_range_days, r)) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }

        if (result.daysWithData == 0 && result.outageCount == 0) {
            EmptyCard()
        } else {
            Hero(result, month, progress.value)
            if (result.underSevenDays) {
                EarlyCard(result.daysWithData)
                LongestCard(result)
            } else {
                BarsCard(result, progress.value)
                result.worstSlot?.let { w ->
                    ChartCard {
                        Text(
                            stringResource(R.string.ins_sentence, Fmt.weekdayFull(w.weekday), Fmt.hourOfDay(w.hour)),
                            style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                HeatCard(result, progress.value)
                LongestCard(result)
                TrendCard(result, progress.value)
                result.meanGapMs?.let { gap -> ChartCard { Text(stringResource(R.string.ins_gap, durationText(gap)), style = MaterialTheme.typography.bodyLarge) } }
                result.promise?.let { PromiseCard(it) }
            }
        }
    }
}

@Composable
private fun ChartCard(content: @Composable () -> Unit) {
    Card(
        Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
    ) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() } }
}

@Composable
private fun EmptyCard() {
    ChartCard {
        Text(stringResource(R.string.ins_empty_title), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.ins_empty_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EarlyCard(daysWithData: Int) {
    ChartCard {
        Text(stringResource(R.string.ins_early_title, (daysWithData + 1).coerceAtMost(7)), style = MaterialTheme.typography.titleMedium)
        LinearProgressIndicator(progress = { daysWithData / 7f }, Modifier.fillMaxWidth())
        Text(stringResource(R.string.ins_early_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Hero(r: InsightsResult, month: InsightsResult, progress: Float) {
    val scheme = MaterialTheme.colorScheme
    ChartCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            val avg = month.avgPowerHoursPerDay
            val score = avg?.let { (it / 24.0 * 100).roundToInt().coerceIn(0, 100) }
            Ring(
                fraction = (score ?: 0) / 100f, progress = progress, startColor = scheme.primary, endColor = scheme.tertiary,
                trackColor = scheme.surfaceVariant,
                summary = if (score == null) stringResource(R.string.ins_ring_none) else stringResource(R.string.ins_summary_ring, score),
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        if (score == null) stringResource(R.string.ins_none_value) else stringResource(R.string.ins_ring_value, score),
                        style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
                    )
                    Text(stringResource(R.string.ins_ring_title), style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Tile(stringResource(R.string.ins_tile_outages), r.outageCount.toString())
                Tile(stringResource(R.string.ins_tile_hours_off), stringResource(R.string.ins_hours_value, r.outageHours))
                Tile(stringResource(R.string.ins_tile_avg), r.avgPowerHoursPerDay?.let { stringResource(R.string.ins_hours_value, it) } ?: stringResource(R.string.ins_none_value))
                Tile(stringResource(R.string.ins_tile_longest), r.longest.firstOrNull()?.let { durationText(it.durationMs) } ?: stringResource(R.string.ins_none_value))
            }
        }
        Text(stringResource(R.string.ins_ring_hint), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
    }
}

@Composable
private fun Tile(name: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun BarsCard(r: InsightsResult, progress: Float) {
    val scheme = MaterialTheme.colorScheme
    var selected by remember(r) { mutableStateOf<Int?>(null) }
    val values = r.days.map { it.powerHours }
    val promise = r.promise?.promisedHours?.toDouble()
    val avg = r.avgPowerHoursPerDay ?: 0.0
    ChartCard {
        Text(stringResource(R.string.ins_bars_title), style = MaterialTheme.typography.titleMedium)
        val ticks = listOf(0.0, 12.0, 24.0).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) }
        val last = values.size - 1
        val xs = listOf(0, last / 2, last).distinct().map { it to Fmt.day(r.days[it].dayStartMs) }
        BarChart(
            values = values, maxValue = 24.0, promise = promise,
            promiseLabel = promise?.let { stringResource(R.string.ins_bars_promise, it.toInt()) } ?: "",
            yTicks = ticks, xLabels = xs, selected = selected, onSelect = { selected = it }, progress = progress,
            okColor = scheme.primary, lowColor = scheme.tertiary, gridColor = scheme.outlineVariant, textColor = scheme.onSurfaceVariant,
            summary = stringResource(R.string.ins_summary_bars, values.size, avg),
        )
        val d = selected?.let { r.days.getOrNull(it) }
        Text(
            when {
                d == null -> stringResource(R.string.ins_bars_hint)
                d.powerHours == null -> stringResource(R.string.ins_day_no_data, Fmt.day(d.dayStartMs))
                else -> stringResource(R.string.ins_day_value, Fmt.day(d.dayStartMs), d.powerHours, d.outageCount)
            },
            style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun HeatCard(r: InsightsResult, progress: Float) {
    val scheme = MaterialTheme.colorScheme
    var selected by remember(r) { mutableStateOf<Int?>(null) }
    val shares = r.heatmap.map { it.share }
    ChartCard {
        Text(stringResource(R.string.ins_heat_title), style = MaterialTheme.typography.titleMedium)
        Heatmap(
            shares = shares, dayLabels = (0..6).map { Fmt.weekdayShort(it) },
            hourLabels = listOf(0, 6, 12, 18).map { it to stringResource(R.string.ins_hour, it) },
            selected = selected, onSelect = { selected = it }, progress = progress,
            lowColor = scheme.surfaceVariant, highColor = scheme.error, emptyColor = scheme.outline, textColor = scheme.onSurfaceVariant,
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
            style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LongestCard(r: InsightsResult) {
    if (r.longest.isEmpty()) return
    val now = remember { System.currentTimeMillis() }
    ChartCard {
        Text(stringResource(R.string.ins_longest_title), style = MaterialTheme.typography.titleMedium)
        val top = r.longest.first().durationMs.coerceAtLeast(1L)
        for (o in r.longest) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(Fmt.since(o.startMs, now), style = MaterialTheme.typography.bodyMedium)
                    Text(
                        if (o.ongoing) stringResource(R.string.ins_ongoing) else durationText(o.durationMs),
                        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                    )
                }
                LinearProgressIndicator(
                    progress = { (o.durationMs.toFloat() / top).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.error, trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun TrendCard(r: InsightsResult, progress: Float) {
    val scheme = MaterialTheme.colorScheme
    ChartCard {
        Text(stringResource(R.string.ins_trend_title), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.ins_trend_hint), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        val n = r.weeklyTrend.size
        LineChart(
            values = r.weeklyTrend, maxValue = 24.0,
            yTicks = listOf(0.0, 12.0, 24.0).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) },
            xLabels = listOf(0 to stringResource(R.string.ins_trend_weeks_ago, n - 1), n - 1 to stringResource(R.string.ins_trend_now)),
            progress = progress, lineColor = scheme.primary, gridColor = scheme.outlineVariant, textColor = scheme.onSurfaceVariant,
            summary = stringResource(R.string.ins_summary_trend),
        )
    }
}

@Composable
private fun PromiseCard(p: PromiseCheck) {
    ChartCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.ins_promise_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Text(stringResource(R.string.ins_promise_estimate), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.tertiary)
        }
        Text(stringResource(R.string.band_promise, p.bandId, p.promisedHours), style = MaterialTheme.typography.bodyMedium)
        if (!p.verified) Text(stringResource(R.string.band_promise_unconfirmed), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
        Text(
            if (p.diffHours < 0) stringResource(R.string.promise_avg_below, -p.diffHours) else stringResource(R.string.promise_met),
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(stringResource(R.string.promise_days_below, p.daysBelow), style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.promise_estimate_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
