package app.outage.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
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

/**
 * Home: "Is my power on?" (R2), laid out like a maps app (ADR 0050). The power map fills the screen; a sheet holds the
 * spot card at its peek and the feed when pulled up. Reads state only; starts nothing.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    vm: HomeViewModel,
    scroll: ScrollState,
    onOpenAlarm: () -> Unit,
    onOpenSetup: (String) -> Unit,
    band: () -> Pair<String, Int>?,
    map: @Composable () -> Unit,
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
    val density = LocalDensity.current
    var peek by remember { mutableStateOf(220.dp) }
    // https://developer.android.com/develop/ui/compose/components/bottom-sheets
    BottomSheetScaffold(
        sheetPeekHeight = peek,
        sheetContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        sheetShadowElevation = 3.dp,
        sheetContent = {
            HomeContent(state, scroll, onOpenAlarm, onOpenSetup, band(), homeCard) { cardPx ->
                // Peek shows the drag handle (48 dp) and the whole spot card.
                peek = with(density) { cardPx.toDp() } + 64.dp
            }
        },
    ) {
        CompositionLocalProvider(LocalMapBottomInset provides peek) {
            Box(Modifier.fillMaxSize()) { map() }
        }
    }
}

@Composable
fun HomeContent(
    state: HomeUiState,
    scroll: ScrollState,
    onOpenAlarm: () -> Unit,
    onOpenSetup: (String) -> Unit,
    band: Pair<String, Int>?,
    homeCard: @Composable () -> Unit = {},
    onPeekMeasured: (Int) -> Unit = {},
) {
    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(scroll).padding(start = 16.dp, end = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.onGloballyPositioned { onPeekMeasured(it.size.height + it.positionInParent().y.toInt()) }) { SpotStatusCard(state, band) }
        if (state.area == null) {
            SetupCard(R.drawable.ic_status_person_pin, R.string.setup_area_title, R.string.setup_area_body) { onOpenSetup("followed_area") }
        }
        if (state.sensor.kind == SensorKind.NOT_ARMED) {
            SetupCard(R.drawable.ic_sensor_not_armed, R.string.setup_battery_title, R.string.setup_battery_body) { onOpenSetup("battery") }
        }
        homeCard()
        state.todayPowerHours?.let { PowerTodayCard(it, band) }
        state.alarm?.let { alarm ->
            ListCard(R.drawable.ic_status_power_on, stringResource(R.string.alarm_title), stringResource(StatusRes.alarmLabel(alarm)), onOpenAlarm)
        }
        ListCard(R.drawable.ic_sym_insights, stringResource(R.string.home_log_title), stringResource(R.string.home_log_body)) { onOpenSetup(FeatureRegistry.LOG) }
    }
}

/** A row in the feed: leading icon in a tonal circle, title and one line. A 56 dp target. */
@Composable
private fun ListCard(icon: Int, title: String, body: String, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(Modifier.size(40.dp).background(MaterialTheme.colorScheme.secondaryContainer, CircleShape), contentAlignment = Alignment.Center) {
                Image(painterResource(icon), null, Modifier.size(24.dp), colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSecondaryContainer))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** A setup step that used to block first run. It waits here until done, and the card disappears once it is (ADR 0026). */
@Composable
private fun SetupCard(icon: Int, titleRes: Int, bodyRes: Int, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Image(painterResource(icon), null, Modifier.size(24.dp), colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onPrimaryContainer))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(stringResource(titleRes), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(bodyRes), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun SpotStatusCard(state: HomeUiState, band: Pair<String, Int>?) {
    val area = state.area
    val style = area?.let { StatusStyle.of(it.level) }
    val family = area?.let { StatusRes.colors(it.level, LocalStatusColors.current) }
    val container = family?.container ?: MaterialTheme.colorScheme.surfaceContainerHighest
    val content = family?.onContainer ?: MaterialTheme.colorScheme.onSurfaceVariant
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.extraLarge,
        colors = CardDefaults.cardColors(containerColor = container, contentColor = content),
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(stringResource(R.string.home_spot_title), style = MaterialTheme.typography.titleSmall)
            // Icon and text label both carry the status, never colour alone (R6.2).
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Image(
                    painter = painterResource(style?.let { StatusRes.icon(it.icon) } ?: R.drawable.ic_status_help),
                    contentDescription = null,
                    modifier = Modifier.size(36.dp),
                    colorFilter = ColorFilter.tint(content),
                )
                Text(
                    text = if (area != null) stringResource(StatusRes.label(area.level)) else stringResource(R.string.area_none),
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.weight(1f),
                )
            }
            state.ageMinutes?.let { minutes ->
                val (res, n) = StatusRes.age(AgeLabel.of(minutes))
                Text(if (n == null) stringResource(res) else stringResource(res, n), style = MaterialTheme.typography.bodyMedium)
            }
            if (state.offline) LabelRow(R.drawable.ic_offline, R.string.offline, content)
            if (state.simulated) LabelRow(R.drawable.ic_simulated, R.string.simulated, content)
            // Small facts as chips, like the web: the sensor, and the tariff band when one is chosen.
            Row(Modifier.padding(top = 6.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FactChip(StatusRes.sensorIcon(state.sensor.kind), stringResource(StatusRes.sensorLabel(state.sensor.kind)), content)
                band?.let { (name, hours) -> FactChip(R.drawable.ic_status_power_on, stringResource(R.string.home_band_chip, name, hours), content) }
            }
        }
    }
}

@Composable
private fun FactChip(icon: Int, text: String, tint: Color) {
    Row(
        Modifier.heightIn(min = 32.dp).border(1.dp, tint.copy(alpha = 0.35f), RoundedCornerShape(8.dp)).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Image(painterResource(icon), null, Modifier.size(18.dp), colorFilter = ColorFilter.tint(tint))
        Text(text, style = MaterialTheme.typography.labelLarge)
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
private fun PowerTodayCard(hours: Double, band: Pair<String, Int>?) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.power_today), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(R.string.power_hours_value, hours), style = MaterialTheme.typography.headlineSmall)
            band?.let { (name, h) -> Text(stringResource(R.string.band_promise, name, h), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}
