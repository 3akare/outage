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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.selected
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
 * Insights for the sample city (ADR 0053, ADR 0054): how power behaves in one area over the last 30 days, and how the
 * areas compare. Every number comes from [AreaHistory] over [DemoCity]'s made-up history; this file only draws and words
 * it. A large title, area capsules starting on the spot's area, six big numbers, then one chart per card. Labelled
 * Simulated throughout.
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
        progress.animateTo(1f, tween(700))
    }
    DayPage {
        LargeTitle(stringResource(R.string.ins_title), top = 20.dp) { SimulatedChip() }
        PageText(stringResource(R.string.ins_area_sub, r.name), color = Day.muted, style = DayType.subhead)
        Gap(10.dp)
        // Area picker: the spot's area first, then the rest, as capsules you can scroll.
        val pickerDesc = stringResource(R.string.ins_area_picker)
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = Gutter).semantics { contentDescription = pickerDesc },
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val ordered = DemoCity.areas.sortedBy { if (it.slug == spotArea) 0 else 1 }
            for (a in ordered) {
                val on = a.slug == slug
                Surface(
                    onClick = { slug = a.slug }, shape = CircleShape, color = if (on) Day.ink else Day.card,
                    modifier = Modifier.heightIn(min = 40.dp).semantics { selected = on },
                ) {
                    Box(Modifier.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                        Text(a.name, style = DayType.subheadStrong, color = if (on) Day.onInk else Day.ink, modifier = Modifier.padding(vertical = 10.dp))
                    }
                }
            }
        }
        Gap(16.dp)
        Kpis(r)
        Gap()
        DaysCard(r, progress.value)
        Gap()
        HeatCard(r, progress.value)
        Gap()
        CompareCard(ranking, r.slug)
        Gap()
        WeeklyCard(r, progress.value)
        HistoryCard(r)
        GroupFooter(stringResource(R.string.ins_area_note))
    }
}

@Composable
private fun Panel(content: @Composable () -> Unit) {
    DayCard(padding = 20.dp) { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { content() } }
}

@Composable
private fun minutesText(m: Int?): String? = if (m == null) null else durationText(m * 60_000L)

/** Six numbers in a two-column grid of white cards. "Days below the promise" carries its state colour. */
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
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        for (row in tiles.chunked(2)) {
            StatPair(
                { m -> Stat(row[0].second, row[0].first, m.heightIn(min = 96.dp), valueColor = row[0].third?.color ?: Day.ink) },
                { m -> Stat(row[1].second, row[1].first, m.heightIn(min = 96.dp), valueColor = row[1].third?.color ?: Day.ink) },
            )
        }
    }
}

private val DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.getDefault())
private val SHORT = DateTimeFormatter.ofPattern("d MMM", Locale.getDefault())
private val CLOCK = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", Locale.getDefault())

/** 30 bars of hours of power a day in ink, days under the band's promise in orange, the promise as a dashed line. */
@Composable
private fun DaysCard(r: AreaInsights, progress: Float) {
    val st = LocalStatusColors.current
    var selected by remember(r.slug) { mutableStateOf<Int?>(null) }
    Panel {
        CardTitle(stringResource(R.string.ins_bars_title), stringResource(R.string.ins_band_line, r.band, r.bandHours))
        val last = r.days.size - 1
        BarChart(
            values = r.days.map { it.powerHours }, maxValue = 24.0, promise = r.bandHours.toDouble(),
            promiseLabel = stringResource(R.string.ins_bars_promise, r.bandHours),
            yTicks = listOf(0.0, 12.0, 24.0).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) },
            xLabels = listOf(0, last / 2, last).map { it to r.days[it].date.format(SHORT) },
            selected = selected, onSelect = { selected = it }, progress = progress,
            okColor = Day.ink, lowColor = st.map.possible, gridColor = Day.rule, textColor = Day.muted,
            summary = stringResource(R.string.ins_summary_bars, r.days.size, r.avgPowerHours),
        )
        val d = selected?.let { r.days.getOrNull(it) }
        Text(
            if (d == null) stringResource(R.string.ins_bars_hint).substringBefore('.') + "."
            else stringResource(R.string.ins_day_area, d.date.format(DAY), d.powerHours, d.cuts),
            style = DayType.footnote, color = Day.muted,
        )
    }
}

/** Weekday by hour: how much of each hour was without power, on an ink ramp. */
@Composable
private fun HeatCard(r: AreaInsights, progress: Float) {
    var selected by remember(r.slug) { mutableStateOf<Int?>(null) }
    Panel {
        CardTitle(
            stringResource(R.string.ins_heat_title),
            if (r.cutCount > 0) stringResource(R.string.ins_sentence, Fmt.weekdayFull(r.worstWeekday), Fmt.hourOfDay(r.worstHour)) else null,
        )
        Heatmap(
            shares = r.heatShare.toList(), dayLabels = (0..6).map { Fmt.weekdayShort(it) },
            hourLabels = listOf(0, 6, 12, 18).map { it to stringResource(R.string.ins_hour, it) },
            selected = selected, onSelect = { selected = it }, progress = progress,
            lowColor = Day.fill, highColor = Day.ink, emptyColor = Day.rule2, textColor = Day.muted,
            summary = stringResource(R.string.ins_summary_heat),
        )
        val i = selected
        Text(
            if (i == null) stringResource(R.string.ins_heat_hint)
            else stringResource(R.string.ins_heat_slot, Fmt.weekdayFull(i / 24), Fmt.hourOfDay(i % 24), ceil(r.heatShare[i] * 100).toInt()),
            style = DayType.footnote, color = Day.muted,
        )
    }
}

/** Every area ranked by hours of power a day, 7 or 30 days; the chosen area in ink, the rest by whether they met the promise. */
@Composable
private fun CompareCard(ranking: List<AreaRank>, current: String) {
    val st = LocalStatusColors.current
    var month by rememberSaveable { mutableStateOf(false) }
    val rows = if (month) ranking.sortedByDescending { it.month } else ranking
    Panel {
        CardTitle(stringResource(R.string.ins_compare_title), stringResource(R.string.ins_compare_hint))
        Segmented(
            options = listOf(7, 30).map { stringResource(R.string.ins_range_days, it) },
            selected = if (month) 1 else 0,
            onSelect = { month = it == 1 },
        )
        Gap(6.dp)
        val best = rows.firstOrNull()
        val summary = best?.let { stringResource(R.string.ins_summary_compare, it.name, if (month) it.month else it.week) } ?: ""
        Column(Modifier.semantics { contentDescription = summary }, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            for (row in rows) {
                val hours = if (month) row.month else row.week
                val cuts = if (month) row.monthCuts else row.weekCuts
                val mine = row.slug == current
                val bandHours = DemoCity.bands[row.band] ?: 0
                val colour = if (hours >= bandHours) st.map.normal else st.map.possible
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            row.name, style = if (mine) DayType.subheadStrong else DayType.subhead, color = Day.ink,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                        )
                        Text(stringResource(R.string.ins_compare_row, hours, cuts), style = DayType.footnote.copy(fontFeatureSettings = "tnum"), color = Day.muted)
                    }
                    Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(Day.fill)) {
                        Box(
                            Modifier.fillMaxHeight().fillMaxWidth((hours / 24.0).toFloat().coerceIn(0f, 1f)).clip(CircleShape)
                                .background(if (mine) Day.ink else colour),
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
    val n = r.weekly.size
    val top = (ceil((r.weekly.maxOrNull() ?: 0.0) / 10.0) * 10.0).coerceAtLeast(10.0)
    Panel {
        CardTitle(stringResource(R.string.ins_weekly_title), stringResource(R.string.ins_weekly_hint))
        LineChart(
            values = r.weekly, maxValue = top,
            yTicks = listOf(0.0, top / 2, top).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) },
            xLabels = listOf(0 to stringResource(R.string.ins_trend_weeks_ago, n - 1), n - 1 to stringResource(R.string.ins_trend_now)),
            progress = progress, lineColor = LocalStatusColors.current.confirmed.color, gridColor = Day.rule, textColor = Day.muted,
            summary = stringResource(R.string.ins_summary_weekly, n, r.weekly.lastOrNull() ?: 0.0),
        )
    }
}

/** Every cut, newest first: when, and how long, with a bar against the longest. A grouped list, not a chart. */
@Composable
private fun HistoryCard(r: AreaInsights) {
    if (r.cuts.isEmpty()) return
    var all by remember(r.slug) { mutableStateOf(false) }
    val longest = (r.longest?.minutes ?: 1).coerceAtLeast(1)
    val red = LocalStatusColors.current.map.confirmed
    GroupHeader(stringResource(R.string.ins_history_title))
    DayCard {
        val shown: List<AreaCut> = if (all) r.cuts else r.cuts.take(6)
        shown.forEachIndexed { i, c ->
            if (i > 0) RowDivider()
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(c.start.format(CLOCK), style = DayType.subhead, color = Day.ink, modifier = Modifier.weight(1f))
                Box(Modifier.width(56.dp).height(6.dp).clip(CircleShape).background(Day.fill)) {
                    Box(Modifier.fillMaxHeight().fillMaxWidth(c.minutes.toFloat() / longest).clip(CircleShape).background(red))
                }
                Text(minutesText(c.minutes) ?: "", style = DayType.subhead.copy(fontWeight = FontWeight(600), fontFeatureSettings = "tnum"), color = Day.ink, modifier = Modifier.width(76.dp))
            }
        }
        if (r.cuts.size > 6) {
            RowDivider()
            TextAction(
                if (all) stringResource(R.string.ins_history_less) else stringResource(R.string.ins_history_more, r.cuts.size),
                { all = !all }, Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}
