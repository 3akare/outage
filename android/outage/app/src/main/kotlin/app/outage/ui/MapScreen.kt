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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
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
import app.outage.map.MapArea
import app.outage.map.MapCell
import app.outage.map.MapLoad
import app.outage.map.MapResult
import app.outage.places.Places
import app.outage.places.PlacesGeo
import app.outage.places.Ward
import app.outage.shell.AgeLabel
import app.outage.shell.PrefsFollowedArea
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.cos
import kotlin.math.sin

private const val REFRESH_MS = 60_000L

/** How much of the map's bottom edge is covered by something drawn over it, so controls and "my spot" stay in the clear. */
val LocalMapBottomInset = compositionLocalOf { 0.dp }

/**
 * The Map tab (app-map-insights R1 to R6, ADR 0053, ADR 0054): full bleed, a real street map (MapLibre, OpenFreeMap) with
 * the see-through hex grid on top, a floating search capsule and state capsules at the top, round buttons at the bottom
 * right, and a sheet for a tapped area. Loads on open, then at most once a minute while visible (R4.4). Demo or Worker
 * JSON arrives through the same [AreaMapSource]. [spotCell] is the user's own cell; it wins when the source does not know it.
 * The areas are the Lagos local governments; the search also finds the bundled wards (ADR 0056) and flies to a ward's anchor,
 * and the LGA boundaries are drawn as a thin dashed line.
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
                    if (own != null) MapResult.Loaded(r.load.copy(spotCellId = own)) else r
                } else r
                if (withSpot is MapResult.Loaded || result == null) result = withSpot
                nowMs = System.currentTimeMillis()
                delay(REFRESH_MS)
            }
        }
    }
    Box(Modifier.fillMaxSize().background(Day.page)) {
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
        Text(stringResource(titleRes), style = DayType.title2, color = Day.ink)
        if (bodyRes != null) Text(stringResource(bodyRes), style = DayType.subhead, color = Day.muted, modifier = Modifier.padding(top = 8.dp))
    }
}

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
    val places = rememberPlaces()
    val geo = rememberPlacesGeo()
    var wardSlug by rememberSaveable { mutableStateOf<String?>(null) }

    // The spot's own hexagon from the bundled outlines when the published map does not carry it, so "my spot" always shows.
    val spotExtra = remember(map, geo, load.spotCellId) {
        val id = load.spotCellId
        if (id == null || map.cell(id) != null) null
        else geo?.ring(id)?.let { MapCell(id, places?.wardOfCell(id)?.lgaSlug ?: "", CellState.NO_DATA, null, null, emptyList(), it) }
    }
    val lgaLines = remember(geo) { geo?.let { g -> HexGeoJson.lines(g.lgaOutlines.values.flatten()) } }
    val outlines = remember(geo, wardSlug, lgaLines) { wardSlug?.let { geo?.wardOutlines?.get(it) }?.let(HexGeoJson::lines) ?: lgaLines }

    val areaStates = remember(map, states) {
        map.areas.map { a -> a to a.cellIds.mapNotNull { states[it] } }
    }
    val out = areaStates.count { (_, s) -> CellState.CONFIRMED in s }
    val possible = areaStates.count { (_, s) -> CellState.CONFIRMED !in s && CellState.POSSIBLE in s }
    val total = map.areas.size
    val spot = load.spotCellId?.let { map.cell(it) } ?: spotExtra
    val spotLL = spot?.let(HexGeoJson::centre)
    // The state capsules narrow the map to the states picked, like map layers; none picked shows everything.
    val shown = remember(map, states, filter, spotExtra) {
        val base = if (filter.isEmpty()) map.cells else map.cells.filter { (states[it.id] ?: it.state) in filter }
        if (spotExtra != null && (filter.isEmpty() || CellState.NO_DATA in filter)) base + spotExtra else base
    }

    val inset = LocalMapBottomInset.current
    val statusTop = with(LocalDensity.current) { WindowInsets.statusBars.getTop(this).toDp() }
    val barsHeight = statusTop + 128.dp

    // All 20 local governments in view: the box around every LGA outline, below the bars and above the tab bar.
    val density = LocalDensity.current
    val showCity: (Int) -> Unit = { ms ->
        val corners = geo?.lagosCorners().orEmpty()
        if (corners.isEmpty()) controller.flyTo(LAGOS, CITY_ZOOM, ms)
        else with(density) { controller.fitTo(corners, ms, 24.dp.roundToPx(), barsHeight.roundToPx() + 12.dp.roundToPx(), inset.roundToPx() + 12.dp.roundToPx()) }
    }
    // Open over all of Lagos, then fly down to the spot once the street map is in, like "my location" in a maps app.
    LaunchedEffect(spotLL, geo != null) {
        showCity(0)
        controller.awaitReady()
        if (spotLL != null) {
            delay(400)
            controller.flyTo(spotLL, SPOT_ZOOM, 2200)
        }
    }
    fun goToArea(area: MapArea) {
        val c = map.cell(area.centreCell) ?: return
        listView = false
        query = ""
        wardSlug = null
        selectedId = c.id
        controller.flyTo(HexGeoJson.centre(c), SPOT_ZOOM, 1200)
    }
    // A ward from the bundled places: fly to its anchor and draw its boundary. Its hexagon opens only if the map has it.
    fun goToWard(ward: Ward) {
        val to = geo?.centre(ward.anchor) ?: map.cell(ward.anchor)?.let(HexGeoJson::centre) ?: return
        listView = false
        query = ""
        wardSlug = ward.slug
        selectedId = ward.anchor.takeIf { map.cell(it) != null }
        controller.flyTo(to, SPOT_ZOOM + 0.5, 1200)
    }

    Box(Modifier.fillMaxSize()) {
        OutageMap(
            cells = shown, states = states, spotId = load.spotCellId, selectedId = selectedId, controller = controller,
            modifier = Modifier.fillMaxSize(), top = barsHeight, bottom = inset,
            description = stringResource(R.string.map_summary, total, out, possible),
            outlines = outlines,
            onTap = { id -> selectedId = id },
        )
        if (listView) {
            Box(Modifier.fillMaxSize().background(Day.page).padding(top = barsHeight, bottom = inset)) {
                AreaList(map, areaStates, nowMs) { goToArea(it) }
            }
        } else {
            Column(Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = inset + 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                MapButton(R.drawable.ic_sym_add, R.string.map_zoom_in) { controller.zoomIn() }
                MapButton(R.drawable.ic_sym_remove, R.string.map_zoom_out) { controller.zoomOut() }
                MapButton(R.drawable.ic_sym_my_location, R.string.map_recentre, primary = true) {
                    if (spotLL != null) controller.flyTo(spotLL, SPOT_ZOOM, 1200) else showCity(1200)
                }
            }
        }
        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SearchBar(query, { query = it }, listView, { listView = !listView })
            val matches = remember(query, map) {
                val q = query.trim()
                if (q.isEmpty()) emptyList() else map.areas.filter { it.name.contains(q, ignoreCase = true) || it.slug.contains(q, ignoreCase = true) }
            }
            val wardMatches = remember(query, places) {
                val q = query.trim()
                if (q.length < 2 || places == null) emptyList() else places.searchWards(q).take(8)
            }
            if (query.isNotBlank()) {
                SearchResults(matches, areaStates, wardMatches.map { it.ward }, places, { goToArea(it) }, { goToWard(it) })
            } else {
                if (load.fromCache) {
                    Surface(shape = RoundedCornerShape(Tokens.cornerM), color = LocalStatusColors.current.possible.container) {
                        Text(
                            stringResource(R.string.map_offline_banner, Fmt.time(load.fetchedMs)),
                            Modifier.padding(horizontal = 14.dp, vertical = 10.dp), color = LocalStatusColors.current.possible.onContainer, style = DayType.subhead,
                        )
                    }
                }
                StateChips(map.simulated, filter) { s -> filter = if (s in filter) filter - s else filter + s }
            }
        }
    }

    val cell = selectedId?.let { map.cell(it) ?: spotExtra?.takeIf { e -> e.id == it } }
    if (cell != null) {
        DaySheet(onDismiss = { selectedId = null }) {
            CellSheet(
                cell, map, states[cell.id] ?: cell.state, nowMs, load, isSpot = cell.id == load.spotCellId, followedSlug = followedSlug,
                ward = places?.wardOfCell(cell.id), places = places,
                onFollow = { slug -> followed?.save(slug); followedSlug = slug },
            )
        }
    }
}

/** The floating search capsule: a magnifier, "Search areas", and the list switch. Typing filters the areas. */
@Composable
private fun SearchBar(query: String, onQuery: (String) -> Unit, listView: Boolean, onToggleList: () -> Unit) {
    Surface(
        shape = CircleShape, color = Day.card, shadowElevation = 6.dp,
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        Row(Modifier.padding(start = 18.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Glyph(R.drawable.ic_sym_search, Day.muted, 20.dp)
            Box(Modifier.weight(1f).padding(vertical = 14.dp)) {
                if (query.isEmpty()) {
                    Text(stringResource(R.string.map_search_hint), style = DayType.body, color = Day.muted, maxLines = 1)
                }
                val searchDesc = stringResource(R.string.map_search_hint)
                BasicTextField(
                    value = query, onValueChange = onQuery, singleLine = true,
                    textStyle = DayType.body.copy(color = Day.ink),
                    cursorBrush = SolidColor(Day.focus),
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = searchDesc },
                )
            }
            IconButton(onClick = { if (query.isNotEmpty()) onQuery("") else onToggleList() }, modifier = Modifier.size(48.dp)) {
                Image(
                    painter = painterResource(if (query.isNotEmpty()) R.drawable.ic_sym_close else if (listView) R.drawable.ic_sym_map else R.drawable.ic_sym_layers),
                    contentDescription = stringResource(if (query.isNotEmpty()) R.string.map_search_clear else if (listView) R.string.map_show_map else R.string.map_show_list),
                    modifier = Modifier.size(22.dp),
                    colorFilter = ColorFilter.tint(Day.ink),
                )
            }
        }
    }
}

/** Suggestions under the search capsule: matching areas with their power state, then matching wards (ADR 0056). */
@Composable
private fun SearchResults(
    matches: List<MapArea>,
    areaStates: List<Pair<MapArea, List<CellState>>>,
    wards: List<Ward>,
    places: Places?,
    onPick: (MapArea) -> Unit,
    onPickWard: (Ward) -> Unit,
) {
    Surface(shape = RoundedCornerShape(Tokens.cornerL), color = Day.card, shadowElevation = 6.dp, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(vertical = 6.dp).heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            if (matches.isEmpty() && wards.isEmpty()) {
                Text(stringResource(R.string.map_search_none), Modifier.padding(16.dp), style = DayType.subhead, color = Day.muted)
            }
            matches.forEachIndexed { i, a ->
                if (i > 0) RowDivider(52.dp)
                val worst = worstOf(areaStates.firstOrNull { it.first.slug == a.slug }?.second.orEmpty())
                Row(
                    Modifier.fillMaxWidth().clickable { onPick(a) }.heightIn(min = 56.dp).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    StateSwatch(worst, 22.dp)
                    Text(a.name, style = DayType.body, color = Day.ink, modifier = Modifier.weight(1f))
                    Text(stateWords(worst), style = DayType.subhead, color = textColour(worst))
                }
            }
            wards.forEachIndexed { i, w ->
                if (i > 0 || matches.isNotEmpty()) RowDivider(52.dp)
                Row(
                    Modifier.fillMaxWidth().clickable { onPickWard(w) }.heightIn(min = 56.dp).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Glyph(R.drawable.ic_sym_place, Day.muted, 22.dp)
                    Column(Modifier.weight(1f)) {
                        Text(w.name, style = DayType.body, color = Day.ink)
                        Text(stringResource(R.string.map_search_ward, places?.lga(w.lgaSlug)?.name ?: w.lgaSlug), style = DayType.subhead, color = Day.muted)
                    }
                }
            }
        }
    }
}

private fun worstOf(list: List<CellState>): CellState =
    listOf(CellState.CONFIRMED, CellState.POSSIBLE, CellState.RESTORED, CellState.NORMAL, CellState.NO_DATA).firstOrNull { it in list } ?: CellState.NO_DATA

/** "Simulated", as a pale orange capsule, wherever the data is made up. */
@Composable
fun SimulatedChip() = StatePill(stringResource(R.string.simulated), LocalStatusColors.current.possible)

private fun hexPath(cx: Float, cy: Float, r: Float): Path = Path().apply {
    for (i in 0 until 6) {
        val a = Math.toRadians(60.0 * i - 30.0)
        val x = cx + r * cos(a).toFloat()
        val y = cy + r * sin(a).toFloat()
        if (i == 0) moveTo(x, y) else lineTo(x, y)
    }
    close()
}

/** A round white map button with a soft shadow, a 48 dp target. */
@Composable
private fun MapButton(iconRes: Int, descRes: Int, primary: Boolean = false, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = CircleShape, color = Day.card, shadowElevation = 6.dp, modifier = Modifier.size(48.dp)) {
        Box(contentAlignment = Alignment.Center) {
            Image(painterResource(iconRes), stringResource(descRes), Modifier.size(22.dp), colorFilter = ColorFilter.tint(if (primary) Day.link else Day.ink))
        }
    }
}

/**
 * The state capsules under the search box, like map layers: each has the hexagon swatch and the word (R1.7), and tapping it
 * shows only blocks in that state. "Simulated" leads when the data is made up.
 */
@Composable
private fun StateChips(simulated: Boolean, picked: Set<CellState>, onToggle: (CellState) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (simulated) SimulatedChip()
        for (state in listOf(CellState.CONFIRMED, CellState.POSSIBLE, CellState.NORMAL, CellState.RESTORED, CellState.NO_DATA)) {
            val on = state in picked
            Surface(
                onClick = { onToggle(state) }, shape = CircleShape, color = if (on) Day.ink else Day.card, shadowElevation = 3.dp,
                modifier = Modifier.heightIn(min = 40.dp).semantics { selected = on },
            ) {
                Row(Modifier.padding(start = 10.dp, end = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StateSwatch(state, 16.dp)
                    Text(stateLabel(state), style = DayType.subheadStrong, color = if (on) Day.onInk else Day.ink, maxLines = 1)
                }
            }
        }
    }
}

/** One hexagon drawn with the same fill and pattern as the map, so the legend and the map always agree (R1.7). */
@Composable
fun StateSwatch(state: CellState, sizeDp: Dp) {
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

/** A state's words in its text-safe strong colour (the vivid map colours are for shapes only). */
@Composable
private fun textColour(state: CellState): Color {
    val s = LocalStatusColors.current
    return when (state) {
        CellState.NORMAL -> s.normal.color
        CellState.POSSIBLE -> s.possible.color
        CellState.CONFIRMED -> s.confirmed.color
        CellState.RESTORED -> s.restored.color
        CellState.NO_DATA -> Day.muted
    }
}

@Composable
private fun AreaList(map: AreaMap, areaStates: List<Pair<MapArea, List<CellState>>>, nowMs: Long, onPick: (MapArea) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(horizontal = Gutter, vertical = 12.dp)) {
        items(areaStates, key = { it.first.slug }) { (area, list) ->
            val worst = worstOf(list)
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
            Surface(onClick = { onPick(area) }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = said }, shape = RoundedCornerShape(Tokens.cornerL), color = Day.card) {
                Row(Modifier.heightIn(min = 64.dp).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    StateSwatch(worst, 30.dp)
                    Column(Modifier.weight(1f)) {
                        Text(area.name, style = DayType.headline, color = Day.ink)
                        Text(detail, style = DayType.subhead, color = Day.muted)
                    }
                    Text(stateWords(worst), style = DayType.subheadStrong, color = textColour(worst))
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
    ward: Ward?,
    places: Places?,
    onFollow: (String) -> Unit,
) {
    val area = map.area(cell.areaSlug)
    val name = area?.name ?: ward?.let { places?.areaName(it) } ?: cell.areaSlug
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.weight(1f)) {
                if (isSpot) Text(stringResource(R.string.map_your_spot), style = DayType.subhead, color = Day.muted)
                Text(name, style = DayType.title1, color = Day.ink)
                if (area != null && ward != null) Text(stringResource(R.string.map_sheet_ward, ward.name), style = DayType.subhead, color = Day.muted)
            }
            if (map.simulated) SimulatedChip()
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StateSwatch(state, 22.dp)
            Text(stateWords(state), style = DayType.title3, color = textColour(state))
        }
        val sinceMs = cell.sinceMs
        val restoredMs = cell.restoredMs
        when {
            state == CellState.CONFIRMED && sinceMs != null -> Text(stringResource(R.string.map_since, Fmt.since(sinceMs, nowMs)), style = DayType.callout, color = Day.ink2)
            state == CellState.POSSIBLE && sinceMs != null -> Text(stringResource(R.string.map_possible_since, Fmt.since(sinceMs, nowMs)), style = DayType.callout, color = Day.ink2)
            state == CellState.RESTORED && restoredMs != null -> Text(stringResource(R.string.map_restored_at, Fmt.since(restoredMs, nowMs)), style = DayType.callout, color = Day.ink2)
        }
        // Wording only: never a member count (R2.2, R3.4).
        if (state != CellState.NO_DATA) Text(stringResource(R.string.map_three_plus), style = DayType.subhead, color = Day.muted)
        val (ageRes, ageN) = StatusRes.age(AgeLabel.of(Fmt.ageMinutes(nowMs, load.fetchedMs).toInt()))
        Text(if (ageN == null) stringResource(ageRes) else stringResource(ageRes, ageN), style = DayType.footnote, color = Day.muted)

        if (state != CellState.NO_DATA) {
            Text(stringResource(R.string.map_history_title), style = DayType.headline, color = Day.ink, modifier = Modifier.padding(top = 12.dp))
            val recent = cell.history.filter { it.startMs >= nowMs - 30L * 24 * 3_600_000 }.sortedByDescending { it.startMs }.take(5)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(Tokens.cornerM)).background(Day.page)) {
                if (recent.isEmpty()) {
                    Text(stringResource(R.string.map_history_none), style = DayType.subhead, color = Day.muted, modifier = Modifier.padding(14.dp))
                } else recent.forEachIndexed { i, span ->
                    if (i > 0) RowDivider(14.dp)
                    val dur = (span.endMs ?: nowMs) - span.startMs
                    Text(
                        stringResource(R.string.map_history_row, Fmt.since(span.startMs, nowMs), durationText(dur)),
                        style = DayType.subhead, color = Day.ink2, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    )
                }
            }
        }
        Gap(8.dp)
        val following = followedSlug == cell.areaSlug
        if (following) {
            FillButton(stringResource(R.string.map_following), {}, Modifier.fillMaxWidth(), enabled = false)
        } else {
            InkButton(stringResource(R.string.map_follow), { onFollow(cell.areaSlug) }, Modifier.fillMaxWidth())
        }
    }
}
