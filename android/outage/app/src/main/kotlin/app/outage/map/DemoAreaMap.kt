package app.outage.map

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sqrt

/**
 * A labelled sample map for demo mode and judges (R5, demo-mode.md): Yaba and neighbours around Lagos, 21 hexes,
 * mixed states. Every object is simulated and the map says so. Cell ids start with "sim-" so they can never be
 * mistaken for H3 ids. Hexes are generated on an axial grid sized like H3 res 8 (edge about 0.46 km); no H3 library.
 */
object DemoAreaMap {
    const val CITY = "lagos"
    private const val LAT0 = 6.5158
    private const val LNG0 = 3.3711
    private const val EDGE_KM = 0.46
    private const val KM_PER_DEG = 111.32

    /** Axial (q, r) hexes: a centre, ring 1 (6) and ring 2 (12) plus two outliers = 21. */
    private val axial: List<Pair<Int, Int>> = buildList {
        for (q in -2..2) for (r in -2..2) if (kotlin.math.abs(q + r) <= 2) add(q to r)
        add(3 to -1)
        add(-3 to 1)
    }

    private val areaOf = mapOf(
        "yaba" to listOf(0 to 0, 1 to 0, 0 to 1, -1 to 1, -1 to 0, 0 to -1, 1 to -1),
        "surulere" to listOf(-2 to 2, -1 to 2, -2 to 1, 0 to 2, -3 to 1),
        "ikeja" to listOf(1 to -2, 2 to -2, 0 to -2, 2 to -1, 3 to -1),
        "lekki" to listOf(2 to 0, 1 to 1, -2 to 0),
    )

    private val states: Map<Pair<Int, Int>, CellState> = mapOf(
        (0 to 0) to CellState.CONFIRMED, (1 to 0) to CellState.CONFIRMED, (0 to -1) to CellState.POSSIBLE,
        (-1 to 0) to CellState.NORMAL, (0 to 1) to CellState.NORMAL, (-1 to 1) to CellState.RESTORED,
        (1 to -1) to CellState.NORMAL, (-2 to 2) to CellState.NORMAL, (-1 to 2) to CellState.NO_DATA,
        (-2 to 1) to CellState.NORMAL, (0 to 2) to CellState.NORMAL, (-3 to 1) to CellState.NO_DATA,
        (1 to -2) to CellState.POSSIBLE, (2 to -2) to CellState.NO_DATA, (0 to -2) to CellState.NORMAL,
        (2 to -1) to CellState.CONFIRMED, (3 to -1) to CellState.NO_DATA, (2 to 0) to CellState.NORMAL,
        (1 to 1) to CellState.NORMAL, (-2 to 0) to CellState.NORMAL,
    )

    private fun id(q: Int, r: Int) = "sim-$q,$r"

    private fun ring(q: Int, r: Int): List<LatLng> {
        // Pointy-top hex. Centre in km east/north, then to degrees.
        val cxKm = EDGE_KM * sqrt(3.0) * (q + r / 2.0)
        val cyKm = -EDGE_KM * 1.5 * r
        val kLng = KM_PER_DEG * cos(LAT0 * PI / 180.0)
        return (0 until 6).map { i ->
            val a = PI / 180.0 * (60.0 * i - 30.0)
            val x = cxKm + EDGE_KM * cos(a)
            val y = cyKm + EDGE_KM * kotlin.math.sin(a)
            LatLng(LAT0 + y / KM_PER_DEG, LNG0 + x / kLng)
        }
    }

    fun build(nowMs: Long): AreaMap {
        val hour = 3_600_000L
        val cells = axial.map { (q, r) ->
            val st = states[q to r] ?: CellState.NORMAL
            val slug = areaOf.entries.firstOrNull { (q to r) in it.value }?.key ?: "yaba"
            val since = when (st) {
                CellState.CONFIRMED -> nowMs - 2 * hour
                CellState.POSSIBLE -> nowMs - hour / 4
                else -> null
            }
            val restored = if (st == CellState.RESTORED) nowMs - 3 * hour else null
            val history = if (st == CellState.NO_DATA) emptyList() else listOf(
                OutageSpan(nowMs - 26 * hour, nowMs - 24 * hour, CellState.CONFIRMED),
                OutageSpan(nowMs - 120 * hour, nowMs - 117 * hour, CellState.CONFIRMED),
            )
            MapCell(id(q, r), slug, st, since, restored, history, ring(q, r))
        }
        val areas = listOf("yaba" to "Yaba", "surulere" to "Surulere", "ikeja" to "Ikeja", "lekki" to "Lekki").map { (slug, name) ->
            val own = cells.filter { it.areaSlug == slug }
            MapArea(slug, name, own.first().id, own.map { it.id })
        }
        return AreaMap(CITY, nowMs, simulated = true, areas = areas, cells = cells)
    }
}
