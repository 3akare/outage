package app.outage.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import app.outage.R
import app.outage.sensor.SensorKind
import app.outage.shell.AgeLabel
import app.outage.shell.HomeUiState
import app.outage.shell.StatusStyle
import kotlinx.coroutines.delay

private const val REFRESH_MS = 60_000L

/** Home: "Is my power on?" (R2). Reads state only; starts nothing. */
@Composable
fun HomeScreen(vm: HomeViewModel, scroll: ScrollState, onOpenAlarm: () -> Unit, onOpenSetup: (String) -> Unit, hero: @Composable () -> Unit) {
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
    HomeContent(state, scroll, onOpenAlarm, onOpenSetup, hero)
}

@Composable
fun HomeContent(state: HomeUiState, scroll: ScrollState, onOpenAlarm: () -> Unit, onOpenSetup: (String) -> Unit, hero: @Composable () -> Unit) {
    // The map comes first and fills the width, the feed sits below it (ADR 0026).
    Column(modifier = Modifier.fillMaxWidth().verticalScroll(scroll)) {
        hero()
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
        SpotStatusCard(state)
        if (state.sensor.kind == SensorKind.NOT_ARMED) {
            SetupCard(R.string.setup_battery_title, R.string.setup_battery_body) { onOpenSetup("battery") }
        }
        if (state.area == null) {
            SetupCard(R.string.setup_area_title, R.string.setup_area_body) { onOpenSetup("followed_area") }
        }
        SensorCard(state)
        state.todayPowerHours?.let { PowerTodayCard(it) }
        Card(onClick = { onOpenSetup(FeatureRegistry.LOG) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.home_log_title), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.home_log_body), style = MaterialTheme.typography.bodyMedium)
            }
        }
        state.alarm?.let { alarm ->
            Card(onClick = onOpenAlarm, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(stringResource(R.string.alarm_title), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(StatusRes.alarmLabel(alarm)), style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
        }
    }
}

/** A setup step that used to block first run. It waits here until done, and the card disappears once it is (ADR 0026). */
@Composable
private fun SetupCard(titleRes: Int, bodyRes: Int, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(titleRes), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(bodyRes), style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun SpotStatusCard(state: HomeUiState) {
    val scheme = MaterialTheme.colorScheme
    val area = state.area
    val style = area?.let { StatusStyle.of(it.level) }
    val container = style?.let { StatusRes.container(it.role, scheme) } ?: scheme.surfaceVariant
    val content = style?.let { StatusRes.onContainer(it.role, scheme) } ?: scheme.onSurfaceVariant
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = container, contentColor = content),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.home_spot_title), style = MaterialTheme.typography.titleMedium)
            // Icon and text label both carry the status, never colour alone (R6.2).
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Image(
                    painter = painterResource(style?.let { StatusRes.icon(it.icon) } ?: R.drawable.ic_status_help),
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    colorFilter = ColorFilter.tint(content),
                )
                Text(
                    text = if (area != null) stringResource(StatusRes.label(area.level)) else stringResource(R.string.area_none),
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.weight(1f),
                )
            }
            state.ageMinutes?.let { minutes ->
                val (res, n) = StatusRes.age(AgeLabel.of(minutes))
                Text(if (n == null) stringResource(res) else stringResource(res, n), style = MaterialTheme.typography.bodyLarge)
            }
            if (state.offline) LabelRow(R.drawable.ic_offline, R.string.offline, content)
            if (state.simulated) LabelRow(R.drawable.ic_simulated, R.string.simulated, content)
        }
    }
}

@Composable
private fun LabelRow(icon: Int, label: Int, tint: Color) {
    Row(
        modifier = Modifier.heightIn(min = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Image(painterResource(icon), contentDescription = null, modifier = Modifier.size(20.dp), colorFilter = ColorFilter.tint(tint))
        Text(stringResource(label), style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun SensorCard(state: HomeUiState) {
    val tint = MaterialTheme.colorScheme.onSurface
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Image(
                painter = painterResource(StatusRes.sensorIcon(state.sensor.kind)),
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                colorFilter = ColorFilter.tint(tint),
            )
            Column(Modifier.weight(1f)) {
                Text(stringResource(StatusRes.sensorLabel(state.sensor.kind)), style = MaterialTheme.typography.titleMedium)
                val reason = state.sensor.reason
                if (state.sensor.kind == SensorKind.NOT_ARMED && reason != null) {
                    Text(stringResource(StatusRes.reason(reason)), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun PowerTodayCard(hours: Double) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.power_today), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.power_hours_value, hours), style = MaterialTheme.typography.headlineSmall)
        }
    }
}
