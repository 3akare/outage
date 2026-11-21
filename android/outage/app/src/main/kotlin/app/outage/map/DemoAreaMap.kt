package app.outage.map

import app.outage.places.Places
import app.outage.places.PlacesGeo

/** The bundled files the demo map is made from: the 20 LGAs, every block's outline, and each block's made-up state. */
class LagosDemoData(val places: Places, val geo: PlacesGeo, val states: Map<String, CellState>)

/**
 * A labelled sample map for demo mode and judges (R5, demo-mode.md, ADR 0052): every one of the 4,968 Lagos blocks as a real
 * H3 resolution-8 hexagon, with the made-up power states of `core/shared/fixtures/places/lagos-states.json` (the same file the
 * website reads), grouped into the 20 local governments. Every object is simulated and the map says so. Cell ids are "sim-" plus
 * the H3 index, so they can never be saved or sent as a real spot.
 */
object DemoAreaMap {
    const val CITY = "lagos"
    const val PREFIX = "sim-"

    /** The H3 index inside a demo cell id (the key into the places files). */
    fun h3(id: String): String = id.removePrefix(PREFIX)

    fun build(nowMs: Long, data: LagosDemoData): AreaMap {
        val hour = 3_600_000L
        val lgaOf = HashMap<String, String>()
        for (l in data.places.lgas) for (c in l.cells) lgaOf[c] = l.slug
        val cells = data.geo.cells.map { (h, ring) ->
            val state = data.states[h] ?: CellState.NO_DATA
            val since = when (state) {
                CellState.CONFIRMED -> nowMs - 2 * hour
                CellState.POSSIBLE -> nowMs - hour / 4
                else -> null
            }
            val restored = if (state == CellState.RESTORED) nowMs - 3 * hour else null
            val history = if (state == CellState.NO_DATA) emptyList() else listOf(
                OutageSpan(nowMs - 26 * hour, nowMs - 24 * hour, CellState.CONFIRMED),
                OutageSpan(nowMs - 120 * hour, nowMs - 117 * hour, CellState.CONFIRMED),
            )
            MapCell(PREFIX + h, lgaOf[h] ?: "", state, since, restored, history, ring)
        }
        val ids = cells.groupBy({ it.areaSlug }, { it.id })
        val areas = data.places.lgas.map { l -> MapArea(l.slug, l.name, PREFIX + l.centreCell, ids[l.slug].orEmpty()) }
        return AreaMap(CITY, nowMs, simulated = true, areas = areas, cells = cells)
    }
}
