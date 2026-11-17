package app.outage.ui

import androidx.compose.foundation.ScrollState
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import app.outage.R
import app.outage.sensor.SensorKind
import app.outage.shell.AgeLabel
import app.outage.shell.HomeUiState
import app.outage.shell.StatusLevel
import kotlinx.coroutines.delay

private const val REFRESH_MS = 60_000L

/**
 * Now (R2, ADR 0054): "Is my power on?" answered in one glance. A large title with the spot's name, the status hero with
 * the state word set huge in its colour, then grouped rows for today, the Light Alarm, the log and the map.
 * Reads state only; starts nothing.
 */
@Composable
fun HomeScreen(
    vm: HomeViewModel,
    scroll: ScrollState,
    onOpenAlarm: () -> Unit,
    onOpenSetup: (String) -> Unit,
    onOpenMap: () -> Unit,
    band: () -> Pair<String, Int>?,
    spotName: () -> String? = { null },
    homeCard: @Composable () -> Unit,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    // Refresh when the screen is visible, then once a minute so "Updated 2 min ago" stays true.
    // https://developer.android.com/topic/libraries/architecture/coroutines#repeatOnLifecycle
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                vm.refresh()
                delay(REFRESH_MS)
            }
        }
    }
    val name = remember(state.area) { spotName() }
    DayPage(scroll = scroll) {
        LargeTitle(name ?: stringResource(R.string.nav_now), supporting = stringResource(if (name != null) R.string.now_your_spot else R.string.now_no_spot), top = 20.dp)
        HomeContent(state, onOpenAlarm, onOpenSetup, onOpenMap, band(), homeCard)
    }
}

@Composable
fun HomeContent(
    state: HomeUiState,
    onOpenAlarm: () -> Unit,
    onOpenSetup: (String) -> Unit,
    onOpenMap: () -> Unit,
    band: Pair<String, Int>?,
    homeCard: @Composable () -> Unit = {},
) {
    StatusHero(state)

    // Steps that used to block first run wait here until done, and go once they are (ADR 0026).
    val needsArea = state.area == null
    val needsSensor = state.sensor.kind == SensorKind.NOT_ARMED
    if (needsArea || needsSensor) {
        GroupHeader(stringResource(R.string.now_set_up))
        DayCard {
            if (needsArea) {
                DayRow(stringResource(R.string.setup_area_title), stringResource(R.string.setup_area_body), tile = R.drawable.ic_sym_place to Tokens.Colors.tileBlue, chevron = true) { onOpenSetup("followed_area") }
            }
            if (needsArea && needsSensor) RowDivider(TileInset)
            if (needsSensor) {
                DayRow(stringResource(R.string.setup_battery_title), stringResource(R.string.setup_battery_body), tile = R.drawable.ic_sym_battery to Tokens.Colors.tileGreen, chevron = true) { onOpenSetup("battery") }
            }
        }
    }

    Gap(4.dp)
    homeCard()

    GroupHeader(stringResource(R.string.now_group_today))
    DayCard {
        state.todayPowerHours?.let { hours ->
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(stringResource(R.string.power_today), style = DayType.body, color = Day.ink, modifier = Modifier.weight(1f))
                    Text(
                        if (band != null) stringResource(R.string.now_hours_promise, hours, band.second) else stringResource(R.string.now_hours_value, hours),
                        style = DayType.subhead, color = Day.muted,
                    )
                }
                val promise = band?.second
                val met = promise == null || hours >= promise
                MeterBar(
                    fraction = (hours / 24.0).toFloat(),
                    color = if (met) Tokens.Map.normal else Tokens.Map.possible,
                    marker = promise?.let { it / 24f },
                )
            }
            RowDivider(16.dp)
        }
        DayRow(
            stringResource(R.string.now_sensor),
            tile = R.drawable.ic_sym_bolt to if (state.sensor.kind == SensorKind.ARMED) Tokens.Colors.tileGreen else Tokens.Colors.tileGrey,
            value = stringResource(StatusRes.sensorLabel(state.sensor.kind)),
            chevron = true,
        ) { onOpenSetup("sensor") }
        state.alarm?.let { alarm ->
            RowDivider(TileInset)
            DayRow(
                stringResource(R.string.alarm_title),
                tile = R.drawable.ic_sym_alarm to Tokens.Colors.tileRed,
                value = stringResource(StatusRes.alarmLabel(alarm)),
                chevron = true,
                onClick = onOpenAlarm,
            )
        }
        band?.let { (b, _) ->
            RowDivider(TileInset)
            DayRow(stringResource(R.string.band_picker_title), tile = R.drawable.ic_sym_receipt to Tokens.Colors.tileOrange, value = stringResource(R.string.band_name, b), chevron = true) {
                onOpenSetup(FeatureRegistry.LOG)
            }
        }
    }

    GroupHeader(stringResource(R.string.now_group_more))
    DayCard {
        DayRow(stringResource(R.string.now_see_map), stringResource(R.string.now_see_map_body), tile = R.drawable.ic_sym_map to Tokens.Colors.tileBlue, chevron = true, onClick = onOpenMap)
        RowDivider(TileInset)
        DayRow(stringResource(R.string.home_log_title), stringResource(R.string.home_log_body), tile = R.drawable.ic_sym_insights to Tokens.Colors.tileIndigo, chevron = true) {
            onOpenSetup(FeatureRegistry.LOG)
        }
    }
}

/** The status word for a level, short enough to set at display size. */
fun nowWord(level: StatusLevel?): Int = when (level) {
    StatusLevel.NORMAL -> R.string.now_word_normal
    StatusLevel.SPOT_ONLY -> R.string.now_word_spot_only
    StatusLevel.POSSIBLE -> R.string.now_word_possible
    StatusLevel.CONFIRMED -> R.string.now_word_confirmed
    StatusLevel.RESTORED -> R.string.now_word_restored
    null -> R.string.now_word_unknown
}

private fun nowNote(level: StatusLevel?): Int = when (level) {
    StatusLevel.NORMAL -> R.string.now_note_normal
    StatusLevel.SPOT_ONLY -> R.string.now_note_spot_only
    StatusLevel.POSSIBLE -> R.string.now_note_possible
    StatusLevel.CONFIRMED -> R.string.now_note_confirmed
    StatusLevel.RESTORED -> R.string.now_note_restored
    null -> R.string.now_note_unknown
}

/** Which of the four steps (On, Maybe, Out, Back) a level sits on. */
private fun step(level: StatusLevel?): Int = when (level) {
    null -> -1
    StatusLevel.NORMAL -> 0
    StatusLevel.SPOT_ONLY, StatusLevel.POSSIBLE -> 1
    StatusLevel.CONFIRMED -> 2
    StatusLevel.RESTORED -> 3
}

/**
 * The status hero: the top of the card is the state's pale tint holding the tinted mark, "Power is" and the state word in
 * display type in the state's strong colour; under it, the four-step track and how fresh the news is. The word and the
 * step label carry the state, never colour alone (R6.2).
 */
@Composable
fun StatusHero(state: HomeUiState) {
    val level = state.area?.level
    val s = LocalStatusColors.current
    val family = level?.let { StatusRes.colors(it, s) }
    val strong = family?.color ?: Day.muted
    val tint = family?.container ?: Day.fill
    DayCard {
        Column(Modifier.fillMaxWidth().background(tint).padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Mark(strong, 24.dp)
                Text(stringResource(R.string.now_power_is), style = DayType.headline, color = family?.onContainer ?: Day.ink2, modifier = Modifier.weight(1f))
                if (state.simulated) StatePill(stringResource(R.string.simulated), s.possible)
                if (state.offline) StatePill(stringResource(R.string.offline), StateColors(Day.muted, Day.onInk, Day.card, Day.ink2))
            }
            Text(
                stringResource(nowWord(level)),
                style = DayType.displayNum, color = strong,
                modifier = Modifier.padding(top = 6.dp).semantics { heading() },
            )
            Text(stringResource(nowNote(level)), style = DayType.callout, color = family?.onContainer ?: Day.ink2, modifier = Modifier.padding(top = 6.dp))
        }
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            StepTrack(
                current = step(level),
                labels = listOf(
                    stringResource(R.string.now_step_on), stringResource(R.string.now_step_maybe),
                    stringResource(R.string.now_step_out), stringResource(R.string.now_step_back),
                ),
                colors = listOf(s.normal.color, s.possible.color, s.confirmed.color, s.restored.color),
            )
            state.ageMinutes?.let { minutes ->
                val (res, n) = StatusRes.age(AgeLabel.of(minutes))
                Text(if (n == null) stringResource(res) else stringResource(res, n), style = DayType.footnote, color = Day.muted)
            }
        }
    }
}
