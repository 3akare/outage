package app.outage.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.outage.R
import app.outage.map.CellState
import app.outage.map.HexGeoJson
import app.outage.map.MapCell
import app.outage.places.Lga
import app.outage.places.PlacePick
import app.outage.places.Places
import app.outage.places.PlacesAssets
import app.outage.places.PlacesGeo
import app.outage.places.Postcode
import app.outage.places.Ward
import app.outage.places.WardHit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Where the person can find their NIPOST postcode for free (ADR 0056). */
const val POSTCODE_FINDER_URL = "https://postcode.gov.ng/find"

/** The Lagos places, parsed once off the main thread (ADR 0056). Null while loading. */
@Composable
fun rememberPlaces(): Places? {
    val ctx = LocalContext.current.applicationContext
    var places by remember { mutableStateOf(PlacesAssets.cachedPlaces()) }
    LaunchedEffect(Unit) { if (places == null) places = withContext(Dispatchers.IO) { PlacesAssets.places(ctx) } }
    return places
}

/** Hexagon corners and outlines for the maps, parsed once off the main thread. Null while loading. */
@Composable
fun rememberPlacesGeo(): PlacesGeo? {
    val ctx = LocalContext.current.applicationContext
    var geo by remember { mutableStateOf(PlacesAssets.cachedGeo()) }
    LaunchedEffect(Unit) { if (geo == null) geo = withContext(Dispatchers.IO) { PlacesAssets.geo(ctx) } }
    return geo
}

/**
 * "Where do you live?" (ADR 0056), shared by first run and Settings > Your spot. Three steps: the local government (search,
 * or a NIPOST postcode that picks it), the ward (search, alternative names too), then, only for a ward with more than one
 * hexagon, the hexagon on the street map with the ward's anchor already chosen. No location is read. [onPicked] gets the
 * cell and "Ward, LGA"; the postcode never leaves this screen. Back goes one step back, and from the first step [onExit].
 */
@Composable
fun PlacePicker(onPicked: (PlacePick) -> Unit, onExit: () -> Unit, saving: Boolean = false) {
    val places = rememberPlaces()
    var lgaSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var wardSlug by rememberSaveable { mutableStateOf<String?>(null) }
    val lga = lgaSlug?.let { places?.lga(it) }
    val ward = wardSlug?.let { places?.ward(it) }
    val back: () -> Unit = {
        when {
            wardSlug != null -> wardSlug = null
            lgaSlug != null -> lgaSlug = null
            else -> onExit()
        }
    }
    BackHandler(onBack = back)

    Column(Modifier.fillMaxSize().background(Day.page)) {
        BackRow(back)
        val step = when { ward != null -> 2; lga != null -> 1; else -> 0 }
        Box(Modifier.padding(horizontal = Gutter, vertical = 4.dp)) {
            StepTrack(
                step,
                listOf(stringResource(R.string.place_step_lga), stringResource(R.string.place_step_ward), stringResource(R.string.place_step_street)),
                List(3) { Day.ink },
            )
        }
        when {
            places == null -> Loading()
            ward != null && lga != null -> CellStep(places, ward, saving, onUse = onPicked)
            lga != null -> WardStep(places, lga) { w ->
                if (w.needsMap) wardSlug = w.slug else onPicked(places.pick(w))
            }
            else -> LgaStep(places) { lgaSlug = it.slug }
        }
    }
}

@Composable
private fun Loading() {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically)) {
        CircularProgressIndicator(Modifier.size(28.dp), color = Day.ink, strokeWidth = 2.5.dp)
        Text(stringResource(R.string.place_loading), style = DayType.subhead, color = Day.muted)
    }
}

/** The step title and its line, under the step track. */
@Composable
private fun StepTitle(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, top = 16.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = DayType.title1, color = Day.ink, modifier = Modifier.semantics { heading() })
        Text(body, style = DayType.subhead, color = Day.ink2)
    }
}

/** A grey search capsule with a magnifier and a clear button. It stays above the list while the list scrolls. */
@Composable
fun PlaceSearchField(value: String, onChange: (String) -> Unit, hint: String) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Gutter).heightIn(min = 48.dp).clip(RoundedCornerShape(Tokens.cornerM)).background(Day.fill).padding(start = 14.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Glyph(R.drawable.ic_sym_search, Day.muted, 20.dp)
        Box(Modifier.weight(1f).padding(vertical = 13.dp)) {
            if (value.isEmpty()) Text(hint, style = DayType.body, color = Day.muted, maxLines = 1)
            BasicTextField(
                value = value, onValueChange = onChange, singleLine = true,
                textStyle = DayType.body.copy(color = Day.ink),
                cursorBrush = SolidColor(Day.focus),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Search),
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = hint },
            )
        }
        if (value.isNotEmpty()) {
            val clear = stringResource(R.string.map_search_clear)
            Box(
                Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button) { onChange("") }.semantics { contentDescription = clear },
                contentAlignment = Alignment.Center,
            ) { Glyph(R.drawable.ic_sym_close, Day.muted, 18.dp) }
        }
    }
}

@Composable
private fun LgaStep(places: Places, onPick: (Lga) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    // The postcode stays in memory only: not saved state, not stored, not sent (privacy.md).
    var postcode by remember { mutableStateOf("") }
    val fromQuery = remember(query) { places.lgaForPostcode(query) }
    val results = remember(query) { if (fromQuery != null) listOf(fromQuery) else places.searchLgas(query) }
    StepTitle(stringResource(R.string.place_lga_title), stringResource(R.string.place_lga_body))
    PlaceSearchField(query, { query = it }, stringResource(R.string.place_lga_search))
    val list = rememberLazyListState()
    LaunchedEffect(query) { list.scrollToItem(0) }
    LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = 32.dp)) {
        if (query.isBlank()) item(key = "postcode") { PostcodeCard(places, postcode, { postcode = it }, onPick) }
        item(key = "lga-header") {
            GroupHeader(
                if (fromQuery != null) stringResource(R.string.place_postcode_found)
                else if (query.isBlank()) stringResource(R.string.place_lga_count, places.lgas.size)
                else stringResource(R.string.place_results),
            )
        }
        if (results.isEmpty()) {
            item(key = "lga-none") { EmptyCard(stringResource(R.string.place_lga_none, query.trim()), stringResource(R.string.place_lga_none_hint)) }
        }
        groupedRows(results, key = { "lga-" + it.slug }) { l ->
            DayRow(
                l.name,
                subtitle = stringResource(R.string.place_lga_wards, l.wardSlugs.size),
                value = stringResource(R.string.place_lga_code, l.nipost),
                chevron = true,
                onClick = { onPick(l) },
            )
        }
    }
}

/** "Or use your postcode": decoded on the phone to the LGA, with the free finder one tap away. */
@Composable
private fun PostcodeCard(places: Places, postcode: String, onChange: (String) -> Unit, onPick: (Lga) -> Unit) {
    val uri = LocalUriHandler.current
    val focus = LocalFocusManager.current
    val parsed = remember(postcode) { Postcode.parse(postcode) }
    val lga = remember(postcode) { places.lgaForPostcode(postcode) }
    GroupHeader(stringResource(R.string.place_postcode_header))
    DayCard {
        val label = stringResource(R.string.place_postcode_label)
        Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            IconTile(R.drawable.ic_sym_receipt, Tokens.Colors.tileGreen)
            Box(Modifier.weight(1f).padding(vertical = 15.dp)) {
                if (postcode.isEmpty()) Text(stringResource(R.string.place_postcode_hint), style = DayType.body, color = Day.muted, maxLines = 1)
                BasicTextField(
                    value = postcode,
                    onValueChange = { onChange(it.uppercase().take(20)) },
                    singleLine = true,
                    textStyle = DayType.body.copy(color = Day.ink, fontFeatureSettings = "tnum"),
                    cursorBrush = SolidColor(Day.focus),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false, imeAction = ImeAction.Done),
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
                )
            }
        }
        if (lga != null) {
            RowDivider(TileInset)
            DayRow(
                lga.name,
                subtitle = stringResource(R.string.place_lga_wards, lga.wardSlugs.size),
                tile = R.drawable.ic_sym_check to Tokens.Colors.tileBlue,
                value = stringResource(R.string.place_lga_code, lga.nipost),
                chevron = true,
                onClick = { focus.clearFocus(); onPick(lga) },
            )
        }
    }
    when (parsed) {
        Postcode.Result.NotLagos -> ErrorFooter(stringResource(R.string.place_postcode_not_lagos))
        Postcode.Result.Invalid -> ErrorFooter(stringResource(R.string.place_postcode_invalid))
        else -> GroupFooter(stringResource(R.string.place_postcode_privacy))
    }
    Box(Modifier.padding(start = Gutter + 4.dp, top = 2.dp)) {
        TextAction(stringResource(R.string.place_postcode_find), { uri.openUri(POSTCODE_FINDER_URL) })
    }
}

@Composable
private fun ErrorFooter(text: String) {
    Text(text, style = DayType.footnote, color = LocalStatusColors.current.confirmed.color, modifier = Modifier.padding(start = Gutter + 16.dp, end = Gutter + 8.dp, top = 8.dp))
}

@Composable
private fun EmptyCard(title: String, body: String) {
    DayCard(padding = 20.dp) {
        Text(title, style = DayType.headline, color = Day.ink)
        Text(body, style = DayType.subhead, color = Day.muted, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun WardStep(places: Places, lga: Lga, onPick: (Ward) -> Unit) {
    var query by rememberSaveable(lga.slug) { mutableStateOf("") }
    val results = remember(query, lga.slug) { places.searchWards(query, lga.slug) }
    StepTitle(stringResource(R.string.place_ward_title), stringResource(R.string.place_ward_in, lga.name))
    PlaceSearchField(query, { query = it }, stringResource(R.string.place_ward_search, lga.name))
    val list = rememberLazyListState()
    LaunchedEffect(query) { list.scrollToItem(0) }
    LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = 32.dp)) {
        item(key = "ward-header") {
            GroupHeader(if (query.isBlank()) stringResource(R.string.place_ward_count, results.size) else stringResource(R.string.place_results))
        }
        if (results.isEmpty()) {
            item(key = "ward-none") { EmptyCard(stringResource(R.string.place_ward_none, lga.name, query.trim()), stringResource(R.string.place_ward_none_hint)) }
        }
        groupedRows(results, key = { "ward-" + it.ward.slug }) { hit: WardHit ->
            DayRow(
                hit.ward.name,
                subtitle = hit.alias?.let { stringResource(R.string.place_ward_alias, it) },
                chevron = true,
                onClick = { onPick(hit.ward) },
            )
        }
        item(key = "ward-footer") { GroupFooter(stringResource(R.string.place_ward_footer)) }
    }
}

/** The ward's hexagons over the street map; the anchor is chosen until the person taps another one. */
@Composable
private fun CellStep(places: Places, ward: Ward, saving: Boolean, onUse: (PlacePick) -> Unit) {
    val geo = rememberPlacesGeo()
    var chosen by rememberSaveable(ward.slug) { mutableStateOf(places.anchorFor(ward)) }
    StepTitle(stringResource(R.string.place_cell_title, ward.name), stringResource(R.string.place_cell_body))
    if (geo == null) { Loading(); return }
    val cells = remember(ward, geo) {
        ward.cells.mapNotNull { id -> geo.ring(id)?.let { MapCell(id, ward.slug, CellState.NO_DATA, null, null, emptyList(), it) } }
    }
    val states = remember(cells) { cells.associate { it.id to CellState.NO_DATA } }
    val outline = remember(ward, geo) { geo.wardOutlines[ward.slug]?.let(HexGeoJson::lines) }
    val camera = remember(ward.slug) { OutageMapController() }
    LaunchedEffect(ward.slug) { camera.fitTo(cells.flatMap { it.ring }, ms = 0) }
    val desc = stringResource(R.string.place_cell_map_desc, ward.name)
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxWidth().padding(horizontal = Gutter).clip(RoundedCornerShape(Tokens.cornerXl))) {
            OutageMap(
                cells, states, spotId = chosen, selectedId = chosen, controller = camera,
                modifier = Modifier.fillMaxSize(), description = desc, outlines = outline,
                onTap = { id -> if (id != null && id in ward.cells) chosen = id },
            )
        }
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Text(
                stringResource(R.string.place_cell_size),
                style = DayType.footnote, color = Day.muted,
                modifier = Modifier.padding(start = Gutter + 4.dp, end = Gutter, top = 12.dp),
            )
            ActionStack {
                InkButton(stringResource(R.string.place_cell_use), { onUse(places.pick(ward, chosen)) }, Modifier.fillMaxWidth(), busy = saving)
            }
        }
    }
}

private val RowShape = RoundedCornerShape(Tokens.cornerL)

/** The rows of one grouped card, as lazy items: rounded top on the first, rounded bottom on the last, hairlines between. */
private fun <T> LazyListScope.groupedRows(rows: List<T>, key: (T) -> String, row: @Composable (T) -> Unit) {
    itemsIndexed(rows, key = { _, r -> key(r) }) { i, r ->
        val shape: Shape = when {
            rows.size == 1 -> RowShape
            i == 0 -> RoundedCornerShape(topStart = Tokens.cornerL, topEnd = Tokens.cornerL)
            i == rows.lastIndex -> RoundedCornerShape(bottomStart = Tokens.cornerL, bottomEnd = Tokens.cornerL)
            else -> RoundedCornerShape(0.dp)
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = Gutter).clip(shape).background(Day.card)) {
            if (i > 0) RowDivider()
            row(r)
        }
    }
}
