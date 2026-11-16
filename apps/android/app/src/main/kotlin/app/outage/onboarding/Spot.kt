package app.outage.onboarding

import app.outage.map.AreaMap
import app.outage.map.HexGrid
import app.outage.map.LatLng
import app.outage.map.MapProjection
import app.outage.map.WorldPoint
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.hypot

/** What the user's spot becomes: the cell and its area name. No coordinate is kept anywhere (onboarding R3.3, O2). */
data class SpotChoice(val cell: String, val areaName: String?, val needsConfirm: Boolean)

/**
 * Turns one position into a cell of the published map (onboarding R3.2). The map already carries every cell's outline,
 * so no H3 library is needed on the phone. The position is a parameter of [resolve] only: this class has no field that
 * could hold it. A position farther than [MAX_KM] from every cell gives null and the screen offers the map pick (R3.4).
 */
object Spot {
    /** Farther than this from the nearest cell is "not in a mapped area". */
    const val MAX_KM = 3.0
    private const val KM_PER_DEG = 111.32

    fun resolve(map: AreaMap, lat: Double, lng: Double, mocked: Boolean): SpotChoice? {
        if (map.cells.isEmpty() || lat.isNaN() || lng.isNaN()) return null
        val grid = HexGrid.build(map, MapProjection.forCells(map.cells))
        val here: WorldPoint = grid.projection.project(LatLng(lat, lng))
        val hit = grid.hitTest(here)
        val cell = hit ?: grid.shapes.minByOrNull { hypot(it.centre.x - here.x, it.centre.y - here.y) }
            ?.takeIf { hypot(it.centre.x - here.x, it.centre.y - here.y) * KM_PER_DEG <= MAX_KM }
            ?.cell
            ?: return null
        return choose(map, cell.id, needsConfirm = mocked)
    }

    /** A cell tapped on the map pick. Returns null for an id the map does not contain. */
    fun choose(map: AreaMap, cellId: String, needsConfirm: Boolean = false): SpotChoice? {
        val cell = map.cell(cellId) ?: return null
        return SpotChoice(cell.id, map.area(cell.areaSlug)?.name, needsConfirm)
    }

    /** The cells of one neighbourhood for the hex grid step of the map pick (R3.5). */
    fun cellsOf(map: AreaMap, areaSlug: String) = map.cells.filter { it.areaSlug == areaSlug }

    /** A cell id the Worker accepts. Cells of the labelled sample map are not real and cannot be saved as a spot. */
    fun isRealCell(cellId: String): Boolean = OnboardingFlow.isCell(cellId)
}

/**
 * The first position that arrives wins; later ones are ignored (onboarding R3.4: last known and a fresh fix race, the
 * screen waits at most [TIMEOUT_MS]). The caller feeds [offer] from any thread and polls [result].
 */
class FirstResult<T : Any> {
    private val ref = AtomicReference<T?>(null)
    fun offer(value: T): Boolean = ref.compareAndSet(null, value)
    fun result(): T? = ref.get()

    companion object {
        const val TIMEOUT_MS = 8_000L

        /** A cached position older than this is not used as a first result. */
        const val MAX_FIX_AGE_MS = 10 * 60_000L
    }
}

/** A position for the length of one call. Not persisted, not logged. */
class Fix(val lat: Double, val lng: Double, val mocked: Boolean)
