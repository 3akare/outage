package app.outage.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.map.AreaMap
import app.outage.map.HexGrid
import app.outage.map.MapProjection
import app.outage.map.WorldPoint
import app.outage.onboarding.LocationSource
import app.outage.onboarding.Spot
import app.outage.onboarding.SpotChoice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The spot as the screen sees it. Never a coordinate. */
data class SpotState(val cell: String?, val areaName: String?, val postcode: String?)

private sealed interface Stage {
    data object Idle : Stage
    data object Locating : Stage
    data class Confirm(val choice: SpotChoice) : Stage
    data object PickArea : Stage
    data class PickCell(val areaSlug: String) : Stage
}

/**
 * Settings, "Your spot" and the Now row "Choose your area" (onboarding R3, ADR 0030). Location is asked here, in
 * context, with one coarse permission, read once, turned into a block of the published map and dropped (O2). The map
 * pick lists the neighbourhoods, then draws the blocks of one for a tap (R3.5). [save] stores the cell only.
 * [below] is the follow section, shown under the spot.
 */
@Composable
fun SpotScreen(
    loadMap: suspend () -> AreaMap?,
    current: () -> SpotState,
    save: (SpotChoice, String?) -> Boolean,
    below: @Composable (SpotState) -> Unit,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var spot by remember { mutableStateOf(current()) }
    var map by remember { mutableStateOf<AreaMap?>(null) }
    var stage by remember { mutableStateOf<Stage>(Stage.Idle) }
    var message by remember { mutableStateOf<Int?>(null) }
    var postcode by remember { mutableStateOf(spot.postcode.orEmpty()) }
    LaunchedEffect(Unit) { map = loadMap() }

    fun commit(choice: SpotChoice) {
        val cleanPostcode = postcode.filter { it.isLetterOrDigit() }.take(4).ifBlank { null }
        if (!Spot.isRealCell(choice.cell)) { message = R.string.spot_sample_note; stage = Stage.Idle; return }
        if (save(choice, cleanPostcode)) spot = current()
        stage = Stage.Idle
    }

    fun locate() {
        stage = Stage.Locating
        scope.launch {
            val fix = withContext(Dispatchers.IO) { LocationSource.readOnce(ctx) }
            val m = map ?: loadMap().also { map = it }
            // The position is used in this one call and dropped with it (O2).
            val choice = if (fix != null && m != null) Spot.resolve(m, fix.lat, fix.lng, fix.mocked) else null
            if (choice == null) { message = R.string.spot_not_found; stage = Stage.Idle }
            else if (choice.needsConfirm) stage = Stage.Confirm(choice)
            else commit(choice)
        }
    }
    val askLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) locate() else { message = R.string.spot_denied; stage = Stage.Idle }
    }

    FeaturePage(R.string.spot_title) {
        DayCard {
            DayRow(
                when {
                    spot.cell == null -> stringResource(R.string.spot_none)
                    spot.areaName != null -> stringResource(R.string.spot_current, spot.areaName!!)
                    else -> stringResource(R.string.spot_current_unnamed)
                },
                tile = R.drawable.ic_sym_place to Tokens.Colors.tileBlue,
            )
        }
        message?.let { GroupFooter(stringResource(it)) }
        if (map?.simulated == true) GroupFooter(stringResource(R.string.spot_sample_note))
        Gap(20.dp)

        when (val s = stage) {
            Stage.Idle -> {
                ActionStack {
                    InkButton(
                        stringResource(R.string.spot_use_location),
                        onClick = {
                            message = null
                            if (LocationSource.hasPermission(ctx)) locate() else askLocation.launch(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    FillButton(stringResource(R.string.spot_pick_map), { message = null; stage = Stage.PickArea }, Modifier.fillMaxWidth())
                }
                GroupFooter(stringResource(R.string.spot_privacy))
                GroupHeader(stringResource(R.string.spot_postcode))
                DayCard {
                    val label = stringResource(R.string.spot_postcode)
                    BasicTextField(
                        value = postcode,
                        onValueChange = { postcode = it.filter { c -> c.isLetterOrDigit() }.take(4) },
                        singleLine = true,
                        textStyle = DayType.body.copy(color = Day.ink),
                        cursorBrush = SolidColor(Day.focus),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 16.dp, vertical = 15.dp).semantics { contentDescription = label },
                    )
                }
                GroupFooter(stringResource(R.string.spot_postcode_hint))
            }
            Stage.Locating -> {
                ActionStack { InkButton(stringResource(R.string.spot_locating), {}, Modifier.fillMaxWidth(), busy = true) }
            }
            is Stage.Confirm -> {
                PageText(stringResource(R.string.spot_mocked_ask, s.choice.areaName.orEmpty()), color = Day.ink, style = DayType.body)
                Gap()
                ActionStack {
                    InkButton(stringResource(R.string.spot_confirm_yes), { commit(s.choice) }, Modifier.fillMaxWidth())
                    FillButton(stringResource(R.string.spot_confirm_no), { stage = Stage.PickArea }, Modifier.fillMaxWidth())
                }
            }
            Stage.PickArea -> {
                Row(Modifier.fillMaxWidth().padding(end = Gutter - 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { GroupHeader(stringResource(R.string.spot_pick_area)) }
                    TextAction(stringResource(R.string.spot_cancel), { stage = Stage.Idle })
                }
                val m = map
                DayCard {
                    if (m == null) DayRow(stringResource(R.string.spot_locating))
                    else m.areas.forEachIndexed { i, area ->
                        if (i > 0) RowDivider()
                        DayRow(area.name, chevron = true) { stage = Stage.PickCell(area.slug) }
                    }
                }
            }
            is Stage.PickCell -> {
                val m = map
                val area = m?.area(s.areaSlug)
                Row(Modifier.fillMaxWidth().padding(end = Gutter - 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { GroupHeader(stringResource(R.string.spot_pick_cell)) }
                    TextAction(stringResource(R.string.back), { stage = Stage.PickArea })
                }
                if (m != null && area != null) {
                    DayCard(padding = 8.dp) {
                        CellPicker(m, s.areaSlug, area.name) { id -> Spot.choose(m, id)?.let(::commit) }
                    }
                }
            }
        }
        Gap(8.dp)
        below(spot)
    }
}

/** A hex grid of one neighbourhood's blocks. A tap picks the block under the finger (onboarding R3.5). */
@Composable
private fun CellPicker(map: AreaMap, areaSlug: String, areaName: String, onPick: (String) -> Unit) {
    val cells = remember(map, areaSlug) { Spot.cellsOf(map, areaSlug) }
    val grid = remember(cells) { HexGrid.build(map.copy(cells = cells), MapProjection.forCells(cells)) }
    val desc = stringResource(R.string.spot_grid_desc, areaName)
    val fill = Day.fill
    val line = Day.card
    Canvas(
        Modifier.fillMaxWidth().height(320.dp).semantics { contentDescription = desc }
            .pointerInput(grid) {
                detectTapGestures { tap ->
                    val b = grid.bounds ?: return@detectTapGestures
                    val t = fit(b.minX, b.minY, b.width, b.height, size.width.toFloat(), size.height.toFloat())
                    val world = WorldPoint((tap.x - t.ox) / t.scale + b.minX, (tap.y - t.oy) / t.scale + b.minY)
                    grid.hitTest(world)?.let { onPick(it.id) }
                }
            },
    ) {
        val b = grid.bounds ?: return@Canvas
        val t = fit(b.minX, b.minY, b.width, b.height, size.width, size.height)
        grid.shapes.forEach { shape ->
            val path = Path()
            shape.points.forEachIndexed { i, p ->
                val x = ((p.x - b.minX) * t.scale + t.ox).toFloat()
                val y = ((p.y - b.minY) * t.scale + t.oy).toFloat()
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            path.close()
            drawPath(path, fill, style = Fill)
            drawPath(path, line, style = Stroke(width = 3f))
        }
    }
}

private class Fit(val scale: Double, val ox: Double, val oy: Double)

private fun fit(minX: Double, minY: Double, w: Double, h: Double, cw: Float, ch: Float): Fit {
    val pad = 16.0
    val scale = minOf((cw - 2 * pad) / maxOf(w, 1e-9), (ch - 2 * pad) / maxOf(h, 1e-9))
    return Fit(scale, pad + (cw - 2 * pad - w * scale) / 2, pad + (ch - 2 * pad - h * scale) / 2)
}
