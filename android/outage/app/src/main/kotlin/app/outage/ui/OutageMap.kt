package app.outage.ui

import android.content.ComponentCallbacks
import android.content.res.Configuration
import android.view.Gravity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.outage.map.CellState
import app.outage.map.HexGeoJson
import app.outage.map.LatLng
import app.outage.map.MapCell
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.geometry.LatLng as MlLatLng

/**
 * The power map (ADR 0053): a real street map from MapLibre Native with OpenFreeMap's "liberty" style (vector tiles,
 * no key, no account), and the hex grid on top as translucent fills coloured by power state. The hex layers go under
 * the street and place labels so names stay readable. Attribution (OpenFreeMap, OpenMapTiles, OpenStreetMap) stays on.
 * MapLibre Native Android: https://maplibre.org/maplibre-native/android/api/ ; style: https://openfreemap.org/quick_start/
 * MapView must get every lifecycle call: https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.maps/-map-view/index.html
 */
const val MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"

private const val SRC_CELLS = "outage-cells"
private const val SRC_SPOT = "outage-spot"
private const val SRC_OUTLINE = "outage-outline"
private const val SRC_GRID = "outage-grid"
private const val LAYER_GRID = "outage-grid-line"
private const val LAYER_OUTLINE = "outage-outline-line"
private const val LAYER_FILL = "outage-fill"
private const val LAYER_LINE = "outage-line"
private const val LAYER_SELECTED = "outage-selected"
private const val LAYER_SPOT_HALO = "outage-spot-halo"
private const val LAYER_SPOT = "outage-spot-dot"

/** Street level, where hexes are a few hundred metres across. */
const val SPOT_ZOOM = 13.5
const val CITY_ZOOM = 10.2

/** Lagos, where the map opens before it knows anything else. */
val LAGOS = LatLng(6.52, 3.40)

/** Moves the camera of an [OutageMap] from outside: fly to a place, zoom in and out. Safe to call before the map is ready. */
@Stable
class OutageMapController {
    internal var map: MapLibreMap? = null
    private var pending: Pair<LatLng, Double>? = null
    private var pendingFit: List<LatLng>? = null
    private var pendingFitInsets = intArrayOf(96, 96, 96, 96)
    internal var padding = DoubleArray(4)
    private val readySignal = kotlinx.coroutines.CompletableDeferred<Unit>()

    /** Suspends until the street map's style has loaded and the hex layers are on it. */
    suspend fun awaitReady() = readySignal.await()

    fun flyTo(to: LatLng, zoom: Double = SPOT_ZOOM, ms: Int = 1600) {
        val m = map ?: run { pending = to to zoom; pendingFit = null; return }
        val pos = CameraPosition.Builder().target(MlLatLng(to.lat, to.lng)).zoom(zoom).padding(padding).build()
        m.animateCamera(CameraUpdateFactory.newCameraPosition(pos), ms)
    }

    /** Shows all of [points] (a ward's hexagons), with [marginPx] around them. */
    fun fitTo(points: List<LatLng>, ms: Int = 1200, marginPx: Int = 96, topPx: Int = marginPx, bottomPx: Int = marginPx) {
        if (points.size < 2) { points.firstOrNull()?.let { flyTo(it, SPOT_ZOOM, ms) }; return }
        val m = map ?: run { pendingFit = points; pendingFitInsets = intArrayOf(marginPx, topPx, marginPx, bottomPx); pending = null; return }
        val update = CameraUpdateFactory.newLatLngBounds(bounds(points), marginPx, topPx, marginPx, bottomPx)
        if (ms <= 0) m.moveCamera(update) else m.animateCamera(update, ms)
    }

    private fun bounds(points: List<LatLng>): LatLngBounds =
        LatLngBounds.Builder().includes(points.map { MlLatLng(it.lat, it.lng) }).build()

    fun zoomIn() { map?.animateCamera(CameraUpdateFactory.zoomIn()) }
    fun zoomOut() { map?.animateCamera(CameraUpdateFactory.zoomOut()) }

    internal fun ready(m: MapLibreMap) {
        map = m
        pending?.let { (to, z) -> m.moveCamera(CameraUpdateFactory.newCameraPosition(CameraPosition.Builder().target(MlLatLng(to.lat, to.lng)).zoom(z).padding(padding).build())) }
        pending = null
        pendingFit?.let { m.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds(it), pendingFitInsets[0], pendingFitInsets[1], pendingFitInsets[2], pendingFitInsets[3])) }
        pendingFit = null
        readySignal.complete(Unit)
    }
}

/** Fill and line colour of each state on the map: one match expression, so the layers and the legend share [MapColors]. */
private fun stateColour(c: MapColors): Expression = Expression.match(
    Expression.get(HexGeoJson.PROP_STATE),
    Expression.color(c.noData.toArgb()),
    Expression.stop(CellState.NORMAL.name, Expression.color(c.normal.toArgb())),
    Expression.stop(CellState.POSSIBLE.name, Expression.color(c.possible.toArgb())),
    Expression.stop(CellState.CONFIRMED.name, Expression.color(c.confirmed.toArgb())),
    Expression.stop(CellState.RESTORED.name, Expression.color(c.restored.toArgb())),
)

private fun byZoom(vararg stops: Pair<Number, Number>): Expression =
    Expression.interpolate(Expression.linear(), Expression.zoom(), *stops.map { Expression.stop(it.first, it.second) }.toTypedArray())

private fun selectedFilter(id: String?): Expression = Expression.eq(Expression.get(HexGeoJson.PROP_ID), id ?: "")

/**
 * [cells] with their drawn [states]; [spotId] gets the blue "you are here" dot; [selectedId] a dark outline.
 * [outlines] is GeoJSON from [HexGeoJson.lines] (LGA or ward boundaries), drawn as a thin dashed line under the labels.
 * [grid] is GeoJSON from [HexGeoJson.grid]: every hex of Lagos as thin lines, under the outlines.
 * [top] and [bottom] are how much of the map other things cover (the search bar, the sheet), so the camera centres
 * places in the part people can see. [onTap] gets the tapped cell id, or null for a tap on no cell.
 */
@Composable
fun OutageMap(
    cells: List<MapCell>,
    states: Map<String, CellState>,
    spotId: String?,
    selectedId: String?,
    controller: OutageMapController,
    modifier: Modifier = Modifier,
    top: Dp = 0.dp,
    bottom: Dp = 0.dp,
    interactive: Boolean = true,
    description: String = "",
    outlines: String? = null,
    grid: String? = null,
    onTap: (String?) -> Unit = {},
) {
    val context = LocalContext.current
    val colors = LocalStatusColors.current.map
    val density = LocalDensity.current
    val tap by rememberUpdatedState(onTap)
    var style by remember { mutableStateOf<Style?>(null) }
    // MapLibre must be initialised before the first MapView. No key: OpenFreeMap needs none.
    val mapView = remember {
        MapLibre.getInstance(context.applicationContext)
        MapView(context).apply { onCreate(null) }
    }

    // Forward the screen's lifecycle to the MapView, and low memory from the system.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, mapView) {
        var started = false
        var resumed = false
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> { mapView.onStart(); started = true }
                Lifecycle.Event.ON_RESUME -> { mapView.onResume(); resumed = true }
                Lifecycle.Event.ON_PAUSE -> { mapView.onPause(); resumed = false }
                Lifecycle.Event.ON_STOP -> { mapView.onStop(); started = false }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        val memory = object : ComponentCallbacks {
            override fun onConfigurationChanged(newConfig: Configuration) = Unit
            @Deprecated("Deprecated in Java")
            override fun onLowMemory() = mapView.onLowMemory()
        }
        context.registerComponentCallbacks(memory)
        onDispose {
            context.unregisterComponentCallbacks(memory)
            lifecycle.removeObserver(observer)
            if (resumed) mapView.onPause()
            if (started) mapView.onStop()
            mapView.onDestroy()
            controller.map = null
        }
    }

    // Load the style once, then add the hex source and layers under the first label layer.
    DisposableEffect(mapView) {
        mapView.getMapAsync { map ->
            map.uiSettings.apply {
                setAttributionEnabled(true)
                setLogoEnabled(false)
                setTiltGesturesEnabled(false)
                setCompassEnabled(true)
                setAllGesturesEnabled(interactive)
            }
            map.setMinZoomPreference(3.0)
            map.setMaxZoomPreference(18.0)
            map.setStyle(Style.Builder().fromUri(MAP_STYLE_URL)) { s ->
                s.addSource(GeoJsonSource(SRC_CELLS, HexGeoJson.cells(emptyList(), emptyMap(), null)))
                s.addSource(GeoJsonSource(SRC_SPOT, HexGeoJson.point(null)))
                s.addSource(GeoJsonSource(SRC_OUTLINE, HexGeoJson.lines(emptyList())))
                s.addSource(GeoJsonSource(SRC_GRID, HexGeoJson.lines(emptyList())))
                val gridLine = LineLayer(LAYER_GRID, SRC_GRID).withProperties(
                    PropertyFactory.lineColor(Tokens.Colors.ink.toArgb()),
                    PropertyFactory.lineWidth(byZoom(8 to 0.5, 11 to 0.8, 14 to 1.2)),
                    PropertyFactory.lineOpacity(0.4f),
                )
                val outline = LineLayer(LAYER_OUTLINE, SRC_OUTLINE).withProperties(
                    PropertyFactory.lineColor(Tokens.Colors.ink.toArgb()),
                    PropertyFactory.lineWidth(byZoom(9 to 0.8, 13 to 1.6, 16 to 2.4)),
                    PropertyFactory.lineOpacity(0.45f),
                    PropertyFactory.lineDasharray(arrayOf(2f, 1.5f)),
                )
                val fill = FillLayer(LAYER_FILL, SRC_CELLS).withProperties(
                    PropertyFactory.fillColor(stateColour(colors)),
                    PropertyFactory.fillOpacity(byZoom(9 to 0.45, 13 to 0.35, 16 to 0.25)),
                )
                val line = LineLayer(LAYER_LINE, SRC_CELLS).withProperties(
                    PropertyFactory.lineColor(stateColour(colors)),
                    PropertyFactory.lineWidth(byZoom(9 to 0.4, 13 to 1.2, 16 to 2.2)),
                    PropertyFactory.lineOpacity(0.9f),
                )
                val selected = LineLayer(LAYER_SELECTED, SRC_CELLS).withFilter(selectedFilter(null)).withProperties(
                    PropertyFactory.lineColor(Tokens.Colors.ink.toArgb()),
                    PropertyFactory.lineWidth(3.5f),
                )
                val firstLabel = s.layers.firstOrNull { it is SymbolLayer }?.id
                for (layer in listOf(fill, line, gridLine, outline, selected)) {
                    if (firstLabel != null) s.addLayerBelow(layer, firstLabel) else s.addLayer(layer)
                }
                s.addLayer(
                    CircleLayer(LAYER_SPOT_HALO, SRC_SPOT).withProperties(
                        PropertyFactory.circleRadius(18f),
                        PropertyFactory.circleColor(colors.spot.toArgb()),
                        PropertyFactory.circleOpacity(0.18f),
                    ),
                )
                s.addLayer(
                    CircleLayer(LAYER_SPOT, SRC_SPOT).withProperties(
                        PropertyFactory.circleRadius(7f),
                        PropertyFactory.circleColor(colors.spot.toArgb()),
                        PropertyFactory.circleStrokeColor(android.graphics.Color.WHITE),
                        PropertyFactory.circleStrokeWidth(3f),
                    ),
                )
                style = s
                controller.ready(map)
            }
            map.addOnMapClickListener { point ->
                val screen = map.projection.toScreenLocation(point)
                val hit = map.queryRenderedFeatures(screen, LAYER_FILL).firstOrNull()
                tap(hit?.getStringProperty(HexGeoJson.PROP_ID))
                true
            }
        }
        onDispose { }
    }

    // Keep the camera's padding and the attribution clear of the bar and the sheet.
    LaunchedEffect(top, bottom, style) {
        val t = with(density) { top.toPx() }.toDouble()
        val b = with(density) { bottom.toPx() }.toDouble()
        controller.padding = doubleArrayOf(0.0, t, 0.0, b)
        val m = controller.map ?: return@LaunchedEffect
        val margin = with(density) { 8.dp.roundToPx() }
        m.uiSettings.setAttributionGravity(Gravity.BOTTOM or Gravity.START)
        m.uiSettings.setAttributionMargins(margin, 0, 0, b.toInt() + margin)
        m.uiSettings.setCompassMargins(0, t.toInt() + margin, margin, 0)
    }

    // Live data: replace the GeoJSON whenever states or the spot change, and move the selection outline.
    LaunchedEffect(style, cells, states, spotId) {
        val s = style ?: return@LaunchedEffect
        s.getSourceAs<GeoJsonSource>(SRC_CELLS)?.setGeoJson(HexGeoJson.cells(cells, states, spotId))
        val spot = spotId?.let { id -> cells.firstOrNull { it.id == id } }?.let(HexGeoJson::centre)
        s.getSourceAs<GeoJsonSource>(SRC_SPOT)?.setGeoJson(HexGeoJson.point(spot))
    }
    LaunchedEffect(style, outlines) {
        style?.getSourceAs<GeoJsonSource>(SRC_OUTLINE)?.setGeoJson(outlines ?: HexGeoJson.lines(emptyList()))
    }
    LaunchedEffect(style, grid) {
        style?.getSourceAs<GeoJsonSource>(SRC_GRID)?.setGeoJson(grid ?: HexGeoJson.lines(emptyList()))
    }
    LaunchedEffect(style, selectedId) {
        (style?.getLayer(LAYER_SELECTED) as? LineLayer)?.setFilter(selectedFilter(selectedId))
    }

    AndroidView(factory = { mapView }, modifier = modifier.semantics { if (description.isNotEmpty()) contentDescription = description })
}
