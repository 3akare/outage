package app.outage.map

/**
 * A labelled sample map for demo mode and judges (R5, demo-mode.md, ADR 0052): real Lagos areas at their real places,
 * as real H3 resolution-8 blocks, with made-up power states. The data is generated into [DemoCity] from the catalog
 * by tools/sim/scripts/build-demo-city.mjs, the same file the web's app in the browser reads. Every object is simulated
 * and the map says so. Cell ids start with "sim-", so they can never be saved or sent as a real spot.
 */
object DemoAreaMap {
    const val CITY = "lagos"

    fun build(nowMs: Long): AreaMap {
        val hour = 3_600_000L
        val cells = DemoCity.cells.map { c ->
            val since = when (c.state) {
                CellState.CONFIRMED -> nowMs - 2 * hour
                CellState.POSSIBLE -> nowMs - hour / 4
                else -> null
            }
            val restored = if (c.state == CellState.RESTORED) nowMs - 3 * hour else null
            val history = if (c.state == CellState.NO_DATA) emptyList() else listOf(
                OutageSpan(nowMs - 26 * hour, nowMs - 24 * hour, CellState.CONFIRMED),
                OutageSpan(nowMs - 120 * hour, nowMs - 117 * hour, CellState.CONFIRMED),
            )
            val ring = (c.ring.indices step 2).map { i -> LatLng(c.ring[i], c.ring[i + 1]) }
            MapCell(c.id, c.area, c.state, since, restored, history, ring)
        }
        val areas = DemoCity.areas.map { a -> MapArea(a.slug, a.name, a.centre, cells.filter { it.areaSlug == a.slug }.map { it.id }) }
        return AreaMap(CITY, nowMs, simulated = true, areas = areas, cells = cells)
    }
}
