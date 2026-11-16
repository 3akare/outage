package app.outage.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.insights.AreaCut
import app.outage.insights.AreaHistory
import app.outage.insights.AreaInsights
import app.outage.insights.AreaRank
import app.outage.map.DemoCity
import app.outage.ui.charts.BarChart
import app.outage.ui.charts.Heatmap
import app.outage.ui.charts.LineChart
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.ceil

/**
 * Insights for the sample city (ADR 0053): how power behaves in one area over the last 30 days, and how the areas
 * compare. Every number comes from [AreaHistory] over [DemoCity]'s made-up history; this file only draws and words it.
 * The area picker starts on the spot's area. Everything here is labelled Simulated.
 */
@Composable
fun AreaInsightsScreen(spotArea: String = DemoCity.cells.firstOrNull { it.id == DemoCity.SPOT }?.area ?: "yaba") {
    val today = remember { LocalDate.now(AreaHistory.ZONE) }
    var slug by rememberSaveable { mutableStateOf(spotArea) }
    val area = DemoCity.areas.firstOrNull { it.slug == slug } ?: DemoCity.areas.first()
    val r = remember(area, today) { AreaHistory.compute(area, today) }
    val ranking = remember(today) { AreaHistory.ranking(DemoCity.areas, today) }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(slug) {
        progress.snapTo(0f)
        progress.animateTo(1f, tween(900))
    }
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerHigh).verticalScroll(rememberScrollState())
            .statusBarsPadding().padding(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.ins_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                SimulatedChip()
            }
            Text(stringResource(R.string.ins_area_sub, r.name), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        // Area picker: the spot's area first, then the rest, as chips you can scroll.
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp).semantics { contentDescription = "area" },
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val ordered = DemoCity.areas.sortedBy { if (it.slug == spotArea) 0 else 1 }
            for (a in ordered) {
                FilterChip(
                    selected = a.slug == slug, onClick = { slug = a.slug }, label = { Text(a.name) },
                    shape = RoundedCornerShape(8.dp), modifier = Modifier.heightIn(min = 40.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    ),
                )
            }
        }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Kpis(r)
            DaysCard(r, progress.value)
            HeatCard(r, progress.value)
            CompareCard(ranking, r.slug)
            WeeklyCard(r, progress.value)
            HistoryCard(r)
            Text(stringResource(R.string.ins_area_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Panel(content: @Composable () -> Unit) {
    Card(
        Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() } }
}

@Composable
private fun minutesText(m: Int?): String? = if (m == null) null else durationText(m * 60_000L)

@Composable
private fun Kpis(r: AreaInsights) {
    val st = LocalStatusColors.current
    val belowGood = r.daysBelowBand <= 3
    val tiles = listOf(
        Triple(stringResource(R.string.ins_tile_avg), stringResource(R.string.ins_hours_value, r.avgPowerHours), null),
        Triple(stringResource(R.string.ins_kpi_below, r.band), stringResource(R.string.ins_kpi_below_value, r.daysBelowBand, r.days.size), if (belowGood) st.normal else st.confirmed),
        Triple(stringResource(R.string.ins_tile_outages), r.cutCount.toString(), null),
        Triple(stringResource(R.string.ins_kpi_restore), minutesText(r.medianMinutes) ?: stringResource(R.string.ins_none_value), null),
        Triple(stringResource(R.string.ins_tile_longest), minutesText(r.longest?.minutes) ?: stringResource(R.string.ins_none_value), null),
        Triple(stringResource(R.string.ins_kpi_without), stringResource(R.string.ins_hours_value, r.hoursWithout), null),
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in tiles.chunked(2)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((name, value, family) in row) {
                    Card(
                        Modifier.weight(1f).heightIn(min = 88.dp), shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = family?.container ?: MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    ) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Medium, color = family?.onContainer ?: MaterialTheme.colorScheme.onSurface)
                            Text(name, style = MaterialTheme.typography.bodySmall, color = family?.onContainer ?: MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                        }
                    }
                }
            }
        }
    }
}

private val DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.getDefault())
private val SHORT = DateTimeFormatter.ofPattern("d MMM", Locale.getDefault())
private val CLOCK = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", Locale.getDefault())

/** 30 bars of hours of power a day, with the band's promise as a dashed line; days under it in amber. */
@Composable
private fun DaysCard(r: AreaInsights, progress: Float) {
    val st = LocalStatusColors.current
    val scheme = MaterialTheme.colorScheme
    var selected by remember(r.slug) { mutableStateOf<Int?>(null) }
    Panel {
        Text(stringResource(R.string.ins_bars_title), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.ins_band_line, r.band, r.bandHours), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        val last = r.days.size - 1
        BarChart(
            values = r.days.map { it.powerHours }, maxValue = 24.0, promise = r.bandHours.toDouble(),
            promiseLabel = stringResource(R.string.ins_bars_promise, r.bandHours),
            yTicks = listOf(0.0, 12.0, 24.0).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) },
            xLabels = listOf(0, last / 2, last).map { it to r.days[it].date.format(SHORT) },
            selected = selected, onSelect = { selected = it }, progress = progress,
            okColor = st.normal.color, lowColor = st.possible.color, gridColor = scheme.outlineVariant, textColor = scheme.onSurfaceVariant,
            summary = stringResource(R.string.ins_summary_bars, r.days.size, r.avgPowerHours),
        )
        val d = selected?.let { r.days.getOrNull(it) }
        Text(
            if (d == null) stringResource(R.string.ins_bars_hint).substringBefore('.') + "."
            else stringResource(R.string.ins_day_area, d.date.format(DAY), d.powerHours, d.cuts),
            style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
        )
    }
}

/** Weekday by hour: how much of each hour was without power. */
@Composable
private fun HeatCard(r: AreaInsights, progress: Float) {
    val scheme = MaterialTheme.colorScheme
    val st = LocalStatusColors.current
    var selected by remember(r.slug) { mutableStateOf<Int?>(null) }
    Panel {
        Text(stringResource(R.string.ins_heat_title), style = MaterialTheme.typography.titleMedium)
        if (r.cutCount > 0) {
            Text(
                stringResource(R.string.ins_sentence, Fmt.weekdayFull(r.worstWeekday), Fmt.hourOfDay(r.worstHour)),
                style = MaterialTheme.typography.bodyMedium, color = st.confirmed.onContainer,
            )
        }
        Heatmap(
            shares = r.heatShare.toList(), dayLabels = (0..6).map { Fmt.weekdayShort(it) },
            hourLabels = listOf(0, 6, 12, 18).map { it to stringResource(R.string.ins_hour, it) },
            selected = selected, onSelect = { selected = it }, progress = progress,
            lowColor = scheme.surfaceContainerHigh, highColor = st.confirmed.color, emptyColor = scheme.outline, textColor = scheme.onSurfaceVariant,
            summary = stringResource(R.string.ins_summary_heat),
        )
        val i = selected
        Text(
            if (i == null) stringResource(R.string.ins_heat_hint)
            else stringResource(R.string.ins_heat_slot, Fmt.weekdayFull(i / 24), Fmt.hourOfDay(i % 24), ceil(r.heatShare[i] * 100).toInt()),
            style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
        )
    }
}

/** Every area ranked by hours of power a day, 7 or 30 days; the chosen area stands out. */
@Composable
private fun CompareCard(ranking: List<AreaRank>, current: String) {
    val scheme = MaterialTheme.colorScheme
    var month by rememberSaveable { mutableStateOf(false) }
    val rows = if (month) ranking.sortedByDescending { it.month } else ranking
    Panel {
        Text(stringResource(R.string.ins_compare_title), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.ins_compare_hint), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            listOf(false to 7, true to 30).forEachIndexed { i, (m, days) ->
                SegmentedButton(selected = month == m, onClick = { month = m }, shape = SegmentedButtonDefaults.itemShape(i, 2)) {
                    Text(stringResource(R.string.ins_range_days, days))
                }
            }
        }
        val best = rows.firstOrNull()
        val summary = best?.let { stringResource(R.string.ins_summary_compare, it.name, if (month) it.month else it.week) } ?: ""
        Column(Modifier.semantics { contentDescription = summary }, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (row in rows) {
                val hours = if (month) row.month else row.week
                val cuts = if (month) row.monthCuts else row.weekCuts
                val mine = row.slug == current
                val bandHours = DemoCity.bands[row.band] ?: 0
                val colour = if (hours >= bandHours) LocalStatusColors.current.normal.color else LocalStatusColors.current.possible.color
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            row.name, style = MaterialTheme.typography.bodyMedium, fontWeight = if (mine) FontWeight.Bold else FontWeight.Normal,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                        )
                        Text(stringResource(R.string.ins_compare_row, hours, cuts), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                    }
                    Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(scheme.surfaceContainerHigh)) {
                        Box(
                            Modifier.fillMaxHeight().fillMaxWidth((hours / 24.0).toFloat().coerceIn(0f, 1f)).clip(RoundedCornerShape(5.dp))
                                .background(if (mine) scheme.primary else colour),
                        )
                    }
                }
            }
        }
    }
}

/** Hours without power in each 7-day block, oldest first. */
@Composable
private fun WeeklyCard(r: AreaInsights, progress: Float) {
    val scheme = MaterialTheme.colorScheme
    val n = r.weekly.size
    val top = (ceil((r.weekly.maxOrNull() ?: 0.0) / 10.0) * 10.0).coerceAtLeast(10.0)
    Panel {
        Text(stringResource(R.string.ins_weekly_title), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.ins_weekly_hint), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        LineChart(
            values = r.weekly, maxValue = top,
            yTicks = listOf(0.0, top / 2, top).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) },
            xLabels = listOf(0 to stringResource(R.string.ins_trend_weeks_ago, n - 1), n - 1 to stringResource(R.string.ins_trend_now)),
            progress = progress, lineColor = LocalStatusColors.current.confirmed.color, gridColor = scheme.outlineVariant, textColor = scheme.onSurfaceVariant,
            summary = stringResource(R.string.ins_summary_weekly, n, r.weekly.lastOrNull() ?: 0.0),
        )
    }
}

/** Every cut, newest first: when, and how long, with a bar against the longest. */
@Composable
private fun HistoryCard(r: AreaInsights) {
    if (r.cuts.isEmpty()) return
    val scheme = MaterialTheme.colorScheme
    var all by remember(r.slug) { mutableStateOf(false) }
    val longest = (r.longest?.minutes ?: 1).coerceAtLeast(1)
    Panel {
        Text(stringResource(R.string.ins_history_title), style = MaterialTheme.typography.titleMedium)
        val shown: List<AreaCut> = if (all) r.cuts else r.cuts.take(6)
        for (c in shown) {
            Row(Modifier.fillMaxWidth().heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(c.start.format(CLOCK), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                Box(Modifier.width(64.dp).height(6.dp).clip(RoundedCornerShape(3.dp)).background(scheme.surfaceContainerHigh)) {
                    Box(Modifier.fillMaxHeight().fillMaxWidth(c.minutes.toFloat() / longest).background(LocalStatusColors.current.confirmed.color))
                }
                Text(minutesText(c.minutes) ?: "", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, modifier = Modifier.width(76.dp))
            }
        }
        if (r.cuts.size > 6) {
            TextButton(onClick = { all = !all }) {
                Text(if (all) stringResource(R.string.ins_history_less) else stringResource(R.string.ins_history_more, r.cuts.size))
            }
        }
    }
}
