package app.outage.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SmallFloatingActionButton
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import app.outage.R
import app.outage.map.AreaMap
import app.outage.map.AreaMapSource
import app.outage.map.CellState
import app.outage.map.CellStates
import app.outage.map.DemoAreaMap
import app.outage.map.HexGeoJson
import app.outage.map.MapCell
import app.outage.map.MapLoad
import app.outage.map.MapResult
import app.outage.shell.AgeLabel
import app.outage.shell.PrefsFollowedArea
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.cos
import kotlin.math.sin

private const val REFRESH_MS = 60_000L

/** How much of the map's bottom edge is covered by the Home sheet, so controls and "my spot" stay in the clear. */
val LocalMapBottomInset = compositionLocalOf { 0.dp }

/**
 * The Home map (app-map-insights R1 to R6, ADR 0050, ADR 0053): full screen like a maps app, a real street map
 * (MapLibre, OpenFreeMap) with the hex grid on top, and the spot in the middle of the part the sheet does not cover. Loads on
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
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
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
    var listView by rememberSaveable { mutableStateOf(false) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var followedSlug by remember { mutableStateOf(followed?.read()) }
    var query by rememberSaveable { mutableStateOf("") }
    var filter by remember { mutableStateOf(emptySet<CellState>()) }
    val controller = remember { OutageMapController() }

    val areaStates = remember(map, states) {
        map.areas.map { a -> a to a.cellIds.mapNotNull { states[it] } }
    }
    val out = areaStates.count { (_, s) -> CellState.CONFIRMED in s }
    val possible = areaStates.count { (_, s) -> CellState.CONFIRMED !in s && CellState.POSSIBLE in s }
    val total = map.areas.size
    val spot = load.spotCellId?.let { map.cell(it) }
    val spotLL = spot?.let(HexGeoJson::centre)
    // The state chips narrow the map to the states picked, like map layers; none picked shows everything.
    val shown = remember(map, states, filter) { if (filter.isEmpty()) map.cells else map.cells.filter { (states[it.id] ?: it.state) in filter } }

    val inset = LocalMapBottomInset.current
    val statusTop = with(LocalDensity.current) { WindowInsets.statusBars.getTop(this).toDp() }
    val barsHeight = statusTop + 120.dp

    // Open over the city, then fly down to the spot once the street map is in, like "my location" in a maps app.
    LaunchedEffect(spotLL) {
        controller.flyTo(LAGOS, CITY_ZOOM)
        controller.awaitReady()
        delay(400)
        controller.flyTo(spotLL ?: LAGOS, if (spotLL != null) SPOT_ZOOM else CITY_ZOOM + 0.6, 2200)
    }
    fun goToArea(area: app.outage.map.MapArea) {
        val c = map.cell(area.centreCell) ?: return
        listView = false
        query = ""
        selectedId = c.id
        controller.flyTo(HexGeoJson.centre(c), SPOT_ZOOM, 1200)
    }

    Box(Modifier.fillMaxSize()) {
        OutageMap(
            cells = shown, states = states, spotId = load.spotCellId, selectedId = selectedId, controller = controller,
            modifier = Modifier.fillMaxSize(), top = barsHeight, bottom = inset,
            description = stringResource(R.string.map_summary, total, out, possible),
            onTap = { id -> selectedId = id },
        )
        if (listView) {
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).padding(top = barsHeight, bottom = inset)) {
                AreaList(map, areaStates, nowMs) { goToArea(it) }
            }
        } else {
            Column(Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = inset + 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                MapButton(R.drawable.ic_add, R.string.map_zoom_in) { controller.zoomIn() }
                MapButton(R.drawable.ic_remove, R.string.map_zoom_out) { controller.zoomOut() }
                MapButton(R.drawable.ic_recenter, R.string.map_recentre, primary = true) {
                    controller.flyTo(spotLL ?: LAGOS, if (spotLL != null) SPOT_ZOOM else CITY_ZOOM, 1200)
                }
            }
        }
        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SearchBar(query, { query = it }, listView, { listView = !listView })
            val matches = remember(query, map) {
                val q = query.trim()
                if (q.isEmpty()) emptyList() else map.areas.filter { it.name.contains(q, ignoreCase = true) || it.slug.contains(q, ignoreCase = true) }
            }
            if (query.isNotBlank()) {
                SearchResults(matches, areaStates) { goToArea(it) }
            } else {
                if (load.fromCache) {
                    Surface(shape = RoundedCornerShape(12.dp), color = LocalStatusColors.current.possible.container) {
                        Text(
                            stringResource(R.string.map_offline_banner, Fmt.time(load.fetchedMs)),
                            Modifier.padding(horizontal = 14.dp, vertical = 8.dp), color = LocalStatusColors.current.possible.onContainer, style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
                StateChips(map.simulated, filter) { s -> filter = if (s in filter) filter - s else filter + s }
            }
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

/** The floating search box of a maps app: the wordmark, "Search areas", and the list switch. Typing filters the areas. */
@Composable
private fun SearchBar(query: String, onQuery: (String) -> Unit, listView: Boolean, onToggleList: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surface, shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
    ) {
        Row(Modifier.padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Image(painterResource(R.drawable.ic_mark), contentDescription = stringResource(R.string.app_name), modifier = Modifier.size(width = 72.dp, height = 20.dp))
            Box(Modifier.weight(1f).padding(vertical = 16.dp)) {
                if (query.isEmpty()) {
                    Text(stringResource(R.string.map_search_hint), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
                BasicTextField(
                    value = query, onValueChange = onQuery, singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "search" },
                )
            }
            IconButton(onClick = { if (query.isNotEmpty()) onQuery("") else onToggleList() }, modifier = Modifier.size(48.dp)) {
                Image(
                    painter = painterResource(if (query.isNotEmpty()) R.drawable.ic_remove else if (listView) R.drawable.ic_nav_area else R.drawable.ic_list),
                    contentDescription = stringResource(if (query.isNotEmpty()) R.string.map_search_clear else if (listView) R.string.map_show_map else R.string.map_show_list),
                    colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurfaceVariant),
                )
            }
        }
    }
}

/** Suggestions under the search box: matching areas with their power state. */
@Composable
private fun SearchResults(matches: List<app.outage.map.MapArea>, areaStates: List<Pair<app.outage.map.MapArea, List<CellState>>>, onPick: (app.outage.map.MapArea) -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, shadowElevation = 4.dp, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(vertical = 8.dp)) {
            if (matches.isEmpty()) {
                Text(stringResource(R.string.map_search_none), Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            for (a in matches) {
                val worst = worstOf(areaStates.firstOrNull { it.first.slug == a.slug }?.second.orEmpty())
                Row(
                    Modifier.fillMaxWidth().clickable { onPick(a) }.heightIn(min = 56.dp).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    StateSwatch(worst, 24.dp)
                    Column(Modifier.weight(1f)) {
                        Text(a.name, style = MaterialTheme.typography.titleMedium)
                        Text(stateWords(worst), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

private fun worstOf(list: List<CellState>): CellState =
    listOf(CellState.CONFIRMED, CellState.POSSIBLE, CellState.RESTORED, CellState.NORMAL, CellState.NO_DATA).firstOrNull { it in list } ?: CellState.NO_DATA

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
private fun MapButton(iconRes: Int, descRes: Int, primary: Boolean = false, onClick: () -> Unit) {
    val tint = if (primary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    SmallFloatingActionButton(
        onClick = onClick,
        shape = CircleShape,
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = tint,
        modifier = Modifier.size(48.dp),
    ) {
        Image(painterResource(iconRes), stringResource(descRes), colorFilter = ColorFilter.tint(tint))
    }
}

/**
 * The state chips under the search box, like map layers: each has the hexagon swatch and the word (R1.7), and tapping it
 * shows only blocks in that state. The "Simulated" chip leads when the data is made up.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StateChips(simulated: Boolean, picked: Set<CellState>, onToggle: (CellState) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (simulated) SimulatedChip()
        for (state in listOf(CellState.CONFIRMED, CellState.POSSIBLE, CellState.NORMAL, CellState.RESTORED, CellState.NO_DATA)) {
            FilterChip(
                selected = state in picked,
                onClick = { onToggle(state) },
                label = { Text(stateLabel(state)) },
                leadingIcon = { StateSwatch(state, 16.dp) },
                shape = RoundedCornerShape(8.dp),
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
                elevation = FilterChipDefaults.filterChipElevation(elevation = 2.dp),
                border = null,
            )
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
private fun AreaList(map: AreaMap, areaStates: List<Pair<app.outage.map.MapArea, List<CellState>>>, nowMs: Long, onPick: (app.outage.map.MapArea) -> Unit) {
    val colors = LocalStatusColors.current.map
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(12.dp)) {
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
            Surface(onClick = { onPick(area) }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = said }, shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
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
