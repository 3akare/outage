package app.outage.ui

import android.content.Context
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import app.outage.map.CellState
import app.outage.map.GlobeCamera
import app.outage.map.GlobeFlight
import app.outage.map.GlobeMath
import app.outage.map.LatLng
import app.outage.map.MapCell
import org.json.JSONArray
import org.json.JSONObject
import java.util.Base64
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * The Earth's land as dots and the Lagos coast, read once from the assets that the build copies from core/shared/geo
 * (ADR 0051). Natural Earth, public domain. The web inlines the same files.
 */
class GlobeData(val sinLat: FloatArray, val cosLat: FloatArray, val lng: FloatArray, val coast: List<List<LatLng>>) {
    companion object {
        @Volatile private var cached: GlobeData? = null

        fun load(context: Context): GlobeData = cached ?: synchronized(this) {
            cached ?: parse(
                context.assets.open("land-dots.json").bufferedReader().readText(),
                context.assets.open("lagos-coast.json").bufferedReader().readText(),
            ).also { cached = it }
        }

        fun parse(dotsJson: String, coastJson: String): GlobeData {
            val bytes = Base64.getDecoder().decode(JSONObject(dotsJson).getString("data"))
            val n = bytes.size / 4
            val s = FloatArray(n)
            val c = FloatArray(n)
            val l = FloatArray(n)
            fun i16(i: Int): Int = ((bytes[i].toInt() and 0xFF) or (bytes[i + 1].toInt() shl 8)).toShort().toInt()
            for (k in 0 until n) {
                val lat = i16(k * 4) / 100.0 * PI / 180
                s[k] = sin(lat).toFloat()
                c[k] = cos(lat).toFloat()
                l[k] = (i16(k * 4 + 2) / 100.0 * PI / 180).toFloat()
            }
            val lines = JSONObject(coastJson).getJSONArray("lines")
            val coast = (0 until lines.length()).map { i ->
                val line: JSONArray = lines.getJSONArray(i)
                (0 until line.length()).map { j -> line.getJSONArray(j).let { LatLng(it.getDouble(0), it.getDouble(1)) } }
            }
            return GlobeData(s, c, l, coast)
        }
    }
}

/** What the globe should do next. Changing [key] starts a new flight. */
data class GlobeTarget(val lat: Double, val lng: Double, val km: Double?, val key: Int)

private val LAGOS = LatLng(6.5244, 3.3792)

/**
 * The globe (ADR 0051): the Earth in an orthographic projection that turns by itself when nobody touches it, follows a
 * drag, zooms with a pinch, and flies down to [target]. Land is dots; power blocks are drawn on the sphere with the
 * same colours and patterns as the web. Far away, the city is a beacon coloured by its worst state.
 */
@Composable
fun GlobeView(
    data: GlobeData,
    cells: List<MapCell>,
    states: Map<String, CellState>,
    spotId: String?,
    selectedId: String?,
    labels: List<Triple<String, LatLng, Boolean>>,
    target: GlobeTarget?,
    topInset: Dp,
    bottomInset: Dp,
    summary: String,
    onTap: (String?) -> Unit,
) {
    val density = LocalDensity.current
    val top = with(density) { topInset.toPx() }.toDouble()
    val bottom = with(density) { bottomInset.toPx() }.toDouble()
    var size by remember { mutableStateOf(IntSize.Zero) }
    var camera by remember { mutableStateOf(GlobeCamera(GlobeCamera.deg(8.0), GlobeCamera.deg(6.0), 0.0)) }
    var flight by remember { mutableStateOf<Pair<GlobeFlight, Long>?>(null) }
    var touching by remember { mutableStateOf(false) }
    var spinning by remember { mutableStateOf(true) }
    var frame by remember { mutableLongStateOf(0L) }
    val tap by rememberUpdatedState(onTap)
    val colors = LocalStatusColors.current.map
    val restPx = (min(size.width.toDouble(), size.height - top - bottom) * 0.42).coerceAtLeast(1.0)
    val maxPx = GlobeCamera.radiusFor(1.2, max(1.0, size.width.toDouble()))

    if (camera.radiusPx == 0.0 && size != IntSize.Zero) camera = camera.copy(radiusPx = restPx)

    // A new target starts a flight from wherever the camera is.
    LaunchedEffect(target?.key, size) {
        val t = target ?: return@LaunchedEffect
        if (size == IntSize.Zero) return@LaunchedEffect
        val to = GlobeCamera(GlobeCamera.deg(t.lat), GlobeCamera.deg(t.lng), t.km?.let { GlobeCamera.radiusFor(it, size.width.toDouble()) } ?: restPx)
        flight = GlobeFlight(camera, to) to System.nanoTime()
        spinning = false
    }
    // One frame clock: flights, the idle spin and the outage pulse.
    LaunchedEffect(Unit) {
        var last = 0L
        while (true) {
            withFrameNanos { now ->
                val dt = if (last == 0L) 16L else min(64L, (now - last) / 1_000_000)
                last = now
                flight?.let { (f, start) ->
                    val k = (now - start) / 2_200_000_000.0
                    camera = f.at(k)
                    if (k >= 1) flight = null
                }
                if (spinning && !touching && flight == null && camera.radiusPx > 0) {
                    camera = camera.copy(lon = camera.lon + dt * 0.00006 * (restPx / camera.radiusPx))
                }
                frame = now
            }
        }
    }

    val paint = remember { Paint(Paint.ANTI_ALIAS_FLAG) }
    val text = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) } }
    val dash = remember { DashPathEffect(floatArrayOf(14f, 10f), 0f) }
    val hatch = remember { DashPathEffect(floatArrayOf(10f, 8f), 0f) }

    Canvas(
        Modifier.fillMaxSize().onSizeChanged { size = it }.semantics { contentDescription = summary }
            .pointerInput(restPx, maxPx) {
                detectTransformGestures { _, pan, zoom, _ ->
                    touching = true
                    flight = null
                    spinning = false
                    camera = camera.dragBy(pan.x.toDouble(), pan.y.toDouble()).zoomBy(zoom.toDouble(), restPx * 0.8, maxPx)
                    touching = false
                }
            }
            .pointerInput(cells, restPx) {
                detectTapGestures(
                    onDoubleTap = { flight = GlobeFlight(camera, camera.zoomBy(2.0, restPx * 0.8, maxPx)) to System.nanoTime() },
                    onTap = { o ->
                        val cx = size.width / 2.0
                        val cy = top + (size.height - top - bottom) / 2
                        val hit = cells.firstOrNull { c ->
                            val pts = c.ring.map { camera.project(GlobeCamera.deg(it.lat), GlobeCamera.deg(it.lng), cx, cy) }
                            pts.all { it.visible } && GlobeMath.inside(o.x.toDouble(), o.y.toDouble(), pts.map { it.x }.toDoubleArray(), pts.map { it.y }.toDoubleArray())
                        }
                        tap(hit?.id)
                    },
                )
            },
    ) {
        @Suppress("UNUSED_EXPRESSION") frame // redraw on every frame of the clock
        val w = size.width.toFloat()
        val h = size.height.toFloat()
        if (w == 0f || camera.radiusPx <= 0) return@Canvas
        val cx = w / 2.0
        val cy = top + (h - top - bottom) / 2.0
        val r = camera.radiusPx
        val big = r > hypot(w.toDouble(), h.toDouble()) * 1.5
        drawIntoCanvas { canvas ->
            val nc = canvas.nativeCanvas
            // Space, the atmosphere and the ocean.
            paint.style = Paint.Style.FILL
            paint.shader = null
            paint.color = colors.space.toArgb()
            nc.drawRect(0f, 0f, w, h, paint)
            if (!big) {
                paint.shader = RadialGradient(cx.toFloat(), cy.toFloat(), (r * 1.22).toFloat(), intArrayOf(0x594C9DFF, 0x1F4C9DFF, 0x004C9DFF), floatArrayOf(0.75f, 0.85f, 1f), Shader.TileMode.CLAMP)
                nc.drawCircle(cx.toFloat(), cy.toFloat(), (r * 1.22).toFloat(), paint)
            }
            paint.shader = RadialGradient((cx - r * 0.35).toFloat(), (cy - r * 0.4).toFloat(), max(1f, r.toFloat() * 1.3f), intArrayOf(0xFF1B2A5E.toInt(), 0xFF070B1C.toInt()), null, Shader.TileMode.CLAMP)
            if (big) nc.drawRect(0f, 0f, w, h, paint) else nc.drawCircle(cx.toFloat(), cy.toFloat(), r.toFloat(), paint)
            paint.shader = null

            // Land dots, in three brightness bands by how much they face us; they fade out near the ground.
            val zoom = r / restPx
            val fade = GlobeMath.dotFade(zoom)
            if (fade > 0) {
                val s0 = sin(camera.lat).toFloat()
                val c0 = cos(camera.lat).toFloat()
                val bands = Array(3) { FloatArray(data.lng.size * 2) }
                val counts = IntArray(3)
                for (i in data.lng.indices) {
                    val d = data.lng[i] - camera.lon.toFloat()
                    val cd = cos(d)
                    val facing = s0 * data.sinLat[i] + c0 * data.cosLat[i] * cd
                    if (facing <= 0.02f) continue
                    val x = (cx + r * data.cosLat[i] * sin(d)).toFloat()
                    val y = (cy - r * (c0 * data.sinLat[i] - s0 * data.cosLat[i] * cd)).toFloat()
                    if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue
                    val b = if (facing > 0.66f) 2 else if (facing > 0.33f) 1 else 0
                    bands[b][counts[b] * 2] = x
                    bands[b][counts[b] * 2 + 1] = y
                    counts[b]++
                }
                paint.strokeWidth = (r * 0.0055).toFloat().coerceIn(2.2f, 6.4f)
                paint.strokeCap = Paint.Cap.ROUND
                for (b in 0..2) {
                    paint.color = android.graphics.Color.argb((255 * fade * (0.32 + b * 0.22)).toInt(), 170 + b * 15, 190 + b * 12, 255)
                    nc.drawPoints(bands[b], 0, counts[b] * 2, paint)
                }
            }

            // The Lagos coast, once close.
            if (zoom > 6) {
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 3f
                paint.color = android.graphics.Color.argb((255 * min(0.5, (zoom - 6) / 20)).toInt(), 160, 180, 255)
                for (line in data.coast) {
                    val path = Path()
                    var started = false
                    for (p in line) {
                        val q = camera.project(GlobeCamera.deg(p.lat), GlobeCamera.deg(p.lng), cx, cy)
                        if (!q.visible) continue
                        if (started) path.lineTo(q.x.toFloat(), q.y.toFloat()) else { path.moveTo(q.x.toFloat(), q.y.toFloat()); started = true }
                    }
                    nc.drawPath(path, paint)
                }
            }

            val blockPx = cells.firstOrNull()?.let { GlobeMath.blockPx(it.ring, r) } ?: 0.0
            val pulse = ((frame / 1_000_000L) % 1900L) / 1900f
            if (blockPx < 10) {
                // Too small to draw blocks: a beacon over the city, coloured by its worst state.
                if (cells.isNotEmpty()) {
                    val q = camera.project(GlobeCamera.deg(LAGOS.lat), GlobeCamera.deg(LAGOS.lng), cx, cy)
                    if (q.visible) {
                        val c = MapPalette.accent(worstOf(states.values), colors).toArgb()
                        paint.style = Paint.Style.FILL
                        paint.color = c
                        paint.alpha = (60 * (1 - pulse)).toInt()
                        nc.drawCircle(q.x.toFloat(), q.y.toFloat(), 14f + 50f * pulse, paint)
                        paint.alpha = 255
                        nc.drawCircle(q.x.toFloat(), q.y.toFloat(), 10f, paint)
                        text.color = colors.label.toArgb()
                        text.textSize = 34f
                        text.textAlign = Paint.Align.LEFT
                        nc.drawText("Lagos", q.x.toFloat() + 24f, q.y.toFloat() + 12f, text)
                    }
                }
            } else {
                for (cell in cells) {
                    val pts = cell.ring.map { camera.project(GlobeCamera.deg(it.lat), GlobeCamera.deg(it.lng), cx, cy) }
                    if (!pts.all { it.visible }) continue
                    val path = Path().apply {
                        pts.forEachIndexed { i, q -> if (i == 0) moveTo(q.x.toFloat(), q.y.toFloat()) else lineTo(q.x.toFloat(), q.y.toFloat()) }
                        close()
                    }
                    val st = states[cell.id] ?: cell.state
                    val accent = MapPalette.accent(st, colors).toArgb()
                    paint.style = Paint.Style.FILL
                    paint.pathEffect = null
                    when (st) {
                        CellState.NO_DATA -> { paint.color = accent; paint.alpha = 26; nc.drawPath(path, paint) }
                        CellState.NORMAL -> { paint.color = accent; paint.alpha = 82; nc.drawPath(path, paint) }
                        CellState.RESTORED -> { paint.color = accent; paint.alpha = 72; nc.drawPath(path, paint) }
                        CellState.CONFIRMED -> {
                            paint.color = accent; paint.alpha = 60
                            paint.style = Paint.Style.STROKE; paint.strokeWidth = 28f; nc.drawPath(path, paint) // glow
                            paint.style = Paint.Style.FILL; paint.alpha = 210; nc.drawPath(path, paint)
                        }
                        CellState.POSSIBLE -> {
                            paint.color = accent; paint.alpha = 90; nc.drawPath(path, paint)
                            // Hatch: diagonal stripes clipped to the block.
                            nc.save(); nc.clipPath(path)
                            paint.alpha = 240; paint.style = Paint.Style.STROKE; paint.strokeWidth = 7f
                            val minX = pts.minOf { it.x }.toFloat(); val maxX = pts.maxOf { it.x }.toFloat()
                            val minY = pts.minOf { it.y }.toFloat(); val maxY = pts.maxOf { it.y }.toFloat()
                            var x = minX - (maxY - minY)
                            while (x < maxX) { nc.drawLine(x, maxY, x + (maxY - minY), minY, paint); x += 16f }
                            nc.restore()
                        }
                    }
                    paint.style = Paint.Style.STROKE
                    paint.alpha = 255
                    paint.strokeWidth = 4f
                    paint.color = colors.edge.toArgb()
                    if (st == CellState.NO_DATA) { paint.pathEffect = hatch; paint.color = accent; paint.alpha = 140 }
                    if (st == CellState.RESTORED) { paint.color = accent; paint.strokeWidth = 5f }
                    nc.drawPath(path, paint)
                    paint.pathEffect = null
                    if (st == CellState.CONFIRMED) {
                        paint.color = accent; paint.alpha = (180 * (1 - pulse)).toInt(); paint.strokeWidth = 4f + 22f * pulse
                        nc.drawPath(path, paint); paint.alpha = 255
                    }
                    if (cell.id == selectedId) {
                        paint.pathEffect = dash; paint.color = android.graphics.Color.WHITE; paint.strokeWidth = 4f
                        nc.drawPath(path, paint); paint.pathEffect = null
                    }
                }
                // "You are here": a white-ringed dot with a halo at the centre of the spot block.
                cells.firstOrNull { it.id == spotId }?.let { s ->
                    val lat = s.ring.sumOf { it.lat } / s.ring.size
                    val lng = s.ring.sumOf { it.lng } / s.ring.size
                    val q = camera.project(GlobeCamera.deg(lat), GlobeCamera.deg(lng), cx, cy)
                    if (q.visible) {
                        paint.style = Paint.Style.FILL
                        paint.color = colors.spot.toArgb(); paint.alpha = 56
                        nc.drawCircle(q.x.toFloat(), q.y.toFloat(), min(64f, (blockPx * 0.45).toFloat()), paint)
                        paint.alpha = 255; paint.color = android.graphics.Color.WHITE
                        nc.drawCircle(q.x.toFloat(), q.y.toFloat(), 22f, paint)
                        paint.color = colors.spot.toArgb()
                        nc.drawCircle(q.x.toFloat(), q.y.toFloat(), 15f, paint)
                    }
                }
                if (blockPx > 60) {
                    text.textSize = 34f
                    text.textAlign = Paint.Align.CENTER
                    for ((name, at, below) in labels) {
                        val q = camera.project(GlobeCamera.deg(at.lat), GlobeCamera.deg(at.lng), cx, cy)
                        if (!q.visible) continue
                        // The spot's own area name sits under the "you are here" dot.
                        val y = q.y.toFloat() + if (below) (blockPx * 0.55).toFloat() else 0f
                        val tw = text.measureText(name) + 36f
                        paint.style = Paint.Style.FILL
                        paint.color = colors.labelHalo.toArgb(); paint.alpha = 190
                        nc.drawRoundRect(q.x.toFloat() - tw / 2, y - 30f, q.x.toFloat() + tw / 2, y + 30f, 30f, 30f, paint)
                        paint.alpha = 255
                        text.color = colors.label.toArgb()
                        nc.drawText(name, q.x.toFloat(), y + 12f, text)
                    }
                }
            }
        }
    }
}

private fun worstOf(states: Collection<CellState>): CellState =
    listOf(CellState.CONFIRMED, CellState.POSSIBLE, CellState.RESTORED, CellState.NORMAL).firstOrNull { it in states } ?: CellState.NO_DATA
