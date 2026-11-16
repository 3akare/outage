package app.outage.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import app.outage.R
import app.outage.map.AreaMap
import app.outage.map.AreaMapSource
import app.outage.map.CellState
import app.outage.map.CellStates
import app.outage.map.CellStyle
import app.outage.map.DemoAreaMap
import app.outage.map.HexGrid
import app.outage.map.LabelBox
import app.outage.map.LabelPlacer
import app.outage.map.MapCell
import app.outage.map.MapLoad
import app.outage.map.MapResult
import app.outage.map.MapTransform
import app.outage.map.MapViewport
import app.outage.map.WorldPoint
import app.outage.shell.AgeLabel
import app.outage.shell.PrefsFollowedArea
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

private const val REFRESH_MS = 60_000L

/** Path coordinates are world units times this, so float precision holds at city scale (a hex is about 0.01 degrees wide). */
private const val U = 1000.0

/** How much of the map's bottom edge is covered by the Home sheet, so controls and "my spot" stay in the clear. */
val LocalMapBottomInset = compositionLocalOf { 0.dp }

/**
 * The Home map (app-map-insights R1 to R6, ADR 0050): full screen, like a maps app, with the spot in the middle of the
 * part the sheet does not cover. Hexes are drawn on a Canvas with no basemap and no tile request (ADR 0022). Loads on
 * open, then at most once a minute while visible (R4.4). Demo or Worker JSON arrives through the same [AreaMapSource].
 * [spotCell] is the user's own cell from first run or Settings; it wins when the source does not know it.
 */
@Composable
fun MapScreen(source: AreaMapSource, followed: PrefsFollowedArea?, spotCell: () -> String? = { null }) {
    var result by remember { mutableStateOf<MapResult?>(null) }
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                val now = System.currentTimeMillis()
                val r = withContext(Dispatchers.IO) { source.load(DemoAreaMap.CITY, now) }
                val withSpot = if (r is MapResult.Loaded && r.load.spotCellId == null) {
                    val own = withContext(Dispatchers.IO) { spotCell() }
                    if (own != null && r.load.map.cell(own) != null) MapResult.Loaded(r.load.copy(spotCellId = own)) else r
                } else r
                if (withSpot is MapResult.Loaded || result == null) result = withSpot
                nowMs = System.currentTimeMillis()
                delay(REFRESH_MS)
            }
        }
    }
    Box(Modifier.fillMaxSize().background(LocalStatusColors.current.map.ground)) {
        when (val r = result) {
            null -> CenterMessage(R.string.map_loading, null)
            MapResult.Empty -> CenterMessage(R.string.map_none, R.string.map_none_body)
            is MapResult.Loaded -> MapContent(r.load, nowMs, followed)
        }
    }
}

@Composable
private fun CenterMessage(titleRes: Int, bodyRes: Int?) {
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(stringResource(titleRes), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
        if (bodyRes != null) Text(stringResource(bodyRes), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MapContent(load: MapLoad, nowMs: Long, followed: PrefsFollowedArea?) {
    val map = load.map
    val states = remember(map, nowMs) { map.cells.associate { it.id to CellStates.effective(it, nowMs) } }
    val grid = remember(map) { HexGrid.build(map) }
    var listView by rememberSaveable { mutableStateOf(false) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var followedSlug by remember { mutableStateOf(followed?.read()) }

    val areaStates = remember(map, states) {
        map.areas.map { a -> a to a.cellIds.mapNotNull { states[it] } }
    }
    val out = areaStates.count { (_, s) -> CellState.CONFIRMED in s }
    val possible = areaStates.count { (_, s) -> CellState.CONFIRMED !in s && CellState.POSSIBLE in s }
    val total = map.areas.size

    val inset = LocalMapBottomInset.current
    Box(Modifier.fillMaxSize()) {
        if (listView) {
            Box(Modifier.fillMaxSize().statusBarsPadding().padding(top = 128.dp, bottom = inset)) { AreaList(map, areaStates, states, nowMs) }
        } else {
            HexMapView(grid, map, states, load.spotCellId, selectedId, onTap = { selectedId = it }, summary = stringResource(R.string.map_summary, total, out, possible))
        }
        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // The floating search-style bar of a maps app: the mark, where this is, and how it is doing.
            Surface(
                shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh, shadowElevation = 3.dp,
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            ) {
                Row(Modifier.padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Image(painterResource(R.drawable.ic_mark), contentDescription = null, modifier = Modifier.size(28.dp))
                    Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                        Text(stringResource(R.string.map_title), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                        val headline = when {
                            out > 0 -> stringResource(R.string.map_headline_out, out, total)
                            possible > 0 -> stringResource(R.string.map_headline_possible, possible, total)
                            else -> stringResource(R.string.map_headline_ok, total)
                        }
                        Text(headline, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                    if (map.simulated) SimulatedChip()
                    IconButton(onClick = { listView = !listView }, modifier = Modifier.size(48.dp)) {
                        Image(
                            painter = painterResource(if (listView) R.drawable.ic_nav_area else R.drawable.ic_list),
                            contentDescription = stringResource(if (listView) R.string.map_show_map else R.string.map_show_list),
                            colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurfaceVariant),
                        )
                    }
                }
            }
            if (load.fromCache) {
                Surface(shape = RoundedCornerShape(12.dp), color = LocalStatusColors.current.possible.container) {
                    Text(
                        stringResource(R.string.map_offline_banner, Fmt.time(load.fetchedMs)),
                        Modifier.padding(horizontal = 14.dp, vertical = 8.dp), color = LocalStatusColors.current.possible.onContainer, style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            if (!listView) LegendChips()
        }
    }

    val cell = selectedId?.let { map.cell(it) }
    if (cell != null) {
        ModalBottomSheet(onDismissRequest = { selectedId = null }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)) {
            CellSheet(
                cell, map, states[cell.id] ?: cell.state, nowMs, load, isSpot = cell.id == load.spotCellId, followedSlug = followedSlug,
                onFollow = { slug -> followed?.save(slug); followedSlug = slug },
            )
        }
    }
}

@Composable
fun SimulatedChip() {
    val c = LocalStatusColors.current.possible
    Surface(shape = RoundedCornerShape(8.dp), color = c.container) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Image(painterResource(R.drawable.ic_simulated), null, Modifier.size(16.dp), colorFilter = ColorFilter.tint(c.onContainer))
            Text(stringResource(R.string.simulated), style = MaterialTheme.typography.labelLarge, color = c.onContainer)
        }
    }
}

private fun homeTransform(grid: HexGrid, spotId: String?, vp: MapViewport, topPx: Double, bottomPx: Double): MapTransform {
    val spot = spotId?.let { grid.shape(it) } ?: return MapTransform.fitTo(vp).panBy(0.0, (topPx - bottomPx) / 2, vp)
    // About 6 hex widths across the narrow side: the spot and two rings of neighbours (R1.3). Then the spot moves to the
    // middle of the band between the top bar and the Home sheet, like "my location" in a maps app.
    return MapTransform.focusOn(spot.centre, spot.bounds.width * 6.0, vp).panBy(0.0, (topPx - bottomPx) / 2, vp)
}

private fun lerp(a: MapTransform, b: MapTransform, f: Float): MapTransform {
    val s = a.scale * (b.scale / a.scale).pow(f.toDouble())
    return MapTransform(s, a.offsetX + (b.offsetX - a.offsetX) * f, a.offsetY + (b.offsetY - a.offsetY) * f)
}

private fun hexPath(cx: Float, cy: Float, r: Float): Path = Path().apply {
    for (i in 0 until 6) {
        val a = Math.toRadians(60.0 * i - 30.0)
        val x = cx + r * cos(a).toFloat()
        val y = cy + r * sin(a).toFloat()
        if (i == 0) moveTo(x, y) else lineTo(x, y)
    }
    close()
}

@Composable
private fun HexMapView(
    grid: HexGrid,
    map: AreaMap,
    states: Map<String, CellState>,
    spotId: String?,
    selectedId: String?,
    onTap: (String?) -> Unit,
    summary: String,
) {
    val density = LocalDensity.current
    val dp = density.density
    var size by remember { mutableStateOf(IntSize.Zero) }
    val bounds = grid.bounds ?: return
    val vp = remember(grid, size) { MapViewport(bounds, size.width.toDouble(), size.height.toDouble(), padding = 28.0 * dp) }
    val inset = LocalMapBottomInset.current
    val topPx = with(density) { (WindowInsets.statusBars.getTop(this) + 128.dp.roundToPx()).toDouble() }
    val bottomPx = with(density) { inset.toPx().toDouble() }
    val home = remember(vp, spotId, bottomPx) { homeTransform(grid, spotId, vp, topPx, bottomPx) }
    val colors = LocalStatusColors.current.map
    var transform by remember(size, map.city) { mutableStateOf<MapTransform?>(null) }
    val current = transform ?: home
    val paths = remember(grid) {
        grid.shapes.associate { s ->
            s.cell.id to Path().apply {
                s.points.forEachIndexed { i, p -> if (i == 0) moveTo((p.x * U).toFloat(), (p.y * U).toFloat()) else lineTo((p.x * U).toFloat(), (p.y * U).toFloat()) }
                close()
            }
        }
    }
    val scope = rememberCoroutineScope()
    val anim = remember { Animatable(0f) }
    val job = remember { arrayOfNulls<Job>(1) }
    fun animateTo(target: MapTransform) {
        val from = transform ?: home
        job[0]?.cancel()
        job[0] = scope.launch {
            anim.snapTo(0f)
            anim.animateTo(1f, tween(380)) { transform = lerp(from, target, value) }
        }
    }
    val tap by rememberUpdatedState(onTap)
    val measurer = rememberTextMeasurer()
    val pulse = rememberInfiniteTransition().animateFloat(
        0f, 1f, infiniteRepeatable(tween(1900, easing = LinearOutSlowInEasing), RepeatMode.Restart),
    )
    val labelOrder = remember(map) { map.areas.sortedByDescending { it.cellIds.size } }

    Box(Modifier.fillMaxSize().background(colors.ground)) {
        Canvas(
            Modifier.fillMaxSize().onSizeChanged { size = it }.semantics { contentDescription = summary }
                .pointerInput(vp) {
                    detectTransformGestures { centroid, pan, zoom, _ ->
                        job[0]?.cancel()
                        val t = transform ?: home
                        transform = t.zoomAbout(centroid.x.toDouble(), centroid.y.toDouble(), zoom.toDouble(), vp).panBy(pan.x.toDouble(), pan.y.toDouble(), vp)
                    }
                }
                .pointerInput(vp, grid) {
                    detectTapGestures(
                        onDoubleTap = { o -> animateTo((transform ?: home).zoomAbout(o.x.toDouble(), o.y.toDouble(), 2.0, vp)) },
                        onTap = { o -> tap(grid.hitTest((transform ?: home).toWorld(o.x.toDouble(), o.y.toDouble()))?.id) },
                    )
                },
        ) {
            if (size == IntSize.Zero) return@Canvas
            val t = current
            val s = (t.scale / U).toFloat()
            val px = dp / s // one dp in path units
            val visible = grid.visible(t.visibleWorld(vp))
            withTransform({
                translate(t.offsetX.toFloat(), t.offsetY.toFloat())
                scale(s, s, Offset.Zero)
            }) {
                for (shape in visible) {
                    val path = paths[shape.cell.id] ?: continue
                    val b = shape.bounds
                    val detail = b.width * t.scale > 18 * dp
                    paintCell(states[shape.cell.id] ?: shape.cell.state, path, (b.minX * U).toFloat(), (b.minY * U).toFloat(), (b.maxX * U).toFloat(), (b.maxY * U).toFloat(), px, colors, detail)
                }
                // Outage pulse: a ring that grows and fades on every confirmed hex.
                val p = pulse.value
                for (shape in visible) {
                    if (states[shape.cell.id] != CellState.CONFIRMED) continue
                    val path = paths[shape.cell.id] ?: continue
                    drawPath(path, colors.confirmed.copy(alpha = (1f - p) * 0.6f), style = Stroke((2f + 9f * p) * px))
                }
                for (shape in visible) {
                    val path = paths[shape.cell.id] ?: continue
                    if (shape.cell.id == spotId) {
                        drawPath(path, colors.label, style = Stroke(3.2f * px))
                        // "You are here": a dot with a soft halo at the centre of the spot cell, as in a maps app.
                        val c = Offset((shape.centre.x * U).toFloat(), (shape.centre.y * U).toFloat())
                        drawCircle(colors.spot.copy(alpha = 0.18f), 20f * px, c)
                        drawCircle(Color.White, 9f * px, c)
                        drawCircle(colors.spot, 6.5f * px, c)
                    }
                    if (shape.cell.id == selectedId) {
                        drawPath(path, colors.label, style = Stroke(2.4f * px, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f * px, 4f * px))))
                    }
                }
            }
            // Area names in screen space, dropped when they would overlap (design section 4).
            val style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.label)
            val placed = labelOrder.mapNotNull { a ->
                val c = grid.shape(a.centreCell)?.centre ?: return@mapNotNull null
                val sp = t.toScreen(c)
                val layout = measurer.measure(a.name, style)
                LabelBox(a.slug, sp.x, sp.y, layout.size.width + 14.0 * dp, layout.size.height + 6.0 * dp) to layout
            }
            val kept = LabelPlacer.place(placed.map { it.first }, size.width.toDouble(), size.height.toDouble(), 4.0 * dp).map { it.key }.toSet()
            for ((box, layout) in placed) {
                if (box.key !in kept) continue
                drawRoundRect(colors.labelHalo.copy(alpha = 0.88f), Offset((box.x - box.w / 2).toFloat(), (box.y - box.h / 2).toFloat()), Size(box.w.toFloat(), box.h.toFloat()), CornerRadius(box.h.toFloat() / 2))
                drawText(layout, colors.label, Offset((box.x - layout.size.width / 2).toFloat(), (box.y - layout.size.height / 2).toFloat()))
            }
        }
        Column(Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = inset + 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            MapButton(R.drawable.ic_add, R.string.map_zoom_in) { animateTo(current.zoomAbout(size.width / 2.0, size.height / 2.0, 1.8, vp)) }
            MapButton(R.drawable.ic_remove, R.string.map_zoom_out) { animateTo(current.zoomAbout(size.width / 2.0, size.height / 2.0, 1 / 1.8, vp)) }
            MapButton(R.drawable.ic_recenter, R.string.map_recentre) { animateTo(home) }
        }
    }
}

@Composable
private fun MapButton(iconRes: Int, descRes: Int, onClick: () -> Unit) {
    SmallFloatingActionButton(
        onClick = onClick,
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.size(48.dp),
    ) {
        Image(painterResource(iconRes), stringResource(descRes), colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurface))
    }
}

/** The legend as a row of chips under the top bar, like map layers. Each chip has the hexagon swatch and the word (R1.7). */
@Composable
private fun LegendChips() {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (state in listOf(CellState.CONFIRMED, CellState.POSSIBLE, CellState.NORMAL, CellState.RESTORED, CellState.NO_DATA)) {
            Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh, shadowElevation = 1.dp) {
                Row(Modifier.heightIn(min = 32.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StateSwatch(state, 16.dp)
                    Text(stateLabel(state), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }
    }
}

/** One hexagon drawn with the same fill and pattern as the map, so the legend and the map always agree (R1.7). */
@Composable
fun StateSwatch(state: CellState, sizeDp: androidx.compose.ui.unit.Dp) {
    val colors = LocalStatusColors.current.map
    Canvas(Modifier.size(sizeDp)) {
        val r = size.minDimension / 2 * 0.95f
        val path = hexPath(size.width / 2, size.height / 2, r)
        paintCell(state, path, size.width / 2 - r, size.height / 2 - r, size.width / 2 + r, size.height / 2 + r, density, colors)
    }
}

@Composable
fun stateLabel(state: CellState): String = stringResource(
    when (state) {
        CellState.NORMAL -> R.string.status_normal
        CellState.POSSIBLE -> R.string.status_possible
        CellState.CONFIRMED -> R.string.status_confirmed
        CellState.RESTORED -> R.string.status_restored
        CellState.NO_DATA -> R.string.map_no_data
    },
)

@Composable
private fun stateWords(state: CellState): String = stringResource(
    when (state) {
        CellState.NORMAL -> R.string.map_desc_normal
        CellState.POSSIBLE -> R.string.map_desc_possible
        CellState.CONFIRMED -> R.string.map_desc_confirmed
        CellState.RESTORED -> R.string.map_desc_restored
        CellState.NO_DATA -> R.string.map_desc_no_data
    },
)

@Composable
private fun AreaList(map: AreaMap, areaStates: List<Pair<app.outage.map.MapArea, List<CellState>>>, states: Map<String, CellState>, nowMs: Long) {
    val colors = LocalStatusColors.current.map
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
        items(areaStates, key = { it.first.slug }) { (area, list) ->
            val worst = listOf(CellState.CONFIRMED, CellState.POSSIBLE, CellState.RESTORED, CellState.NORMAL, CellState.NO_DATA).firstOrNull { it in list } ?: CellState.NO_DATA
            val outCount = list.count { it == CellState.CONFIRMED }
            val first = area.cellIds.firstNotNullOfOrNull { map.cell(it) }
            val since = first?.sinceMs
            val detail = when {
                outCount > 0 -> stringResource(R.string.map_list_cells, outCount, list.size)
                worst == CellState.NO_DATA -> stringResource(R.string.map_list_no_data, list.size)
                else -> stringResource(R.string.map_list_all_on, list.size)
            }
            val said = if (since != null && (worst == CellState.CONFIRMED || worst == CellState.POSSIBLE)) {
                stringResource(R.string.map_hex_desc_since, area.name, stateWords(worst), Fmt.since(since, nowMs))
            } else stringResource(R.string.map_hex_desc, area.name, stateWords(worst))
            Surface(Modifier.fillMaxWidth().semantics { contentDescription = said }, shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerLow) {
                Row(Modifier.heightIn(min = 64.dp).padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    StateSwatch(worst, 36.dp)
                    Column(Modifier.weight(1f)) {
                        Text(area.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                        Text(stateWords(worst), style = MaterialTheme.typography.bodyMedium, color = MapPalette.accent(worst, colors))
                        Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun CellSheet(
    cell: MapCell,
    map: AreaMap,
    state: CellState,
    nowMs: Long,
    load: MapLoad,
    isSpot: Boolean,
    followedSlug: String?,
    onFollow: (String) -> Unit,
) {
    val area = map.area(cell.areaSlug)
    val name = area?.name ?: cell.areaSlug
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            StateSwatch(state, 44.dp)
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.headlineSmall)
                Text(stateWords(state), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (map.simulated) SimulatedChip()
        }
        if (isSpot) Text(stringResource(R.string.map_your_spot), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        val sinceMs = cell.sinceMs
        val restoredMs = cell.restoredMs
        when {
            state == CellState.CONFIRMED && sinceMs != null -> Text(stringResource(R.string.map_since, Fmt.since(sinceMs, nowMs)), style = MaterialTheme.typography.bodyLarge)
            state == CellState.POSSIBLE && sinceMs != null -> Text(stringResource(R.string.map_possible_since, Fmt.since(sinceMs, nowMs)), style = MaterialTheme.typography.bodyLarge)
            state == CellState.RESTORED && restoredMs != null -> Text(stringResource(R.string.map_restored_at, Fmt.since(restoredMs, nowMs)), style = MaterialTheme.typography.bodyLarge)
        }
        // Wording only: never a member count (R2.2, R3.4).
        if (state != CellState.NO_DATA) Text(stringResource(R.string.map_three_plus), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val (ageRes, ageN) = app.outage.ui.StatusRes.age(AgeLabel.of(Fmt.ageMinutes(nowMs, load.fetchedMs).toInt()))
        Text(if (ageN == null) stringResource(ageRes) else stringResource(ageRes, ageN), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        if (state != CellState.NO_DATA) {
            Text(stringResource(R.string.map_history_title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
            val recent = cell.history.filter { it.startMs >= nowMs - 30L * 24 * 3_600_000 }.sortedByDescending { it.startMs }.take(5)
            if (recent.isEmpty()) {
                Text(stringResource(R.string.map_history_none), style = MaterialTheme.typography.bodyMedium)
            } else for (span in recent) {
                val dur = (span.endMs ?: nowMs) - span.startMs
                Text(stringResource(R.string.map_history_row, Fmt.since(span.startMs, nowMs), durationText(dur)), style = MaterialTheme.typography.bodyMedium)
            }
        }
        Spacer(Modifier.width(1.dp))
        val following = followedSlug == cell.areaSlug
        if (following) {
            OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(stringResource(R.string.map_following)) }
        } else {
            Button(onClick = { onFollow(cell.areaSlug) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(stringResource(R.string.map_follow)) }
        }
    }
}
