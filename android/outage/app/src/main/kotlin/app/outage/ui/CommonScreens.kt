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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.map.DemoAreaMap
import app.outage.places.PlacePick

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
        // Licences of what ships inside the app (assets/licenses): the ward and LGA boundaries, the street map, the typeface.
        GroupHeader(stringResource(R.string.about_licences))
        DayCard {
            AboutLine(R.drawable.ic_sym_map, Tokens.Colors.tileGreen, R.string.about_grid3)
            RowDivider(TileInset)
            AboutLine(R.drawable.ic_sym_layers, Tokens.Colors.tileBlue, R.string.about_osm)
            RowDivider(TileInset)
            AboutLine(R.drawable.ic_sym_info, Tokens.Colors.tileGrey, R.string.about_inter)
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

/**
 * First run (ADR 0050, ADR 0054, ADR 0056): one welcome screen. The street map of Lagos sits in a rounded card at the top;
 * under it the promise, one privacy line and the actions. "Choose my area" records consent and opens [PlacePicker]: local
 * government, ward, and the hexagon for a large ward. No location is read and no location permission exists. Then the
 * phone asks for notifications where it needs to. "Not now" skips the area. Either way the app opens on Now. [finish]
 * records consent; [save] stores the picked cell and its name; [onDone] gets the saved "Ward, LGA", or null when skipped.
 */
@Composable
fun FirstRunScreen(finish: () -> Boolean, save: (PlacePick) -> Boolean, onDone: (String?) -> Unit, onTryJudge: (() -> Unit)? = null) {
    var picking by rememberSaveable { mutableStateOf(false) }
    var saved by remember { mutableStateOf<String?>(null) }
    // https://developer.android.com/training/permissions/requesting (POST_NOTIFICATIONS is a runtime permission from API 33)
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { onDone(saved) }
    fun next(area: String?) {
        saved = area
        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS) else onDone(area)
    }
    if (picking) {
        Box(Modifier.fillMaxSize().background(Day.page).statusBarsPadding()) {
            PlacePicker(
                onPicked = { pick -> if (save(pick)) { picking = false; next(pick.areaName) } },
                onExit = { picking = false },
            )
        }
        return
    }
    // The real street map of Lagos with the simulated blocks (ADR 0053), as a picture of what the app does.
    val demo = remember { DemoAreaMap.build(System.currentTimeMillis()) }
    val states = remember(demo) { demo.cells.associate { it.id to it.state } }
    val camera = remember { OutageMapController() }
    LaunchedEffect(Unit) { camera.flyTo(LAGOS, CITY_ZOOM - 0.4) }
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
                        Text(stringResource(R.string.first_run_area_title), style = DayType.headline, color = Day.ink)
                        Text(stringResource(R.string.first_run_privacy), style = DayType.subhead, color = Day.muted)
                    }
                }
            }
            Gap(20.dp)
            ActionStack {
                InkButton(
                    stringResource(R.string.first_run_choose_area),
                    onClick = { if (finish()) picking = true },
                    modifier = Modifier.fillMaxWidth(),
                )
                // demo-mode R1.1, R1.2: Judge mode from the first screen, with no consent, permission or network.
                if (onTryJudge != null) {
                    FillButton(stringResource(R.string.demo_try), onTryJudge, Modifier.fillMaxWidth())
                }
                TextAction(
                    stringResource(R.string.first_run_not_now),
                    onClick = { if (finish()) next(null) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
