package app.outage.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
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
 * Settings, "Your spot" and the Home card "Choose your area" (onboarding R3, ADR 0030). Location is asked here, in
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

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.spot_title), style = MaterialTheme.typography.headlineSmall)
        Text(
            when {
                spot.cell == null -> stringResource(R.string.spot_none)
                spot.areaName != null -> stringResource(R.string.spot_current, spot.areaName!!)
                else -> stringResource(R.string.spot_current_unnamed)
            },
            style = MaterialTheme.typography.bodyLarge,
        )
        message?.let { Text(stringResource(it), style = MaterialTheme.typography.bodyMedium) }
        if (map?.simulated == true) Text(stringResource(R.string.spot_sample_note), style = MaterialTheme.typography.bodyMedium)

        when (val s = stage) {
            Stage.Idle -> {
                OutlinedTextField(
                    value = postcode,
                    onValueChange = { postcode = it.filter { c -> c.isLetterOrDigit() }.take(4) },
                    label = { Text(stringResource(R.string.spot_postcode)) },
                    supportingText = { Text(stringResource(R.string.spot_postcode_hint)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        message = null
                        if (LocationSource.hasPermission(ctx)) locate() else askLocation.launch(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.spot_use_location)) }
                OutlinedButton(
                    onClick = { message = null; stage = Stage.PickArea },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.spot_pick_map)) }
                Text(stringResource(R.string.spot_privacy), style = MaterialTheme.typography.bodyMedium)
            }
            Stage.Locating -> Text(stringResource(R.string.spot_locating), style = MaterialTheme.typography.bodyLarge)
            is Stage.Confirm -> {
                Text(stringResource(R.string.spot_mocked_ask, s.choice.areaName.orEmpty()), style = MaterialTheme.typography.bodyLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { commit(s.choice) }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.spot_confirm_yes)) }
                    OutlinedButton(onClick = { stage = Stage.PickArea }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.spot_confirm_no)) }
                }
            }
            Stage.PickArea -> {
                Text(stringResource(R.string.spot_pick_area), style = MaterialTheme.typography.titleMedium)
                val m = map
                if (m == null) Text(stringResource(R.string.spot_locating))
                else m.areas.forEach { area ->
                    OutlinedButton(
                        onClick = { stage = Stage.PickCell(area.slug) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) { Text(area.name) }
                }
                OutlinedButton(onClick = { stage = Stage.Idle }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.spot_cancel)) }
            }
            is Stage.PickCell -> {
                val m = map
                val area = m?.area(s.areaSlug)
                Text(stringResource(R.string.spot_pick_cell), style = MaterialTheme.typography.titleMedium)
                if (m != null && area != null) {
                    CellPicker(m, s.areaSlug, area.name) { id -> Spot.choose(m, id)?.let(::commit) }
                }
                OutlinedButton(onClick = { stage = Stage.PickArea }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.back)) }
            }
        }
        below(spot)
    }
}

/** A hex grid of one neighbourhood's blocks. A tap picks the block under the finger (onboarding R3.5). */
@Composable
private fun CellPicker(map: AreaMap, areaSlug: String, areaName: String, onPick: (String) -> Unit) {
    val cells = remember(map, areaSlug) { Spot.cellsOf(map, areaSlug) }
    val grid = remember(cells) { HexGrid.build(map.copy(cells = cells), MapProjection.forCells(cells)) }
    val desc = stringResource(R.string.spot_grid_desc, areaName)
    val fill = MaterialTheme.colorScheme.primaryContainer
    val line = MaterialTheme.colorScheme.primary
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
            drawPath(path, line, style = Stroke(width = 2f))
        }
    }
}

private class Fit(val scale: Double, val ox: Double, val oy: Double)

private fun fit(minX: Double, minY: Double, w: Double, h: Double, cw: Float, ch: Float): Fit {
    val pad = 16.0
    val scale = minOf((cw - 2 * pad) / maxOf(w, 1e-9), (ch - 2 * pad) / maxOf(h, 1e-9))
    return Fit(scale, pad + (cw - 2 * pad - w * scale) / 2, pad + (ch - 2 * pad - h * scale) / 2)
}
