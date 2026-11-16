package app.outage.map

/**
 * Pure model for the Area map (spec app-map-insights design section 3). No Android imports so JUnit 4 runs it
 * on the JVM. The model carries no member count and no device id: the Worker applies the 3-phone floor
 * (ADR 0007) and the parser re-applies it as a second guard (property AM1).
 */
data class LatLng(val lat: Double, val lng: Double)

enum class CellState { NORMAL, POSSIBLE, CONFIRMED, RESTORED, NO_DATA }

data class OutageSpan(val startMs: Long, val endMs: Long?, val level: CellState)

data class MapCell(
    val id: String,
    val areaSlug: String,
    val state: CellState,
    val sinceMs: Long?,
    val restoredMs: Long?,
    val history: List<OutageSpan>,
    val ring: List<LatLng>,
)

data class MapArea(val slug: String, val name: String, val centreCell: String, val cellIds: List<String>)

data class AreaMap(
    val city: String,
    val generatedMs: Long,
    val simulated: Boolean,
    val areas: List<MapArea>,
    val cells: List<MapCell>,
) {
    fun cell(id: String): MapCell? = cells.firstOrNull { it.id == id }
    fun area(slug: String): MapArea? = areas.firstOrNull { it.slug == slug }
}

object CellStates {
    /** ADR 0007: a cell with fewer than this many phones shows no state. */
    const val MEMBER_FLOOR = 3

    /** RESTORED returns to NORMAL after 24 hours (R2.4). */
    const val RESTORED_HOLD_MS = 24L * 60 * 60 * 1000

    /** Names used in the public JSON. Unknown or missing names are NO_DATA, never NORMAL. */
    fun fromPublic(name: String?): CellState = when (name) {
        "NORMAL" -> CellState.NORMAL
        "POSSIBLE" -> CellState.POSSIBLE
        "CONFIRMED" -> CellState.CONFIRMED
        "RESTORED" -> CellState.RESTORED
        else -> CellState.NO_DATA
    }

    /** The floor rule: fewer than 3 members (or an unknown count) is NO_DATA. A null count means the server already applied it. */
    fun withFloor(state: CellState, members: Int?): CellState =
        if (members != null && members < MEMBER_FLOOR) CellState.NO_DATA else state

    /** The state to draw at [nowMs]: RESTORED expires to NORMAL after 24 hours. */
    fun effective(cell: MapCell, nowMs: Long): CellState {
        if (cell.state != CellState.RESTORED) return cell.state
        val at = cell.restoredMs ?: return CellState.NORMAL
        return if (nowMs - at >= RESTORED_HOLD_MS) CellState.NORMAL else CellState.RESTORED
    }
}
