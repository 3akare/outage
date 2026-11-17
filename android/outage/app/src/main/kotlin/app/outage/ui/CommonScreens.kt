package app.outage.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.map.DemoAreaMap
import app.outage.map.DemoCity
import app.outage.map.HexGeoJson
import kotlinx.coroutines.launch

/** The top of a pushed screen: a back row, then the screen's large title (iOS navigation). The back row is a 48 dp target (R6.4). */
@Composable
fun SubScreenHeader(titleRes: Int, onBack: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Day.page)) {
        BackRow(onBack)
        LargeTitle(stringResource(titleRes), top = 0.dp)
    }
}

/** The large title of a top-level destination (Insights, Settings). */
@Composable
fun DestinationTitle(titleRes: Int, trailing: @Composable () -> Unit = {}) {
    LargeTitle(stringResource(titleRes), top = 20.dp) { trailing() }
}

/** Shown for any slot whose feature is not built yet (R3.2). Never crashes. */
@Composable
fun ComingSoonScreen(titleRes: Int, onBack: (() -> Unit)?) {
    DayPage(title = stringResource(titleRes), onBack = onBack) {
        DayCard(padding = 20.dp) {
            Text(stringResource(R.string.coming_soon), style = DayType.title3, color = Day.ink)
            Text(stringResource(R.string.coming_soon_body), style = DayType.callout, color = Day.ink2, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

@Composable
fun AboutScreen(onBack: () -> Unit) {
    DayPage(title = stringResource(R.string.settings_about), onBack = onBack) {
        DayCard(padding = 20.dp) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(10.dp)).background(Day.ink).padding(10.dp)) { Mark(Day.onInk, 24.dp) }
                Text(stringResource(R.string.app_name), style = DayType.title2, color = Day.ink)
            }
            Text(stringResource(R.string.about_what), style = DayType.callout, color = Day.ink2, modifier = Modifier.padding(top = 14.dp))
        }
        GroupHeader(stringResource(R.string.settings_group_about))
        DayCard {
            AboutLine(R.drawable.ic_sym_place, Tokens.Colors.tileBlue, R.string.privacy_cell)
            RowDivider(TileInset)
            AboutLine(R.drawable.ic_sym_lock, Tokens.Colors.tileGrey, R.string.privacy_anonymous)
            RowDivider(TileInset)
            AboutLine(R.drawable.ic_sym_shield, Tokens.Colors.tileGreen, R.string.privacy_sensors)
            RowDivider(TileInset)
            AboutLine(R.drawable.ic_sym_delete, Tokens.Colors.tileRed, R.string.privacy_delete)
        }
    }
}

@Composable
private fun AboutLine(icon: Int, color: androidx.compose.ui.graphics.Color, text: Int) {
    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        IconTile(icon, color)
        Text(stringResource(text), style = DayType.subhead, color = Day.ink2, modifier = Modifier.weight(1f))
    }
}

/** What first run found when it looked for the spot. [area] is the place name to show, never a coordinate. */
sealed interface SpotOutcome {
    data class Saved(val area: String?) : SpotOutcome
    data object NotFound : SpotOutcome
    data object Denied : SpotOutcome
    data object Skipped : SpotOutcome
}

/**
 * First run (ADR 0050, ADR 0054): one welcome screen. The street map of Lagos sits in a rounded card at the top; under it the
 * promise, one privacy line and the actions. "Use my location" records consent, asks for coarse location once, turns it
 * into a map cell and drops it (onboarding O2, ADR 0037), then asks for notifications where the phone needs it. "Not now"
 * skips the location. Either way the app opens on Now. [finish] records consent; [locate] reads the position once and
 * saves the cell.
 */
@Composable
fun FirstRunScreen(finish: () -> Boolean, locate: suspend () -> SpotOutcome, onDone: (SpotOutcome) -> Unit, onTryJudge: (() -> Unit)? = null) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var outcome by remember { mutableStateOf<SpotOutcome>(SpotOutcome.Skipped) }
    // https://developer.android.com/training/permissions/requesting (POST_NOTIFICATIONS is a runtime permission from API 33)
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { onDone(outcome) }
    fun next(o: SpotOutcome) {
        outcome = o
        busy = false
        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS) else onDone(o)
    }
    val askLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) next(SpotOutcome.Denied) else scope.launch { next(locate()) }
    }
    // The real street map of Lagos with the simulated blocks (ADR 0053). It flies to Yaba when the person chooses
    // "Use my location", like a maps app finding them; the saved spot comes from [locate], never from here.
    val demo = remember { DemoAreaMap.build(System.currentTimeMillis()) }
    val states = remember(demo) { demo.cells.associate { it.id to it.state } }
    val camera = remember { OutageMapController() }
    LaunchedEffect(Unit) { camera.flyTo(LAGOS, CITY_ZOOM - 0.4) }
    LaunchedEffect(busy) {
        if (busy) demo.cell(DemoCity.SPOT)?.let { camera.flyTo(HexGeoJson.centre(it), SPOT_ZOOM - 0.5, 2400) }
    }
    BoxWithConstraints(Modifier.fillMaxSize().background(Day.page)) {
        val screenH = maxHeight
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).heightIn(min = screenH).statusBarsPadding().padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            Box(Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 12.dp).clip(RoundedCornerShape(Tokens.cornerXl))) {
                OutageMap(
                    demo.cells, states, spotId = null, selectedId = null, controller = camera,
                    modifier = Modifier.fillMaxWidth().height(screenH * 0.36f), interactive = false,
                )
            }
            Column(Modifier.padding(horizontal = Gutter, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.clip(RoundedCornerShape(12.dp)).background(Day.ink).padding(10.dp)) { Mark(Day.onInk, 28.dp) }
                Text(stringResource(R.string.first_run_title), style = DayType.largeTitle, color = Day.ink, modifier = Modifier.padding(top = 8.dp))
                Text(stringResource(R.string.first_run_body), style = DayType.body, color = Day.ink2)
            }
            DayCard {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    IconTile(R.drawable.ic_sym_place, Tokens.Colors.tileBlue)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(stringResource(R.string.first_run_location_title), style = DayType.headline, color = Day.ink)
                        Text(stringResource(R.string.first_run_privacy), style = DayType.subhead, color = Day.muted)
                    }
                }
            }
            Gap(20.dp)
            ActionStack {
                if (busy) {
                    Text(stringResource(R.string.spot_locating), style = DayType.subhead, color = Day.muted, modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp))
                }
                InkButton(
                    stringResource(R.string.first_run_use_location),
                    onClick = {
                        if (busy || !finish()) return@InkButton
                        busy = true
                        askLocation.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    busy = busy,
                )
                // demo-mode R1.1, R1.2: Judge mode from the first screen, with no consent, permission or network.
                if (onTryJudge != null) {
                    FillButton(stringResource(R.string.demo_try), onTryJudge, Modifier.fillMaxWidth(), enabled = !busy)
                }
                TextAction(
                    stringResource(R.string.first_run_not_now),
                    onClick = { if (!busy && finish()) next(SpotOutcome.Skipped) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                )
            }
        }
    }
}
