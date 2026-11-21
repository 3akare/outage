package app.outage.ui

import android.content.Context
import android.content.Intent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.log.NowKind
import app.outage.log.PowerLogView
import app.outage.log.TapResult
import app.outage.ui.charts.BarChart
import app.outage.ui.charts.Ring

/**
 * The Power Log (power-log R7, R8, R10): power now, today, the last 30 days, the open outage, the month's Light Score,
 * the band picker and the share buttons. The numbers come from [app.outage.log.PowerLogModel]; this file only words and
 * draws them. Only this phone's own data is shown (R10.3).
 */
@Composable
fun PowerLogScreen(vm: PowerLogViewModel, shareImage: ((PowerLogView) -> Unit)?) {
    LaunchedEffect(Unit) { vm.refresh() }
    // "Power now" follows the plug and the sensor within about a second.
    RefreshOnPlugOrSensor { vm.reloadLocal() }
    val view = vm.view
    val ctx = LocalContext.current
    val progress = remember { Animatable(0f) }
    LaunchedEffect(view != null) { progress.animateTo(1f, tween(700)) }
    FeaturePage(R.string.log_title) {
        if (view == null) return@FeaturePage
        NowCard(view)
        Gap()
        TapButtons(vm, view)
        GroupHeader(stringResource(R.string.log_today_title))
        TodayCard(view)
        Gap(20.dp)
        ThirtyDaysCard(view, vm.band?.promisedMinHoursPerDay, progress.value)
        OutageList(view)
        Gap(20.dp)
        MonthCard(view, progress.value, onShareText = { shareText(ctx, view) }, onShareImage = shareImage?.let { share -> { share(view) } })
        BandCard(vm)
    }
}

@Composable
private fun LogCard(content: @Composable () -> Unit) {
    DayCard(padding = 20.dp) { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { content() } }
}

/** Power now, as a tinted hero like Now: the state's pale tint and its words in the strong colour. */
@Composable
private fun NowCard(v: PowerLogView) {
    val s = LocalStatusColors.current
    val since = v.sinceMs?.let { Fmt.since(it, v.nowMs) }
    val family = when (v.now) {
        NowKind.ON -> s.normal
        NowKind.OUT -> s.confirmed
        else -> null
    }
    DayCard {
        Column(
            Modifier.fillMaxWidth()
                .background(family?.container ?: Day.card).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            when (v.now) {
                NowKind.ON -> Text(stringResource(R.string.log_now_on, since ?: ""), style = DayType.title2, color = s.normal.color)
                NowKind.OUT -> {
                    Text(stringResource(R.string.log_now_out, since ?: ""), style = DayType.title2, color = s.confirmed.color)
                    v.openOut?.let { Text(stringResource(R.string.log_now_out_for, durationText(v.nowMs - it.startMs)), style = DayType.callout, color = s.confirmed.onContainer) }
                }
                NowKind.OFF_CHARGER -> Text(stringResource(R.string.log_now_off_charger), style = DayType.title3, color = Day.ink)
                NowKind.UNKNOWN -> Text(stringResource(R.string.log_now_unknown), style = DayType.title3, color = Day.ink)
                NowKind.NONE -> Text(stringResource(R.string.log_now_none), style = DayType.title3, color = Day.ink)
            }
        }
    }
}


/** "Power went out" and "Power is back", the person's own taps (power-log R3). */
@Composable
private fun TapButtons(vm: PowerLogViewModel, v: PowerLogView) {
    Row(Modifier.fillMaxWidth().padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        InkButton(stringResource(R.string.log_btn_out), vm::powerOut, Modifier.weight(1f), enabled = vm.waitMinutes == 0)
        FillButton(stringResource(R.string.log_btn_back), vm::powerBack, Modifier.weight(1f), enabled = v.openOut != null)
    }
    val text = when (vm.message) {
        TapResult.OUT_STARTED -> stringResource(R.string.log_msg_out_started)
        TapResult.OUT_QUEUED_ONLY -> stringResource(R.string.log_msg_out_charging)
        TapResult.RATE_LIMITED -> stringResource(R.string.log_msg_rate, vm.waitMinutes.coerceAtLeast(1))
        TapResult.BACK_RECORDED -> stringResource(R.string.log_msg_back)
        TapResult.NOTHING_OPEN -> stringResource(R.string.log_msg_back_none)
        null -> if (vm.waitMinutes > 0) stringResource(R.string.log_msg_rate, vm.waitMinutes) else null
    }
    if (text != null) GroupFooter(text)
}

@Composable
private fun TodayCard(v: PowerLogView) {
    val t = v.today
    val hours = t.powerHours
    if (hours == null) {
        DayCard { DayRow(stringResource(R.string.log_today_no_data), titleColor = Day.muted) }
        return
    }
    StatPair(
        { m -> Stat(stringResource(R.string.ins_hours_value, hours), stringResource(R.string.power_today), m) },
        { m ->
            Stat(
                t.outageCount.toString(), pluralStringResource(R.plurals.log_outage_count, t.outageCount, t.outageCount), m,
                note = if (t.longestMs > 0) stringResource(R.string.log_longest, durationText(t.longestMs)) else null,
            )
        },
    )
}

@Composable
private fun ThirtyDaysCard(v: PowerLogView, promise: Int?, progress: Float) {
    var selected by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf<Int?>(null) }
    val values = v.last30.map { it.powerHours }
    val avg = values.filterNotNull().let { if (it.isEmpty()) 0.0 else it.average() }
    LogCard {
        CardTitle(stringResource(R.string.log_30_title))
        BarChart(
            values = values, maxValue = 24.0, promise = promise?.toDouble(),
            promiseLabel = promise?.let { stringResource(R.string.ins_bars_promise, it) } ?: "",
            yTicks = listOf(0.0, 12.0, 24.0).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) },
            xLabels = listOf(0, values.size / 2, values.size - 1).distinct().map { it to Fmt.day(v.last30[it].day.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()) },
            selected = selected, onSelect = { selected = it }, progress = progress,
            okColor = Day.ink, lowColor = LocalStatusColors.current.map.possible, gridColor = Day.rule, textColor = Day.muted,
            summary = stringResource(R.string.ins_summary_bars, values.size, avg),
        )
        val d = selected?.let { v.last30.getOrNull(it) }
        val dayText = d?.let { Fmt.day(it.day.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()) }
        Text(
            when {
                d == null -> stringResource(R.string.ins_bars_hint)
                d.powerHours == null -> stringResource(R.string.ins_day_no_data, dayText ?: "")
                else -> stringResource(R.string.ins_day_value, dayText ?: "", d.powerHours, d.outageCount)
            },
            style = DayType.footnote, color = Day.muted,
        )
    }
}

@Composable
private fun OutageList(v: PowerLogView) {
    GroupHeader(stringResource(R.string.log_list_title))
    DayCard {
        if (v.outages.isEmpty()) DayRow(stringResource(R.string.log_list_none), titleColor = Day.muted)
        v.outages.forEachIndexed { i, o ->
            if (i > 0) RowDivider()
            val start = Fmt.since(o.startMs, v.nowMs)
            val end = o.endMs
            DayRow(
                if (end == null) stringResource(R.string.log_list_row_open, start) else stringResource(R.string.log_list_row, start, Fmt.since(end, v.nowMs)),
                if (o.unsure) stringResource(R.string.log_list_unsure) else null,
            )
        }
    }
}

@Composable
private fun MonthCard(v: PowerLogView, progress: Float, onShareText: () -> Unit, onShareImage: (() -> Unit)?) {
    val score = v.score.score
    LogCard {
        CardTitle(stringResource(R.string.log_month_title, ShareCardText.monthName(v.share)))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Ring(
                fraction = (score ?: 0) / 100f, progress = progress,
                startColor = LocalStatusColors.current.map.normal, endColor = LocalStatusColors.current.map.normal, trackColor = Day.fill,
                summary = if (score == null) stringResource(R.string.log_score_summary_none) else stringResource(R.string.log_score_summary, score),
            ) {
                Text(if (score == null) stringResource(R.string.ins_none_value) else stringResource(R.string.log_score_value, score), style = DayType.title1Num, color = Day.ink)
            }
            Text(
                if (score == null) stringResource(R.string.log_score_not_enough) else stringResource(R.string.log_score_days, v.score.qualifyingDays),
                style = DayType.subhead, color = Day.ink2, modifier = Modifier.weight(1f),
            )
        }
        Gap(4.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            FillButton(stringResource(R.string.log_share), onShareText, Modifier.weight(1f))
            if (onShareImage != null) FillButton(stringResource(R.string.log_share_picture), onShareImage, Modifier.weight(1f))
        }
    }
}

@Composable
private fun BandCard(vm: PowerLogViewModel) {
    val chosen = vm.band
    val promise = vm.view?.promise
    GroupHeader(stringResource(R.string.band_picker_title))
    DayCard(padding = 16.dp) {
        // "Not set", then each band's letter, as one segmented control.
        val options = listOf(stringResource(R.string.band_none)) + vm.bands.map { it.id }
        val picked = if (chosen == null) 0 else vm.bands.indexOfFirst { it.id == chosen.id } + 1
        Segmented(options, picked, { i -> vm.chooseBand(if (i == 0) null else vm.bands[i - 1].id) })
        if (chosen != null) {
            Column(Modifier.padding(top = 14.dp, start = 4.dp, end = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(stringResource(R.string.band_promise, chosen.id, chosen.promisedMinHoursPerDay), style = DayType.callout, color = Day.ink)
                if (!chosen.verified) Text(stringResource(R.string.band_promise_unconfirmed), style = DayType.footnote, color = LocalStatusColors.current.possible.color)
                if (promise?.avgPowerHours != null) {
                    Text(
                        when {
                            promise.daysBelow > 0 -> stringResource(R.string.promise_days_below, promise.daysBelow)
                            promise.avgPowerHours < promise.promisedHours -> stringResource(R.string.promise_avg_below, promise.promisedHours - promise.avgPowerHours)
                            else -> stringResource(R.string.promise_met)
                        },
                        style = DayType.headline, color = Day.ink,
                    )
                    Text(stringResource(R.string.promise_estimate_note), style = DayType.footnote, color = Day.muted)
                }
            }
        }
    }
    GroupFooter(stringResource(R.string.band_picker_hint))
}

/** Text fallback of the share card (R8.4): the same facts as the picture, no location, name or ID (R8.2). */
private fun shareText(ctx: Context, v: PowerLogView) {
    val text = ShareCardText.build(ctx, v.share)
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
    ctx.startActivity(Intent.createChooser(send, ctx.getString(R.string.log_share_chooser)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
