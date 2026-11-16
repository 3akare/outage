package app.outage.map

import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * The globe's maths (ADR 0051), the same as web/ui/globe/globe.ts. Pure Kotlin, no Android, so it is tested on the JVM.
 * Orthographic projection: a point on the sphere is seen from far away straight above [lat], [lon].
 * https://mathworld.wolfram.com/OrthographicProjection.html
 * Angles are radians. [radiusPx] is the globe's radius on screen, so it is also "pixels per radian" at the centre.
 */
data class GlobeCamera(val lat: Double, val lon: Double, val radiusPx: Double) {
    /** Where a point lands on screen around ([cx], [cy]), and how much it faces the viewer: > 0 is the near side. */
    fun project(latRad: Double, lngRad: Double, cx: Double, cy: Double): Projected {
        val sp = sin(latRad)
        val cp = cos(latRad)
        val d = lngRad - lon
        val cd = cos(d)
        val s0 = sin(lat)
        val c0 = cos(lat)
        return Projected(cx + radiusPx * cp * sin(d), cy - radiusPx * (c0 * sp - s0 * cp * cd), s0 * sp + c0 * cp * cd)
    }

    /** Turn by a drag of [dx], [dy] pixels. Near the ground this pans; far away it spins the Earth. */
    fun dragBy(dx: Double, dy: Double): GlobeCamera = copy(lon = lon - dx / radiusPx, lat = (lat + dy / radiusPx).coerceIn(-MAX_TILT, MAX_TILT))

    fun zoomBy(k: Double, minPx: Double, maxPx: Double): GlobeCamera = copy(radiusPx = (radiusPx * k).coerceIn(minPx, maxPx))

    companion object {
        const val EARTH_KM = 6371.0
        const val MAX_TILT = 1.3
        fun deg(d: Double) = d * PI / 180

        /** The radius that shows [km] across [widthPx]. */
        fun radiusFor(km: Double, widthPx: Double) = widthPx * EARTH_KM / km
    }
}

data class Projected(val x: Double, val y: Double, val facing: Double) {
    val visible get() = facing > 0
}

/**
 * A flight from one camera to another, like a maps app: turn and zoom together, with a dip out and back in when the
 * places are far apart. [at] gives the camera at time 0..1 (eased).
 */
class GlobeFlight(private val from: GlobeCamera, to: GlobeCamera) {
    private val toLat = to.lat
    private val dLon: Double
    private val fromLog = ln(from.radiusPx)
    private val toLog = ln(to.radiusPx)
    private val bump: Double

    init {
        var d = to.lon - from.lon
        while (d > PI) d -= 2 * PI
        while (d < -PI) d += 2 * PI
        dLon = d
        val dist = acos((sin(from.lat) * sin(to.lat) + cos(from.lat) * cos(to.lat) * cos(d)).coerceIn(-1.0, 1.0))
        bump = min(2.2, dist * 1.4 + if (to.radiusPx > from.radiusPx * 20) 1.2 else 0.0)
    }

    fun at(t: Double): GlobeCamera {
        val k = t.coerceIn(0.0, 1.0)
        val e = if (k < 0.5) 4 * k * k * k else 1 - (-2 * k + 2).pow(3) / 2
        return GlobeCamera(
            lat = from.lat + (toLat - from.lat) * e,
            lon = from.lon + dLon * e,
            radiusPx = exp(fromLog + (toLog - fromLog) * e - bump * sin(PI * e)),
        )
    }
}

object GlobeMath {
    /** Point in polygon (even-odd), for taps on a block. */
    fun inside(x: Double, y: Double, xs: DoubleArray, ys: DoubleArray): Boolean {
        var c = false
        var j = xs.size - 1
        for (i in xs.indices) {
            if ((ys[i] > y) != (ys[j] > y) && x < (xs[j] - xs[i]) * (y - ys[i]) / (ys[j] - ys[i]) + xs[i]) c = !c
            j = i
        }
        return c
    }

    /** How strongly land dots show: full on the whole Earth, gone at street level. [zoom] is radius over the resting radius. */
    fun dotFade(zoom: Double): Double = max(0.0, min(1.0, 1 - (zoom - 8) / 14))

    /** On-screen width of a block whose ring is [ring], for a camera radius of [radiusPx]. */
    fun blockPx(ring: List<LatLng>, radiusPx: Double): Double {
        if (ring.size < 4) return 0.0
        val a = ring[0]
        val b = ring[ring.size / 2]
        val dLat = GlobeCamera.deg(a.lat - b.lat)
        val dLng = GlobeCamera.deg(a.lng - b.lng) * cos(GlobeCamera.deg(a.lat))
        return radiusPx * kotlin.math.hypot(dLat, dLng)
    }
}
