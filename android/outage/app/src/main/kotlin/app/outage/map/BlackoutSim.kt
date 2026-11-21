package app.outage.map

import app.outage.demo.ReplayFile
import app.outage.demo.ReplayFrame
import app.outage.places.Places
import app.outage.places.PlacesGeo
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot

/**
 * The simulated blackout of the Map tab, a port of the website's web/public/js/places.js (targetBlocks) and web/public/js/app.js
 * (setSpotArea, gap). Pure Kotlin, so JUnit checks it. Ids here are bare H3 indexes, as in the places files.
 */
class BlackoutSim(private val places: Places, private val geo: PlacesGeo) {
    private val centres: Map<String, LatLng> = geo.cells.keys.associateWith { geo.centre(it)!! }

    /** The blocks next door to [id], nearest first: centres closer than 1.1 km (the res-8 grid has them about 0.9 km apart). */
    fun neighbours(id: String): List<String> {
        val c = centres[id] ?: return emptyList()
        val cos = cos(Math.toRadians(c.lat))
        return centres.entries.asSequence()
            .filter { it.key != id && abs(it.value.lat - c.lat) * KM < NEAR_KM && abs(it.value.lng - c.lng) * KM * cos < NEAR_KM }
            .map { it.key to hypot((it.value.lat - c.lat) * KM, (it.value.lng - c.lng) * KM * cos) }
            .filter { it.second < NEAR_KM }
            .sortedBy { it.second }
            .map { it.first }
            .toList()
    }

    /** The own blocks of an LGA or a ward (a ward with none of its own gets its anchor). Empty for an unknown slug. */
    fun areaCells(slug: String): List<String> =
        places.lga(slug)?.cells ?: places.ward(slug)?.let { w -> w.cells.ifEmpty { listOf(w.anchor) } }.orEmpty()

    /**
     * The blocks a blackout runs on, the spot first and the rest nearest first. A block ([cell] set) gets itself and the blocks
     * next door; a ward or an LGA gets all of its own blocks, starting from the one nearest its middle.
     */
    fun targetBlocks(slug: String, cell: String? = null): List<String> {
        if (cell != null) return listOf(cell) + neighbours(cell)
        val own = areaCells(slug).filter { it in centres }
        if (own.isEmpty()) return emptyList()
        val lat = own.sumOf { centres.getValue(it).lat } / own.size
        val lng = own.sumOf { centres.getValue(it).lng } / own.size
        fun d2(id: String) = centres.getValue(id).let { (it.lat - lat) * (it.lat - lat) + (it.lng - lng) * (it.lng - lng) }
        val middle = own.minBy(::d2)
        val cos = cos(Math.toRadians(centres.getValue(middle).lat))
        val m = centres.getValue(middle)
        fun dist(id: String) = centres.getValue(id).let { hypot(it.lat - m.lat, (it.lng - m.lng) * cos) }
        return listOf(middle) + own.filter { it != middle }.sortedBy(::dist)
    }

    companion object {
        private const val KM = 111.32
        private const val NEAR_KM = 1.1

        /** The state a replay frame shows: the four public states, and anything else (SPOT_ONLY) counts as on, as on the website. */
        fun stateOf(frameState: String): CellState = when (frameState) {
            "POSSIBLE" -> CellState.POSSIBLE
            "CONFIRMED" -> CellState.CONFIRMED
            "RESTORED" -> CellState.RESTORED
            else -> CellState.NORMAL
        }

        /** The first frame where something is happening: the replay's quiet start is skipped. -1 when there is none. */
        fun firstFrame(replay: ReplayFile): Int =
            replay.frames.indexOfFirst { stateOf(it.state) == CellState.POSSIBLE || stateOf(it.state) == CellState.CONFIRMED }

        /** Wait before the frame after [a], as in the website's replay: long quiet gaps become 2.6 s, short ones 420 to 1100 ms. */
        fun gapMs(a: ReplayFrame, b: ReplayFrame): Long {
            val g = b.tMs - a.tMs
            val min = if (stateOf(a.state) == CellState.POSSIBLE) 900L else 420L
            return if (g > 5000) 2600L else minOf(1100L, maxOf(min, g))
        }

        /**
         * What the chosen blocks show at [s]: the first block gets it. When it is POSSIBLE only the next two blocks join it and the
         * rest stay on; otherwise all of them follow. [blocks] are bare H3 indexes, the result is keyed the same way.
         */
        fun spread(blocks: List<String>, s: CellState): Map<String, CellState> {
            if (blocks.isEmpty()) return emptyMap()
            val rest = blocks.drop(1)
            val near = if (s == CellState.POSSIBLE) minOf(2, rest.size) else rest.size
            val out = LinkedHashMap<String, CellState>()
            out[blocks[0]] = s
            rest.forEachIndexed { i, id -> out[id] = if (i < near) s else CellState.NORMAL }
            return out
        }
    }
}
