package app.outage.map

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** A point in world units: degrees of longitude scaled by cos(lat0) on x, degrees south of lat0 on y. */
data class WorldPoint(val x: Double, val y: Double)

data class WorldBounds(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double) {
    val width: Double get() = maxX - minX
    val height: Double get() = maxY - minY
    fun intersects(o: WorldBounds): Boolean = minX <= o.maxX && maxX >= o.minX && minY <= o.maxY && maxY >= o.minY
}

/**
 * Equirectangular projection around a city centre, as in web/areas/map-svg.ts:
 * x = (lng - lng0) * cos(lat0), y = lat0 - lat. The error over one city is negligible (design section 4).
 */
class MapProjection(val lat0: Double, val lng0: Double) {
    private val k = cos(lat0 * PI / 180.0)

    fun project(p: LatLng) = WorldPoint((p.lng - lng0) * k, lat0 - p.lat)
    fun unproject(w: WorldPoint) = LatLng(lat0 - w.y, w.x / k + lng0)

    companion object {
        /** Centred on the middle of all cell rings. */
        fun forCells(cells: List<MapCell>): MapProjection {
            val pts = cells.flatMap { it.ring }
            if (pts.isEmpty()) return MapProjection(0.0, 0.0)
            return MapProjection((pts.minOf { it.lat } + pts.maxOf { it.lat }) / 2, (pts.minOf { it.lng } + pts.maxOf { it.lng }) / 2)
        }
    }
}

/** One cell in world units, built once per data change (design section 4). */
class HexShape(val cell: MapCell, val points: List<WorldPoint>) {
    val centre: WorldPoint = WorldPoint(points.sumOf { it.x } / points.size, points.sumOf { it.y } / points.size)
    val bounds: WorldBounds = WorldBounds(points.minOf { it.x }, points.minOf { it.y }, points.maxOf { it.x }, points.maxOf { it.y })

    fun contains(p: WorldPoint): Boolean {
        if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) return false
        var inside = false
        var j = points.size - 1
        for (i in points.indices) {
            val a = points[i]
            val b = points[j]
            if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
            j = i
        }
        return inside
    }
}

/** All hexes of a map in world units, with hit testing. */
class HexGrid(val projection: MapProjection, val shapes: List<HexShape>) {
    val bounds: WorldBounds? = if (shapes.isEmpty()) null else WorldBounds(
        shapes.minOf { it.bounds.minX }, shapes.minOf { it.bounds.minY },
        shapes.maxOf { it.bounds.maxX }, shapes.maxOf { it.bounds.maxY },
    )

    fun shape(id: String): HexShape? = shapes.firstOrNull { it.cell.id == id }

    /** Nearest centre first, then a point-in-polygon check. Returns null outside every hex (AM4). */
    fun hitTest(p: WorldPoint): MapCell? {
        val near = shapes.minByOrNull { hypot(it.centre.x - p.x, it.centre.y - p.y) } ?: return null
        if (near.contains(p)) return near.cell
        // Neighbouring hexes share edges, so a point in an edge sliver can belong to a second-nearest one.
        return shapes.firstOrNull { it.contains(p) }?.cell
    }

    /** Only shapes whose bounds meet the view, so draw cost follows the visible set (R1.10). */
    fun visible(view: WorldBounds): List<HexShape> = shapes.filter { it.bounds.intersects(view) }

    companion object {
        fun build(map: AreaMap, projection: MapProjection = MapProjection.forCells(map.cells)): HexGrid =
            HexGrid(projection, map.cells.map { c -> HexShape(c, c.ring.map(projection::project)) })
    }
}

/** View size and zoom limits. Zoom is relative to the fit scale so limits hold for any city size. */
data class MapViewport(
    val bounds: WorldBounds,
    val viewW: Double,
    val viewH: Double,
    val minZoom: Double = 0.75,
    val maxZoom: Double = 32.0,
    val padding: Double = 16.0,
) {
    val fitScale: Double
        get() {
            val w = max(bounds.width, 1e-9)
            val h = max(bounds.height, 1e-9)
            return min((viewW - 2 * padding) / w, (viewH - 2 * padding) / h)
        }
    val minScale: Double get() = fitScale * minZoom
    val maxScale: Double get() = fitScale * maxZoom
}

/** screen = world * scale + offset. Pure and immutable; every operation returns a clamped transform. */
data class MapTransform(val scale: Double, val offsetX: Double, val offsetY: Double) {
    fun toScreen(p: WorldPoint) = WorldPoint(p.x * scale + offsetX, p.y * scale + offsetY)
    fun toWorld(sx: Double, sy: Double) = WorldPoint((sx - offsetX) / scale, (sy - offsetY) / scale)

    /** The world rectangle that the view currently shows. */
    fun visibleWorld(vp: MapViewport): WorldBounds {
        val a = toWorld(0.0, 0.0)
        val b = toWorld(vp.viewW, vp.viewH)
        return WorldBounds(a.x, a.y, b.x, b.y)
    }

    fun panBy(dx: Double, dy: Double, vp: MapViewport): MapTransform = MapTransform(scale, offsetX + dx, offsetY + dy).clamped(vp)

    /** Zoom by [factor] about screen point ([cx], [cy]); that point stays fixed unless the clamp has to move the map. */
    fun zoomAbout(cx: Double, cy: Double, factor: Double, vp: MapViewport): MapTransform {
        val s = (scale * factor).coerceIn(vp.minScale, vp.maxScale)
        val r = s / scale
        return MapTransform(s, cx - (cx - offsetX) * r, cy - (cy - offsetY) * r).clamped(vp)
    }

    /** Keeps the view centre inside the map bounds so the map can never leave the view (design section 4). */
    fun clamped(vp: MapViewport): MapTransform {
        val s = scale.coerceIn(vp.minScale, vp.maxScale)
        val b = vp.bounds
        val ox = offsetX.coerceIn(vp.viewW / 2 - b.maxX * s, vp.viewW / 2 - b.minX * s)
        val oy = offsetY.coerceIn(vp.viewH / 2 - b.maxY * s, vp.viewH / 2 - b.minY * s)
        return MapTransform(s, ox, oy)
    }

    companion object {
        /** Fits [bounds] in the view, or [focus] with a given zoom (relative to fit) when the spot view is wanted. */
        fun fitTo(vp: MapViewport): MapTransform {
            val s = vp.fitScale
            val cx = (vp.bounds.minX + vp.bounds.maxX) / 2
            val cy = (vp.bounds.minY + vp.bounds.maxY) / 2
            return MapTransform(s, vp.viewW / 2 - cx * s, vp.viewH / 2 - cy * s)
        }

        /** Centres on [focus] showing a world span of [spanWorld] across the narrower view side (R1.3: spot plus ring). */
        fun focusOn(focus: WorldPoint, spanWorld: Double, vp: MapViewport): MapTransform {
            val s = (min(vp.viewW, vp.viewH) / max(spanWorld, 1e-9)).coerceIn(vp.minScale, vp.maxScale)
            return MapTransform(s, vp.viewW / 2 - focus.x * s, vp.viewH / 2 - focus.y * s).clamped(vp)
        }
    }
}

/** Tiny helper so tests and callers compare doubles without repeating the tolerance. */
fun nearlyEqual(a: Double, b: Double, eps: Double = 1e-6): Boolean = abs(a - b) <= eps
