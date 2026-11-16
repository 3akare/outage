package app.outage.map

import app.outage.onboarding.MiniJson

/**
 * Reads the public map JSON (`GET /api/map.json`, design section 3) into an [AreaMap]. Strict shape,
 * but a bad document gives null from [parseOrNull] so the screen can keep its cache (design section 8).
 * If a cell carries a `members` number the floor is applied and the number is dropped (AM1).
 */
object AreaMapParser {
    fun parseOrNull(text: String): AreaMap? = try { parse(text) } catch (_: IllegalArgumentException) { null }

    fun parse(text: String): AreaMap {
        val root = obj(MiniJson.parse(text), "root")
        val cells = list(root, "cells").map { readCell(obj(it, "cell")) }
        require(cells.map { it.id }.toSet().size == cells.size) { "duplicate cell id" }
        return AreaMap(
            city = str(root, "city"),
            generatedMs = long(root, "generatedMs"),
            simulated = root["simulated"] as? Boolean ?: false,
            areas = list(root, "areas").map { readArea(obj(it, "area")) },
            cells = cells,
        )
    }

    private fun readArea(m: Map<String, Any?>) = MapArea(
        slug = str(m, "slug"),
        name = str(m, "name"),
        centreCell = str(m, "centreCell"),
        cellIds = list(m, "cells").map { it as? String ?: throw IllegalArgumentException("cells item") },
    )

    private fun readCell(m: Map<String, Any?>): MapCell {
        val members = (m["members"] as? Double)?.toInt()
        val state = CellStates.withFloor(CellStates.fromPublic(m["state"] as? String), members)
        val noData = state == CellState.NO_DATA
        val ring = list(m, "ring").map {
            val p = it as? List<*> ?: throw IllegalArgumentException("ring point")
            require(p.size == 2) { "ring point size" }
            LatLng((p[0] as? Double) ?: throw IllegalArgumentException("lat"), (p[1] as? Double) ?: throw IllegalArgumentException("lng"))
        }
        require(ring.size >= 3) { "ring needs 3 or more points" }
        return MapCell(
            id = str(m, "id"),
            areaSlug = str(m, "area"),
            state = state,
            // A NO_DATA cell shows nothing but its outline (ADR 0007).
            sinceMs = if (noData) null else (m["sinceMs"] as? Double)?.toLong(),
            restoredMs = if (noData) null else (m["restoredMs"] as? Double)?.toLong(),
            history = if (noData) emptyList() else readHistory(m["history30d"]),
            ring = ring,
        )
    }

    private fun readHistory(v: Any?): List<OutageSpan> {
        val items = v as? List<*> ?: return emptyList()
        return items.map {
            val o = obj(it, "history item")
            OutageSpan(long(o, "startMs"), (o["endMs"] as? Double)?.toLong(), CellStates.fromPublic(o["level"] as? String))
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun obj(v: Any?, what: String): Map<String, Any?> =
        v as? Map<String, Any?> ?: throw IllegalArgumentException("$what is not an object")
    private fun str(m: Map<String, Any?>, k: String): String = m[k] as? String ?: throw IllegalArgumentException("$k is not text")
    private fun long(m: Map<String, Any?>, k: String): Long = (m[k] as? Double)?.toLong() ?: throw IllegalArgumentException("$k is not a number")
    private fun list(m: Map<String, Any?>, k: String): List<Any?> = m[k] as? List<*> ?: throw IllegalArgumentException("$k is not a list")
}
