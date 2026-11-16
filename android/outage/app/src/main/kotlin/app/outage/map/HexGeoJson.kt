package app.outage.map

import java.util.Locale

/**
 * The hex grid as GeoJSON for the map's data source (ADR 0053). Pure Kotlin, no Android or MapLibre types, so JUnit
 * checks it on the JVM. Each cell is one Polygon Feature with its id, area and drawn state as properties; the map's fill
 * and line layers colour it by `state`. GeoJSON positions are [longitude, latitude] and a ring is closed (first point
 * repeated last): RFC 7946 sections 3.1.1 and 3.1.6, https://datatracker.ietf.org/doc/html/rfc7946
 */
object HexGeoJson {
    const val PROP_ID = "id"
    const val PROP_AREA = "area"
    const val PROP_STATE = "state"
    const val PROP_SPOT = "spot"

    /** Every cell with a ring, as a FeatureCollection. [states] overrides each cell's own state (live replay, RESTORED expiry). */
    fun cells(cells: List<MapCell>, states: Map<String, CellState>, spotId: String?): String {
        val sb = StringBuilder("{\"type\":\"FeatureCollection\",\"features\":[")
        var first = true
        for (c in cells) {
            if (c.ring.size < 3) continue
            if (!first) sb.append(',')
            first = false
            sb.append("{\"type\":\"Feature\",\"id\":").append(quote(c.id))
            sb.append(",\"properties\":{")
            sb.append(quote(PROP_ID)).append(':').append(quote(c.id)).append(',')
            sb.append(quote(PROP_AREA)).append(':').append(quote(c.areaSlug)).append(',')
            sb.append(quote(PROP_STATE)).append(':').append(quote((states[c.id] ?: c.state).name)).append(',')
            sb.append(quote(PROP_SPOT)).append(':').append(c.id == spotId)
            sb.append("},\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[")
            val ring = if (c.ring.first() == c.ring.last()) c.ring else c.ring + c.ring.first()
            ring.forEachIndexed { i, p ->
                if (i > 0) sb.append(',')
                sb.append('[').append(num(p.lng)).append(',').append(num(p.lat)).append(']')
            }
            sb.append("]]}}")
        }
        return sb.append("]}").toString()
    }

    /** One Point Feature at [at] (the spot marker), or an empty collection when there is no spot. */
    fun point(at: LatLng?): String =
        if (at == null) "{\"type\":\"FeatureCollection\",\"features\":[]}"
        else "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"properties\":{},\"geometry\":{\"type\":\"Point\",\"coordinates\":[${num(at.lng)},${num(at.lat)}]}}]}"

    /** The middle of a cell: the mean of its corners (close enough for a hexagon a few hundred metres across). */
    fun centre(cell: MapCell): LatLng = LatLng(cell.ring.sumOf { it.lat } / cell.ring.size, cell.ring.sumOf { it.lng } / cell.ring.size)

    private fun num(d: Double): String = String.format(Locale.ROOT, "%.6f", d).trimEnd('0').trimEnd('.')

    private fun quote(s: String): String {
        val sb = StringBuilder("\"")
        for (ch in s) when {
            ch == '"' -> sb.append("\\\"")
            ch == '\\' -> sb.append("\\\\")
            ch < ' ' -> sb.append(String.format(Locale.ROOT, "\\u%04x", ch.code))
            else -> sb.append(ch)
        }
        return sb.append('"').toString()
    }
}
