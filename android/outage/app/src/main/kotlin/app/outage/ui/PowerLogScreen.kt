package app.outage.ui

import android.content.Context
import android.content.Intent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
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
    val view = vm.view
    val ctx = LocalContext.current
    val progress = remember { Animatable(0f) }
    LaunchedEffect(view != null) { progress.animateTo(1f, tween(800)) }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(stringResource(R.string.log_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (view == null) return@Column
        NowCard(view)
        TapButtons(vm, view)
        TodayCard(view)
        ThirtyDaysCard(view, vm.band?.promisedMinHoursPerDay, progress.value)
        OutageList(view)
        MonthCard(view, progress.value, onShareText = { shareText(ctx, view) }, onShareImage = shareImage?.let { share -> { share(view) } })
        BandCard(vm)
    }
}

@Composable
private fun LogCard(content: @Composable () -> Unit) {
    Card(
        Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
    ) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() } }
}

@Composable
private fun NowCard(v: PowerLogView) {
    LogCard {
        val since = v.sinceMs?.let { Fmt.since(it, v.nowMs) }
        when (v.now) {
            NowKind.ON -> Text(stringResource(R.string.log_now_on, since ?: ""), style = MaterialTheme.typography.titleLarge)
            NowKind.OUT -> {
                Text(stringResource(R.string.log_now_out, since ?: ""), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.error)
                v.openOut?.let { Text(stringResource(R.string.log_now_out_for, durationText(v.nowMs - it.startMs))) }
            }
            NowKind.OFF_CHARGER -> Text(stringResource(R.string.log_now_off_charger), style = MaterialTheme.typography.titleMedium)
            NowKind.UNKNOWN -> Text(stringResource(R.string.log_now_unknown), style = MaterialTheme.typography.titleMedium)
            NowKind.NONE -> Text(stringResource(R.string.log_now_none), style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun TapButtons(vm: PowerLogViewModel, v: PowerLogView) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = vm::powerOut, modifier = Modifier.weight(1f).heightIn(min = 56.dp), enabled = vm.waitMinutes == 0) {
            Text(stringResource(R.string.log_btn_out))
        }
        OutlinedButton(onClick = vm::powerBack, modifier = Modifier.weight(1f).heightIn(min = 56.dp), enabled = v.openOut != null) {
            Text(stringResource(R.string.log_btn_back))
        }
    }
    val text = when (vm.message) {
        TapResult.OUT_STARTED -> stringResource(R.string.log_msg_out_started)
        TapResult.OUT_QUEUED_ONLY -> stringResource(R.string.log_msg_out_charging)
        TapResult.RATE_LIMITED -> stringResource(R.string.log_msg_rate, vm.waitMinutes.coerceAtLeast(1))
        TapResult.BACK_RECORDED -> stringResource(R.string.log_msg_back)
        TapResult.NOTHING_OPEN -> stringResource(R.string.log_msg_back_none)
        null -> if (vm.waitMinutes > 0) stringResource(R.string.log_msg_rate, vm.waitMinutes) else null
    }
    if (text != null) Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun TodayCard(v: PowerLogView) {
    LogCard {
        Text(stringResource(R.string.log_today_title), style = MaterialTheme.typography.titleMedium)
        val t = v.today
        val hours = t.powerHours
        if (hours == null) {
            Text(stringResource(R.string.log_today_no_data), color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Text(stringResource(R.string.log_today_power, stringResource(R.string.ins_hours_value, hours)), style = MaterialTheme.typography.titleLarge)
            Text(pluralStringResource(R.plurals.log_outage_count, t.outageCount, t.outageCount))
            if (t.longestMs > 0) Text(stringResource(R.string.log_longest, durationText(t.longestMs)), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ThirtyDaysCard(v: PowerLogView, promise: Int?, progress: Float) {
    val scheme = MaterialTheme.colorScheme
    var selected by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf<Int?>(null) }
    val values = v.last30.map { it.powerHours }
    val avg = values.filterNotNull().let { if (it.isEmpty()) 0.0 else it.average() }
    LogCard {
        Text(stringResource(R.string.log_30_title), style = MaterialTheme.typography.titleMedium)
        BarChart(
            values = values, maxValue = 24.0, promise = promise?.toDouble(),
            promiseLabel = promise?.let { stringResource(R.string.ins_bars_promise, it) } ?: "",
            yTicks = listOf(0.0, 12.0, 24.0).map { it to stringResource(R.string.ins_hours_whole, it.toInt()) },
            xLabels = listOf(0, values.size / 2, values.size - 1).distinct().map { it to Fmt.day(v.last30[it].day.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()) },
            selected = selected, onSelect = { selected = it }, progress = progress,
            okColor = scheme.primary, lowColor = scheme.tertiary, gridColor = scheme.outlineVariant, textColor = scheme.onSurfaceVariant,
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
            style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun OutageList(v: PowerLogView) {
    LogCard {
        Text(stringResource(R.string.log_list_title), style = MaterialTheme.typography.titleMedium)
        if (v.outages.isEmpty()) Text(stringResource(R.string.log_list_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
        v.outages.forEach { o ->
            val start = Fmt.since(o.startMs, v.nowMs)
            val end = o.endMs
            Text(
                if (end == null) stringResource(R.string.log_list_row_open, start) else stringResource(R.string.log_list_row, start, Fmt.since(end, v.nowMs)),
                style = MaterialTheme.typography.bodyLarge,
            )
            if (o.unsure) Text(stringResource(R.string.log_list_unsure), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun MonthCard(v: PowerLogView, progress: Float, onShareText: () -> Unit, onShareImage: (() -> Unit)?) {
    val scheme = MaterialTheme.colorScheme
    val score = v.score.score
    LogCard {
        Text(
            stringResource(R.string.log_month_title, ShareCardText.monthName(v.share)),
            style = MaterialTheme.typography.titleMedium,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Ring(
                fraction = (score ?: 0) / 100f, progress = progress, startColor = scheme.primary, endColor = scheme.tertiary,
                trackColor = scheme.surfaceVariant,
                summary = if (score == null) stringResource(R.string.log_score_summary_none) else stringResource(R.string.log_score_summary, score),
            ) {
                Text(
                    if (score == null) stringResource(R.string.ins_none_value) else stringResource(R.string.log_score_value, score),
                    style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    if (score == null) stringResource(R.string.log_score_not_enough) else stringResource(R.string.log_score_days, v.score.qualifyingDays),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onShareText, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text(stringResource(R.string.log_share)) }
            if (onShareImage != null) {
                OutlinedButton(onClick = onShareImage, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text(stringResource(R.string.log_share_picture)) }
            }
        }
    }
}

@Composable
private fun BandCard(vm: PowerLogViewModel) {
    val chosen = vm.band
    val promise = vm.view?.promise
    LogCard {
        Text(stringResource(R.string.band_picker_title), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.band_picker_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = chosen == null, onClick = { vm.chooseBand(null) }, label = { Text(stringResource(R.string.band_none)) }, modifier = Modifier.heightIn(min = 48.dp))
            vm.bands.forEach { b ->
                FilterChip(selected = chosen?.id == b.id, onClick = { vm.chooseBand(b.id) }, label = { Text(stringResource(R.string.band_name, b.id)) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }
        if (chosen != null) {
            Text(stringResource(R.string.band_promise, chosen.id, chosen.promisedMinHoursPerDay))
            if (!chosen.verified) Text(stringResource(R.string.band_promise_unconfirmed), style = MaterialTheme.typography.bodySmall)
            if (promise?.avgPowerHours != null) {
                Text(
                    when {
                        promise.daysBelow > 0 -> stringResource(R.string.promise_days_below, promise.daysBelow)
                        promise.avgPowerHours < promise.promisedHours -> stringResource(R.string.promise_avg_below, promise.promisedHours - promise.avgPowerHours)
                        else -> stringResource(R.string.promise_met)
                    },
                )
                Text(stringResource(R.string.promise_estimate_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Text fallback of the share card (R8.4): the same facts as the picture, no location, name or ID (R8.2). */
private fun shareText(ctx: Context, v: PowerLogView) {
    val text = ShareCardText.build(ctx, v.share)
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
    ctx.startActivity(Intent.createChooser(send, ctx.getString(R.string.log_share_chooser)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
